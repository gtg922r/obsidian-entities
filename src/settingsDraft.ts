import type { EntityProviderUserSettings } from "./Providers/EntityProvider";
import { cloneSettings } from "./settingsData";
import type { SettingsStore } from "./SettingsStore";

export type DraftResult = "accepted" | "unchanged" | "conflict" | "unavailable";

function equal(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

/** One scalar or whole-collection draft, independent of rendered controls and disk durability. */
export class SettingsFieldDraft<Value> {
	private baseline: Value;
	private draft: Value;
	private retired = false;
	result: DraftResult = "unchanged";

	constructor(private store: SettingsStore, readonly providerId: string, readonly key: string) {
		this.baseline = this.read();
		this.draft = cloneSettings(this.baseline);
	}

	/** Callers receive detached values; mutations must explicitly stage a replacement. */
	get value(): Value { return cloneSettings(this.draft); }
	get dirty(): boolean { return !equal(this.draft, this.baseline); }
	get active(): boolean { return !this.retired && !this.store.isReadOnly && this.provider() !== undefined; }

	private provider(): EntityProviderUserSettings | undefined {
		return this.store.settings.providerSettings.find(provider => provider.providerInstanceId === this.providerId);
	}

	private read(): Value {
		return cloneSettings((this.provider() as unknown as Record<string, unknown> | undefined)?.[this.key]) as Value;
	}

	stage(value: Value): void {
		if (this.active) this.draft = cloneSettings(value);
	}

	/** Clean fields may follow canonical state; rejected/pending values keep their original baseline. */
	refresh(): void {
		if (this.active && !this.dirty) this.reload();
	}

	/** Explicitly discard this draft and read canonical state. */
	reload(): void {
		if (!this.active) return;
		this.baseline = this.read();
		this.draft = cloneSettings(this.baseline);
		this.result = "unchanged";
	}

	/** Apply R1 comparisons before mutation; only canonical acceptance advances the baseline. */
	apply(): DraftResult {
		if (!this.active) return this.result = "unavailable";
		if (!this.dirty) return this.result = "unchanged";
		const canonical = this.read();
		if (!equal(canonical, this.baseline) && !equal(canonical, this.draft)) return this.result = "conflict";
		if (!equal(canonical, this.draft) && !this.store.updateProvider(this.providerId, {
			[this.key]: cloneSettings(this.draft),
		})) return this.result = "unavailable";
		this.baseline = cloneSettings(this.draft);
		return this.result = "accepted";
	}

	/** Child operations capture the original baseline, including an already rejected draft. */
	fork(): SettingsFieldDraft<Value> {
		const child = new SettingsFieldDraft<Value>(this.store, this.providerId, this.key);
		child.baseline = cloneSettings(this.baseline);
		child.draft = cloneSettings(this.draft);
		child.result = this.result;
		if (!this.active) child.retire();
		return child;
	}

	/** A deleted provider or closed tab cannot be restored by a retained callback. */
	retire(): void { this.retired = true; }
}

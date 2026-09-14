import type { App, PluginManifest } from "obsidian";
import type { EntitiesSettings } from "./entities.types";
import { createProviderInstanceId } from "./settingsData";

/** Exact adapter content; an absent file is distinct from any JSON value. */
export type SettingsDiskSnapshot = { readonly kind: "missing" } | { readonly kind: "file"; readonly raw: string };

/** Strict settings IO used by the store's observation and write coordination. */
export interface SettingsPersistence {
	readSnapshot(): Promise<SettingsDiskSnapshot>;
	writeSnapshot(raw: string): Promise<void>;
	backupSnapshot(raw: string, reason: "migration" | "external-recovery"): Promise<void>;
}

/** Encode one settings value consistently for write and echo comparison. */
export function encodeSettings(value: unknown): string {
	const raw = JSON.stringify(value, null, "\t");
	if (raw === undefined) throw new Error("Settings cannot be encoded as JSON.");
	return raw;
}

/** Parse captured content without exposing it in invalid-JSON diagnostics. */
export function parseSettingsSnapshot(snapshot: SettingsDiskSnapshot): unknown {
	if (snapshot.kind === "missing") return undefined;
	try {
		return JSON.parse(snapshot.raw) as unknown;
	} catch {
		throw new Error("Saved settings contain invalid JSON. Restore or repair the file, then retry.");
	}
}

/** Settings IO must propagate adapter failures instead of treating them as success. */
export class SettingsStorage implements SettingsPersistence {
	constructor(private readonly app: App, private readonly manifest: PluginManifest) {}

	private directory(): string {
		const dir = this.manifest.dir;
		const pluginRoot = `${this.app.vault.configDir}/plugins/`;
		if (!dir || !dir.startsWith(pluginRoot) || dir.startsWith("/") || /[:\\]/.test(dir) ||
			dir.split("/").some(part => !part || part === "." || part === "..") ||
			dir.slice(pluginRoot.length).includes("/")) {
			throw new Error("Cannot locate a vault-relative plugin directory for settings.");
		}
		return dir;
	}

	/** Only an explicit absent stat means missing; every other IO failure propagates. */
	async readSnapshot(): Promise<SettingsDiskSnapshot> {
		const path = `${this.directory()}/data.json`;
		const adapter = this.app.vault.adapter;
		// exists() also returns false on permission/IO failures in host adapters.
		const stat = await adapter.stat(path);
		if (stat === null) return { kind: "missing" };
		if (!stat || stat.type !== "file") throw new Error("The settings path is not a readable file.");
		const raw = await adapter.read(path);
		if (typeof raw !== "string") throw new Error("The settings file could not be read as text.");
		return { kind: "file", raw };
	}

	async writeSnapshot(raw: string): Promise<void> {
		await this.app.vault.adapter.write(`${this.directory()}/data.json`, raw);
	}

	/** Preserve exact captured content; collision checks do not promise atomic creation. */
	async backupSnapshot(raw: string, reason: "migration" | "external-recovery"): Promise<void> {
		const prefix = reason === "migration" ? "data.before-settings-v1" : "data.before-external-reconcile";
		const path = `${this.directory()}/${prefix}-${createProviderInstanceId()}.json`;
		const adapter = this.app.vault.adapter;
		if (await adapter.stat(path) !== null) throw new Error("Settings backup already exists. Retry loading settings.");
		await adapter.write(path, raw);
	}

	/** Compatibility entry point for settings callers that do not yet retain raw snapshots. */
	async read(): Promise<unknown> {
		return parseSettingsSnapshot(await this.readSnapshot());
	}

	async write(settings: EntitiesSettings): Promise<void> {
		await this.writeSnapshot(encodeSettings(settings));
	}

	/** Compatibility backup for callers that retain only parsed original values. */
	async backup(original: unknown): Promise<void> {
		await this.backupSnapshot(encodeSettings(original), "migration");
	}
}

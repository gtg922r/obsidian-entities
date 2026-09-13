import type { EntitiesSettings } from "./entities.types";
import type { ConfiguredProviderSettings, EntityProviderUserSettings } from "./Providers/EntityProvider";
import { cloneSettings, createProviderInstanceId } from "./settingsData";

type DefaultsForType = (providerTypeID: string) => EntityProviderUserSettings | undefined;

/** A failed load must leave the saved document untouched until the user retries. */
export type SettingsLoadResult =
	| { ok: true; settings: EntitiesSettings; changed: boolean }
	| { ok: false; error: Error };

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isJsonData(value: unknown, ancestors = new Set<unknown>()): boolean {
	if (value === null || typeof value === "string" || typeof value === "boolean") return true;
	if (typeof value === "number") return Number.isFinite(value);
	if (!isRecord(value) && !Array.isArray(value)) return false;
	if (ancestors.has(value)) return false;
	ancestors.add(value);
	const valid = Object.values(value).every(item => isJsonData(item, ancestors));
	ancestors.delete(value);
	return valid;
}

function isValidId(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function validateProvider(config: Record<string, unknown>, defaults?: EntityProviderUserSettings): void {
	if (!isValidId(config.providerTypeID)) throw new Error("A provider is missing its type.");
	if (config.enabled !== undefined && typeof config.enabled !== "boolean") throw new Error("A provider has an invalid enabled value.");
	if (config.icon !== undefined && typeof config.icon !== "string") throw new Error("A provider has an invalid icon.");
	if (config.providerInstanceId !== undefined && typeof config.providerInstanceId !== "string") throw new Error("A provider has an invalid instance ID.");
	// Unknown providers are retained without interpreting their private settings.
	if (!defaults) return;
	for (const [key, value] of Object.entries(defaults)) {
		if (config[key] === undefined || value === undefined) continue;
		if (Array.isArray(value) ? !Array.isArray(config[key]) : typeof value !== typeof config[key]) {
			throw new Error(`Provider ${config.providerTypeID}: invalid ${key}.`);
		}
	}
	if (config.entityFilters !== undefined && (!Array.isArray(config.entityFilters) || !config.entityFilters.every(filter =>
		isRecord(filter) && (filter.type === "include" || filter.type === "exclude") &&
		typeof filter.property === "string" && typeof filter.value === "string"
	))) throw new Error("A provider has invalid entity filters.");
	if (config.entityCreationTemplates !== undefined && (!Array.isArray(config.entityCreationTemplates) || !config.entityCreationTemplates.every(template =>
		isRecord(template) && typeof template.engine === "string" && ["disabled", "core", "templater"].includes(template.engine) &&
		typeof template.templatePath === "string" && typeof template.entityName === "string" &&
		(template.folderPath === undefined || typeof template.folderPath === "string")
	))) throw new Error("A provider has invalid creation templates.");
	if (config.providerTypeID === "template") {
		if (config.trigger !== undefined && (typeof config.trigger !== "string" || !["@", ":", "/"].includes(config.trigger))) throw new Error("A template provider has an invalid trigger.");
		if (config.actionType !== undefined && config.actionType !== "insert" && config.actionType !== "create") throw new Error("A template provider has an invalid action type.");
	}
}

function uniqueId(reserved: Set<string>, createId: () => string): string {
	for (let attempt = 0; attempt < 100; attempt++) {
		const id = createId();
		if (isValidId(id) && !reserved.has(id)) {
			reserved.add(id);
			return id;
		}
	}
	throw new Error("Could not assign a unique provider ID. Retry loading settings.");
}

/**
 * Upgrade unversioned data without discarding unknown fields or configurations.
 * Reserve all existing IDs first; the first occurrence keeps its ID and later
 * duplicates receive fresh opaque IDs. Running this on its output makes no changes.
 */
export function normalizeSettings(
	data: unknown,
	defaultsForType: DefaultsForType = () => undefined,
	createId = createProviderInstanceId
): SettingsLoadResult {
	try {
		if (data === undefined) {
			return { ok: true, settings: { schemaVersion: 1, providerSettings: [] }, changed: false };
		}
		if (!isRecord(data) || !isJsonData(data)) throw new Error("Saved settings must be a JSON object.");
		if (data.schemaVersion !== undefined && data.schemaVersion !== 1) throw new Error("Unsupported settings version. Use a compatible plugin version and retry.");
		const list = data.providerSettings ?? (data.schemaVersion === undefined && !("providerSettings" in data) ? [] : null);
		if (!Array.isArray(list)) throw new Error("Saved provider settings must be an array.");
		const reserved = new Set<string>();
		for (const config of list) {
			if (!isRecord(config)) throw new Error("A saved provider configuration is not an object.");
			validateProvider(config, typeof config.providerTypeID === "string" ? defaultsForType(config.providerTypeID) : undefined);
			if (isValidId(config.providerInstanceId)) reserved.add(config.providerInstanceId);
		}
		let changed = data.schemaVersion !== 1;
		const seen = new Set<string>();
		const providerSettings = list.map(config => {
			const defaults = defaultsForType(config.providerTypeID);
			let id = config.providerInstanceId;
			if (!isValidId(id) || seen.has(id)) {
				id = uniqueId(reserved, createId);
				changed = true;
			}
			seen.add(id);
			if (config.enabled === undefined || config.icon === undefined) changed = true;
			if (defaults && Object.entries(defaults).some(([key, value]) => value !== undefined && config[key] === undefined)) changed = true;
			// Runtime defaults can contain optional undefined fields; persisted data cannot.
			const savedDefaults = JSON.parse(JSON.stringify(defaults ?? {})) as Partial<EntityProviderUserSettings>;
			return {
				...savedDefaults,
				...cloneSettings(config),
				providerInstanceId: id,
				enabled: config.enabled ?? true,
				icon: config.icon ?? defaultsForType(config.providerTypeID)?.icon ?? "",
			} as ConfiguredProviderSettings;
		});
		return { ok: true, settings: { ...cloneSettings(data), schemaVersion: 1, providerSettings }, changed };
	} catch (error) {
		return { ok: false, error: asError(error) };
	}
}

function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

/** Plugin-owned canonical settings and a single serialized, retryable disk writer. */
export class SettingsStore {
	private state: EntitiesSettings = { schemaVersion: 1, providerSettings: [] };
	private revision = 0;
	private savedRevision = 0;
	private writing: Promise<boolean> | undefined;
	private loading: Promise<boolean> | undefined;
	private closed = false;
	private loaded = false;
	private reservedIds = new Set<string>();
	loadError: Error | undefined;
	saveError: Error | undefined;

	constructor(
		private readonly write: (settings: EntitiesSettings) => Promise<void>,
		private readonly backup: (original: unknown) => Promise<void>,
		private readonly defaultsForType: DefaultsForType = () => undefined,
		private readonly onError: (error: Error) => void = () => {},
		private readonly createId = createProviderInstanceId,
		private readonly onSaveRecovered: () => void = () => {}
	) {}

	/** Detached data for UI drafts and runtime construction; mutate through ID-based methods. */
	get settings(): EntitiesSettings {
		return cloneSettings(this.state);
	}

	get isReadOnly(): boolean {
		return !this.loaded || this.closed;
	}

	get isClosed(): boolean {
		return this.closed;
	}

	get hasPendingSave(): boolean {
		return this.savedRevision < this.revision;
	}

	/** Retry is only allowed after a failed load, so it cannot discard unsaved edits. */
	load(read: () => Promise<unknown>): Promise<boolean> {
		if (this.loaded || this.closed) return Promise.resolve(false);
		if (!this.loading) this.loading = this.readSettings(read).finally(() => { this.loading = undefined; });
		return this.loading;
	}

	private async readSettings(read: () => Promise<unknown>): Promise<boolean> {
		try {
			const original = await read();
			const result = normalizeSettings(original, this.defaultsForType, this.createId);
			if (this.closed) return false;
			if (!result.ok) throw result.error;
			if (result.changed) await this.backup(cloneSettings(original));
			if (this.closed) return false;
			this.state = result.settings;
			this.reservedIds = new Set(this.state.providerSettings.map(item => item.providerInstanceId));
			this.loadError = undefined;
			this.loaded = true;
			if (result.changed) this.changed();
			return true;
		} catch (error) {
			this.loadError = asError(error);
			this.reportError(this.loadError);
			return false;
		}
	}

	addProvider(defaults: EntityProviderUserSettings): ConfiguredProviderSettings | undefined {
		if (this.isReadOnly) return undefined;
		const provider = {
			...cloneSettings(defaults),
			providerInstanceId: uniqueId(this.reservedIds, this.createId),
		};
		this.state.providerSettings.push(provider);
		this.changed();
		return cloneSettings(provider);
	}

	/** A callback from a deleted provider is a no-op, including after reorder. */
	updateProvider(id: string, changes: Partial<EntityProviderUserSettings>): boolean {
		if (this.isReadOnly) return false;
		const index = this.state.providerSettings.findIndex(item => item.providerInstanceId === id);
		if (index < 0) return false;
		const current = this.state.providerSettings[index];
		this.state.providerSettings[index] = {
			...current, ...cloneSettings(changes),
			providerTypeID: current.providerTypeID, providerInstanceId: id,
		};
		this.changed();
		return true;
	}

	deleteProvider(id: string): boolean {
		if (this.isReadOnly) return false;
		const index = this.state.providerSettings.findIndex(item => item.providerInstanceId === id);
		if (index < 0) return false;
		this.state.providerSettings.splice(index, 1);
		this.changed();
		return true;
	}

	/** Accept only a permutation of all current IDs. */
	reorderProviders(ids: readonly string[]): boolean {
		if (this.isReadOnly) return false;
		const byId = new Map(this.state.providerSettings.map(item => [item.providerInstanceId, item]));
		if (ids.length !== byId.size || new Set(ids).size !== byId.size || ids.some(id => !byId.has(id))) return false;
		this.state.providerSettings = ids.map(id => byId.get(id)!);
		this.changed();
		return true;
	}

	private changed(): void {
		this.revision++;
		// Start promptly; edits during an outstanding write coalesce into its successor.
		void this.flush();
	}

	/** Flush on settings tab/modal close, or explicitly retry a failed write. Never rejects. */
	flush(): Promise<boolean> {
		if (!this.loaded) return Promise.resolve(false);
		if (!this.writing) {
			// Assign ownership before invoking the writer, also coalescing this turn's edits.
			this.writing = Promise.resolve().then(() => this.writePending()).then(saved => {
				this.writing = undefined;
				// An edit can arrive after the drain completes but before this continuation.
				return saved && this.hasPendingSave ? this.flush() : saved;
			});
		}
		return this.writing;
	}

	private async writePending(): Promise<boolean> {
		while (this.hasPendingSave) {
			const revision = this.revision;
			try {
				await this.write(cloneSettings(this.state));
				this.savedRevision = revision;
				const recovered = this.saveError !== undefined;
				this.saveError = undefined;
				if (recovered) {
					try { this.onSaveRecovered(); } catch { /* Presentation cannot fail a completed write. */ }
				}
			} catch (error) {
				this.saveError = asError(error);
				this.reportError(this.saveError);
				return false;
			}
		}
		return true;
	}

	private reportError(error: Error): void {
		try { this.onError(error); } catch { /* Keep the error and writer retryable even if UI fails. */ }
	}

	/** Stop accepting UI callbacks and start a final flush; Obsidian cannot await it. */
	close(): Promise<boolean> {
		this.closed = true;
		return this.flush();
	}
}

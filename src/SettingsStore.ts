import type { EntitiesSettings } from "./entities.types";
import type { ConfiguredProviderSettings, EntityProviderUserSettings } from "./Providers/EntityProvider";
import { cloneSettings, createProviderInstanceId } from "./settingsData";
import { encodeSettings, parseSettingsSnapshot } from "./SettingsStorage";
import type { SettingsDiskSnapshot, SettingsPersistence } from "./SettingsStorage";

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

/** An idempotent receipt for meaningful UI work; the native bridge is integrated separately. */
export interface SettingsDraftGuard {
	capture(): { generation: number; pending: boolean };
	prepareDiscard(generation: number): { commit(): void; rollback(): void } | undefined;
}

/** Optional presentation and draft guards; none may turn an IO failure into success. */
export interface SettingsStoreOptions {
	defaultsForType?: DefaultsForType;
	onError?: (error: Error) => void;
	createId?: () => string;
	onSaveRecovered?: () => void;
	onCanonicalChange?: (version: number) => void;
	drafts?: SettingsDraftGuard;
}

/** Classification does not imply that a matching write fulfilled. */
export interface SettingsObservationResult {
	kind: "unchanged" | "own-pending" | "own-failed" | "accepted" | "protected" | "unavailable" | "stale";
	canonicalChanged: boolean;
	canonicalVersion: number;
}

interface Candidate {
	id: number;
	raw: string;
	settings: EntitiesSettings;
	migration: boolean;
	backedUp: boolean;
}

/** Detached recovery data. First and latest are the only retained external versions. */
export interface SettingsRecoveryStatus {
	version: number;
	first?: { id: number; raw: string; settings: EntitiesSettings };
	latest?: { id: number; raw: string; settings: EntitiesSettings };
	error?: Error;
}

/** A choice names both a captured candidate and the disk content the user agreed to replace. */
export interface SettingsRecoveryChoice {
	version: number;
	revision: number;
	draftGeneration: number;
	candidateId: number;
	expectedRaw: string;
	requiresWrite: boolean;
}

interface Attempt {
	raw: string;
	revision: number;
	kind: "local" | "restore";
	status: "pending" | "successful" | "failed";
}

interface Acceptance {
	settings: EntitiesSettings;
	ids: Set<string>;
	changed: boolean;
}

interface Capture {
	explicit: boolean;
	promise: Promise<SettingsObservationResult>;
	resolve(result: SettingsObservationResult): void;
	captured: Promise<void>;
	release(): void;
	receipts: readonly Attempt[];
}

/** Canonical ID mutations with one persistence effect and a nonblocking, bounded capture lane. */
export class SettingsStore {
	private state: EntitiesSettings = { schemaVersion: 1, providerSettings: [] };
	private revision = 0;
	private version = 0;
	private pendingRevision?: number;
	private writing?: Promise<boolean>;
	private loading?: Promise<boolean>;
	private effect?: Promise<void>;
	private closed = false;
	private loaded = false;
	private established = false;
	private reservedIds = new Set<string>();
	private persistence?: SettingsPersistence;
	private legacyWrite?: (settings: EntitiesSettings) => Promise<void>;
	private legacyBackup?: (original: unknown) => Promise<void>;
	private options: SettingsStoreOptions;
	private accepted?: Candidate;
	private disk: SettingsDiskSnapshot = { kind: "missing" };
	private attempt?: Attempt;
	private successful?: Attempt;
	private failed?: Attempt;
	private activeCapture?: Capture;
	private followupCapture?: Capture;
	private admission = 0;
	private observeAfterLoad = false;
	private sequence = 0;
	private protectionVersion = 0;
	private first?: Candidate;
	private latest?: Candidate;
	private observationError?: Error;
	private adopting?: Candidate;
	private adoptionWork?: Promise<SettingsObservationResult>;
	private choiceBusy = false;
	private chosen?: Candidate;
	private choiceWrite?: Attempt;
	private choiceExpectedRaw?: string;
	loadError?: Error;
	saveError?: Error;

	constructor(persistence: SettingsPersistence, options?: SettingsStoreOptions);
	constructor(write: (settings: EntitiesSettings) => Promise<void>, backup: (original: unknown) => Promise<void>,
		defaultsForType?: DefaultsForType, onError?: (error: Error) => void, createId?: () => string, onSaveRecovered?: () => void);
	constructor(io: SettingsPersistence | ((settings: EntitiesSettings) => Promise<void>),
		optionsOrBackup: SettingsStoreOptions | ((original: unknown) => Promise<void>) = {},
		defaultsForType?: DefaultsForType, onError?: (error: Error) => void, createId?: () => string, onSaveRecovered?: () => void) {
		if (typeof io === "function") {
			// Temporary constructor adapter: existing main has no external hook or raw IO binding yet.
			this.legacyWrite = io;
			this.legacyBackup = optionsOrBackup as (original: unknown) => Promise<void>;
			this.options = { defaultsForType, onError, createId, onSaveRecovered };
		} else {
			this.persistence = io;
			this.options = optionsOrBackup as SettingsStoreOptions;
		}
	}

	get settings(): EntitiesSettings { return cloneSettings(this.state); }
	get canonicalVersion(): number { return this.version; }
	get isReadOnly(): boolean { return !this.loaded || this.closed; }
	get isClosed(): boolean { return this.closed; }
	get hasPendingSave(): boolean { return this.pendingRevision !== undefined; }
	get persistenceBlocked(): boolean { return Boolean(this.first || this.observationError); }
	get recovery(): SettingsRecoveryStatus | undefined {
		if (!this.persistenceBlocked) return undefined;
		return { version: this.protectionVersion, first: cloneSettings(this.first), latest: cloneSettings(this.latest), error: this.observationError };
	}

	/** Initial load may retry failures; successful loads never replace live canonical work. */
	load(read?: () => Promise<unknown>): Promise<boolean> {
		if (this.loaded || this.closed) return Promise.resolve(false);
		if (!this.loading) this.loading = this.readSettings(read).finally(() => { this.loading = undefined; });
		return this.loading;
	}

	private async readSettings(read?: () => Promise<unknown>): Promise<boolean> {
		try {
			let original: unknown;
			let candidate: Candidate | undefined;
			if (this.persistence) {
				const snapshot = await this.persistence.readSnapshot();
				if (this.closed) return false;
				this.disk = snapshot;
				if (this.disk.kind === "file") this.established = true;
				else if (this.established) throw new Error("The established settings file is missing. Restore it, then check again.");
				original = parseSettingsSnapshot(this.disk);
				if (this.disk.kind === "file") candidate = this.candidate(this.disk.raw);
			} else original = await read!();
			if (this.closed) return false;
			const normalized = candidate ? { ok: true as const, settings: candidate.settings, changed: candidate.migration }
				: normalizeSettings(original, this.options.defaultsForType, this.createId);
			if (!normalized.ok) throw normalized.error;
			if (normalized.changed) {
				if (candidate) await this.exclusive(() => this.backupCandidate(candidate!));
				else await this.legacyBackup!(cloneSettings(original));
			}
			if (this.closed) return false;
			this.state = cloneSettings(normalized.settings);
			this.accepted = candidate;
			this.reserveIds();
			this.version++;
			this.loaded = true;
			this.loadError = undefined;
			if (normalized.changed) this.changed();
			if (this.observeAfterLoad) {
				this.observeAfterLoad = false;
				void this.observeExternal();
			}
			return true;
		} catch (error) {
			this.loadError = asError(error);
			this.reportError(this.loadError);
			return false;
		}
	}

	private createId = (): string => (this.options.createId ?? createProviderInstanceId)();
	private reserveIds(): void { for (const item of this.state.providerSettings) this.reservedIds.add(item.providerInstanceId); }

	addProvider(defaults: EntityProviderUserSettings): ConfiguredProviderSettings | undefined {
		if (this.isReadOnly) return undefined;
		const provider = { ...cloneSettings(defaults), providerInstanceId: uniqueId(this.reservedIds, this.createId) };
		this.state.providerSettings.push(provider);
		this.changed();
		return cloneSettings(provider);
	}

	/** Deleted IDs cannot be revived by stale field callbacks. */
	updateProvider(id: string, changes: Partial<EntityProviderUserSettings>): boolean {
		if (this.isReadOnly) return false;
		const index = this.state.providerSettings.findIndex(item => item.providerInstanceId === id);
		if (index < 0) return false;
		const current = this.state.providerSettings[index];
		this.state.providerSettings[index] = { ...current, ...cloneSettings(changes), providerTypeID: current.providerTypeID, providerInstanceId: id };
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
		this.pendingRevision = ++this.revision;
		this.version++;
		void this.flush();
	}

	private result(kind: SettingsObservationResult["kind"], canonicalChanged = false): SettingsObservationResult {
		return { kind, canonicalChanged, canonicalVersion: this.version };
	}

	private draft(): { generation: number; pending: boolean } {
		return this.options.drafts?.capture() ?? { generation: 0, pending: false };
	}

	/** Every notification requests fresh evidence; a burst shares at most one follow-up capture. */
	observeExternal(): Promise<SettingsObservationResult> { return this.requestCapture(false); }
	/** Explicit error-only recovery never silently resolves a captured-candidate conflict. */
	retryObservation(): Promise<SettingsObservationResult> { return this.requestCapture(true); }

	private requestCapture(explicit: boolean, duringClose = false): Promise<SettingsObservationResult> {
		if (!this.persistence || (this.closed && !duringClose)) return Promise.resolve(this.result("unavailable"));
		if (!this.loaded) {
			this.observeAfterLoad = true;
			return Promise.resolve(this.result("unavailable"));
		}
		this.admission++;
		if (this.activeCapture) {
			if (!this.followupCapture) this.followupCapture = this.makeCapture(explicit);
			else this.followupCapture.explicit ||= explicit;
			return this.followupCapture.promise;
		}
		const job = this.makeCapture(explicit);
		this.startCapture(job);
		return job.promise;
	}

	private makeCapture(explicit: boolean): Capture {
		let resolve!: Capture["resolve"];
		let release!: () => void;
		return { explicit, receipts: [this.attempt, this.successful, this.failed].filter((item): item is Attempt => item !== undefined),
			promise: new Promise(done => { resolve = done; }), resolve: value => resolve(value),
			captured: new Promise(done => { release = done; }), release: () => release() };
	}

	private startCapture(job: Capture): void {
		this.activeCapture = job;
		void this.capture(job);
	}

	private async capture(job: Capture): Promise<void> {
		let outcome: SettingsObservationResult | Promise<SettingsObservationResult>;
		try {
			const snapshot = await this.persistence!.readSnapshot();
			this.disk = snapshot;
			if (snapshot.kind === "file") this.established = true;
			outcome = this.classify(snapshot, job);
		} catch (error) { this.protect(error); outcome = this.result("protected"); }
		// Classification can schedule a backup, but never holds the capture lane while awaiting it.
		this.activeCapture = undefined;
		job.release();
		const next = this.followupCapture;
		this.followupCapture = undefined;
		if (next) this.startCapture(next);
		try { job.resolve(await outcome); }
		catch (error) { this.protect(error); job.resolve(this.result("protected")); }
	}

	private classify(snapshot: SettingsDiskSnapshot, job: Capture): SettingsObservationResult | Promise<SettingsObservationResult> {
		const explicit = job.explicit;
		const draft = this.draft(); // Failure must not fabricate a clean draft receipt.
		if (snapshot.kind === "missing") {
			if (this.established) throw new Error("The established settings file is missing. Restore it, then check again.");
			if (explicit && !this.first) this.observationError = undefined;
			return this.result(this.persistenceBlocked ? "protected" : "unchanged");
		}
		const raw = snapshot.raw;
		const own = [this.attempt, this.successful, this.failed, ...job.receipts].find(item => item?.raw === raw);
		if (own) {
			// A successful strict check repairs the read error, never the failed save itself.
			if (explicit) this.observationError = undefined;
			if (this.adopting && !this.persistenceBlocked && this.accepted?.raw === raw) this.adopting = this.accepted;
			return this.result(own.status === "pending" ? "own-pending" : own.status === "failed" ? "own-failed" : "unchanged");
		}
		const differentDuringChoice = this.choiceWrite && this.choiceWrite.raw !== raw && this.choiceExpectedRaw !== raw;
		if (differentDuringChoice) this.protectionVersion++;
		if (this.accepted?.raw === raw) {
			if (differentDuringChoice) this.retain(this.candidate(raw));
			if (this.adopting && !this.persistenceBlocked) this.adopting = this.candidate(raw);
			if (explicit && !this.first) this.observationError = undefined;
			return this.result(this.persistenceBlocked ? "protected" : "unchanged");
		}
		const candidate = this.candidate(raw);
		if (candidate === this.adopting) return this.result("unchanged");
		if (this.hasPendingSave || this.attempt || this.saveError || draft.pending || this.persistenceBlocked || this.choiceBusy || this.closed) {
			if (this.adopting) this.retain(this.adopting);
			this.retain(candidate);
			// A valid check repairs an observation error, not a candidate conflict.
			if (explicit) this.observationError = undefined;
			return this.result("protected");
		}
		this.adopting = candidate;
		if (this.adoptionWork) return this.adoptionWork;
		this.adoptionWork = this.adoptClean(candidate, this.revision, draft.generation).finally(() => { this.adoptionWork = undefined; });
		return this.adoptionWork;
	}

	private candidate(raw: string): Candidate {
		const retained = [this.accepted, this.first, this.latest, this.adopting, this.chosen].find(item => item?.raw === raw);
		if (retained) return retained;
		// Rejected/evicted observations must not grow the canonical lifetime's ID history.
		const reserved = new Set(this.reservedIds);
		for (const item of [this.first, this.latest, this.adopting, this.chosen]) {
			for (const provider of item?.settings.providerSettings ?? []) reserved.add(provider.providerInstanceId);
		}
		const result = normalizeSettings(parseSettingsSnapshot({ kind: "file", raw }), this.options.defaultsForType,
			() => uniqueId(reserved, this.createId));
		if (!result.ok) throw result.error;
		return { id: ++this.sequence, raw, settings: result.settings, migration: result.changed, backedUp: false };
	}

	private retain(candidate: Candidate): void {
		if (!this.first) { this.first = candidate; this.protectionVersion++; }
		if (candidate.raw !== this.first.raw && candidate.raw !== this.latest?.raw) { this.latest = candidate; this.protectionVersion++; }
	}

	private protect(error: unknown): void {
		this.observationError = asError(error);
		this.protectionVersion++;
		this.reportError(this.observationError);
	}

	private async capturesSettled(): Promise<void> {
		while (this.activeCapture) await this.activeCapture.captured;
	}

	/** The reducer never awaits its own queue: captures continue while this effect is pending. */
	private async exclusive<T>(work: () => Promise<T>): Promise<T> {
		while (this.effect) await this.effect;
		let release!: () => void;
		const effect = new Promise<void>(done => { release = done; });
		this.effect = effect;
		try { return await work(); }
		finally { this.effect = undefined; release(); }
	}

	private async backupCandidate(candidate: Candidate): Promise<void> {
		if (candidate.migration && !candidate.backedUp) {
			await this.persistence!.backupSnapshot(candidate.raw, "migration");
			candidate.backedUp = true;
		}
	}

	private retainAdoption(candidate: Candidate): void {
		// Existing protection already retained captures in order; do not replace its latest with older work.
		if (this.first) return;
		this.retain(candidate);
		if (this.adopting) this.retain(this.adopting);
	}

	private async adoptClean(candidate: Candidate, revision: number, draftGeneration: number): Promise<SettingsObservationResult> {
		try {
			while (true) {
				await this.capturesSettled();
				candidate = this.adopting ?? candidate;
				await this.exclusive(() => this.backupCandidate(candidate));
				// Wait for fresh classification, not the adoption outcome that this operation owns.
				if (candidate.migration) void this.requestCapture(false, true);
				await this.capturesSettled();
				const draft = this.draft();
				if (this.closed || this.persistenceBlocked || this.revision !== revision || draft.generation !== draftGeneration || draft.pending) {
					this.retainAdoption(candidate);
					return this.result("protected");
				}
				if (this.adopting !== candidate) continue;
				return this.accept(candidate);
			}
		} catch (error) { this.retainAdoption(candidate); this.protect(error); return this.result("protected"); }
		finally { this.adopting = undefined; }
	}

	private prepareAcceptance(candidate: Candidate): Acceptance {
		return { settings: cloneSettings(candidate.settings),
			ids: new Set([...this.reservedIds, ...candidate.settings.providerSettings.map(item => item.providerInstanceId)]),
			changed: encodeSettings(this.state) !== encodeSettings(candidate.settings) };
	}

	private accept(candidate: Candidate, prepared = this.prepareAcceptance(candidate)): SettingsObservationResult {
		this.state = prepared.settings;
		this.reservedIds = prepared.ids;
		this.accepted = candidate;
		this.pendingRevision = undefined;
		this.successful = undefined;
		this.failed = undefined;
		this.saveError = undefined;
		this.first = undefined;
		this.latest = undefined;
		this.observationError = undefined;
		this.protectionVersion++;
		if (prepared.changed) this.version++;
		if (prepared.changed) { try { this.options.onCanonicalChange?.(this.version); } catch { /* Presentation follows commit. */ } }
		return this.result("accepted", prepared.changed);
	}

	/** Flush and retry retain existing coalescing; strict mode checks disk before every dispatch. */
	flush(): Promise<boolean> {
		if (!this.loaded) return Promise.resolve(false);
		if (!this.writing) this.writing = Promise.resolve().then(() => this.writePending()).then(saved => {
			this.writing = undefined;
			return saved && this.hasPendingSave ? this.flush() : saved;
		});
		return this.writing;
	}

	private async writePending(): Promise<boolean> {
		while (this.hasPendingSave) {
			if (this.persistenceBlocked || this.choiceBusy) return false;
			if (this.persistence) {
				await this.requestCapture(false, true);
				await this.capturesSettled();
				if (this.persistenceBlocked || this.choiceBusy) return false;
			}
			const revision = this.revision;
			const snapshot = cloneSettings(this.state);
			const attempt: Attempt = { raw: encodeSettings(snapshot), revision, kind: "local", status: "pending" };
			try {
				if (this.persistence) {
					const admission = this.admission;
					const dispatched = await this.exclusive(async () => {
						if (admission !== this.admission || this.persistenceBlocked || this.choiceBusy || this.activeCapture) return false;
						await this.dispatch(attempt);
						return true;
					});
					if (!dispatched) continue;
				} else {
					await this.legacyWrite!(snapshot);
					if (this.pendingRevision === revision) this.pendingRevision = undefined;
					this.recovered();
				}
			} catch (error) { this.saveError = asError(error); this.reportError(this.saveError); return false; }
		}
		if (this.persistence) await this.capturesSettled();
		return !this.persistenceBlocked;
	}

	private async dispatch(attempt: Attempt): Promise<void> {
		this.attempt = attempt; // Install before adapter invocation, including reentrant notifications.
		try {
			await this.persistence!.writeSnapshot(attempt.raw);
			attempt.status = "successful";
			this.established = true;
			this.successful = attempt;
			this.failed = undefined;
			if (attempt.kind === "local") {
				if (this.pendingRevision === attempt.revision) this.pendingRevision = undefined;
				this.accepted = this.candidate(attempt.raw);
				this.recovered();
			}
		} catch (error) {
			attempt.status = "failed";
			this.failed = attempt;
			this.saveError = asError(error);
			throw error;
		} finally { this.attempt = undefined; }
	}

	private recovered(): void {
		const recovered = this.saveError !== undefined;
		this.saveError = undefined;
		if (recovered && !this.persistenceBlocked) { try { this.options.onSaveRecovered?.(); } catch { /* Disk outcome is unchanged. */ } }
	}

	/** UI can offer only the first or latest captured version, never an arbitrary history. */
	getRecoveryChoice(target: "first" | "latest" = "latest"): SettingsRecoveryChoice | undefined {
		const candidate = target === "first" ? this.first : this.latest ?? this.first;
		if (!candidate || this.observationError || this.disk.kind !== "file" || this.closed) return undefined;
		try {
			return { version: this.protectionVersion, revision: this.revision, draftGeneration: this.draft().generation,
				candidateId: candidate.id, expectedRaw: this.disk.raw, requiresWrite: candidate.raw !== this.disk.raw };
		} catch (error) { this.protect(error); return undefined; }
	}

	/** Accept captured external data only when it is still on disk; never writes data.json. */
	reloadExternal(choice: SettingsRecoveryChoice): Promise<SettingsObservationResult> { return this.choose(choice, "reload"); }
	/** Explicitly restore captured bytes after a guarded backup and disk recheck. */
	restoreExternal(choice: SettingsRecoveryChoice): Promise<SettingsObservationResult> { return this.choose(choice, "restore"); }
	/** Save applied canonical state while leaving unapplied drafts intact. */
	keepLocalAndRetry(choice: SettingsRecoveryChoice): Promise<SettingsObservationResult> { return this.choose(choice, "keep"); }

	private matches(choice: SettingsRecoveryChoice): boolean {
		return !this.closed && !this.observationError && choice.version === this.protectionVersion &&
			choice.revision === this.revision && choice.draftGeneration === this.draft().generation;
	}

	private async choose(choice: SettingsRecoveryChoice, action: "reload" | "restore" | "keep"): Promise<SettingsObservationResult> {
		if (!this.persistence || this.choiceBusy || this.closed) return this.result("unavailable");
		const candidate = [this.first, this.latest].find(item => item?.id === choice.candidateId);
		if (!candidate) return this.result("stale");
		this.choiceBusy = true;
		try {
			if (this.writing) await this.writing;
			await this.capturesSettled();
			if (!this.matches(choice)) return this.result("stale");
			await this.requestCapture(false);
			if (!this.matches(choice) || this.disk.kind !== "file" || this.disk.raw !== choice.expectedRaw) return this.result("stale");
			if (action === "reload" && candidate.raw !== this.disk.raw) return this.result("stale");
			if (action === "restore" && !choice.requiresWrite) return this.result("stale");
			return await this.exclusive(async () => {
				await this.backupCandidate(candidate);
				await this.persistence!.backupSnapshot(encodeSettings({ recoveryFormat: 1, localCanonical: this.state,
					firstExternal: this.first?.raw, latestExternal: this.latest?.raw, selectedExternal: candidate.raw, currentDisk: this.disk }), "external-recovery");
				await this.requestCapture(false);
				const admission = this.admission;
				await this.capturesSettled();
				if (!this.matches(choice) || this.disk.kind !== "file" || this.disk.raw !== choice.expectedRaw) return this.result("stale");
				const prepared = action === "keep" ? undefined : this.options.drafts?.prepareDiscard(choice.draftGeneration);
				if (action !== "keep" && this.options.drafts && !prepared) return this.result("stale");
				const replacement = action === "keep" ? undefined : this.prepareAcceptance(candidate);
				if (!this.matches(choice) || admission !== this.admission || this.activeCapture) return this.result("stale");
				if (action !== "reload") {
					this.chosen = candidate;
					this.choiceWrite = { raw: action === "keep" ? encodeSettings(this.state) : candidate.raw,
						revision: this.revision, kind: action === "keep" ? "local" : "restore", status: "pending" };
					this.choiceExpectedRaw = choice.expectedRaw;
					await this.dispatch(this.choiceWrite);
					do { await this.capturesSettled(); } while (this.activeCapture);
					// Own echoes do not change the episode token; different evidence still invalidates it.
					if (!this.matches(choice)) return this.result("protected");
				}
				if (action === "keep") {
					this.first = undefined; this.latest = undefined; this.observationError = undefined;
					this.protectionVersion++;
					return this.result("accepted");
				}
				if (!this.matches(choice) || this.activeCapture || (action === "reload" && admission !== this.admission)) return this.result("stale");
				try { prepared?.commit(); }
				catch (error) { prepared?.rollback(); throw error; }
				// Prepared assignments cannot invoke UI/IO; publication follows both owners' swaps.
				return this.accept(candidate, replacement!);
			});
		} catch (error) { this.protect(error); return this.result("protected"); }
		finally { this.chosen = undefined; this.choiceWrite = undefined; this.choiceExpectedRaw = undefined; this.choiceBusy = false; }
	}

	private reportError(error: Error): void { try { this.options.onError?.(error); } catch { /* Keep recovery usable if presentation fails. */ } }

	/** Stop mutations and settle admitted evidence; rich handoff transfer is a separate integration gate. */
	async close(): Promise<boolean> {
		this.closed = true;
		if (this.loading) await this.loading;
		const saved = await this.flush();
		await this.capturesSettled();
		if (this.effect) await this.effect;
		if (this.adoptionWork) await this.adoptionWork;
		return saved && !this.hasPendingSave && !this.persistenceBlocked;
	}
}

import { normalizeSettings, SettingsStore } from "../src/SettingsStore";
import type { EntitiesSettings } from "../src/entities.types";
import type { EntityProviderUserSettings } from "../src/Providers/EntityProvider";

const defaults = { providerTypeID: "folder", enabled: true, icon: "folder", path: "", entityFilters: [] };
const defaultsForType = (type: string) => type === "folder" ? defaults : undefined;
const configured = (id: string, path = id) => ({ ...defaults, providerInstanceId: id, path });
const saved = (...ids: string[]) => ({ schemaVersion: 1, providerSettings: ids.map(id => configured(id)) });
const patch = (path: string) => ({ path }) as Partial<EntityProviderUserSettings>;

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: Error) => void;
	const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
	return { promise, resolve, reject };
}

function setup(write = jest.fn<Promise<void>, [EntitiesSettings]>().mockResolvedValue(undefined)) {
	const backup = jest.fn<Promise<void>, [unknown]>().mockResolvedValue(undefined);
	const report = jest.fn();
	let nextId = 0;
	const store = new SettingsStore(write, backup, defaultsForType, report, () => `new-id-${++nextId}`);
	return { store, write, backup, report };
}

describe("settings migration", () => {
	test("preserves order, explicit false, unknown fields and unknown providers, then is idempotent", () => {
		const original = {
			privateTopLevel: { future: [0, false, null] },
			providerSettings: [
				{ ...defaults, enabled: false, privateField: { nested: [1, 2] } },
				{ providerTypeID: "uninstalled", enabled: false, icon: "x", data: { x: "y" } },
			],
		};
		const before = JSON.stringify(original);
		let counter = 0;
		const result = normalizeSettings(original, defaultsForType, () => `id-${++counter}`);
		expect(result.ok).toBe(true);
		if (!result.ok) throw result.error;
		expect(result.changed).toBe(true);
		expect(result.settings).toMatchObject(original);
		expect(result.settings.providerSettings.map(item => item.providerInstanceId)).toEqual(["id-1", "id-2"]);
		expect(normalizeSettings(result.settings, defaultsForType, () => { throw new Error("must not generate IDs"); }))
			.toEqual({ ok: true, settings: result.settings, changed: false });
		expect(JSON.stringify(original)).toBe(before);
	});

	test("reserves IDs from later rows and deterministically keeps only the first duplicate", () => {
		const candidates = ["retained-later", "replacement-1", "replacement-2"];
		const result = normalizeSettings({ providerSettings: [
			configured("duplicate", "first"), configured("duplicate", "second"), defaults, configured("retained-later"),
		] }, defaultsForType, () => candidates.shift()!);
		expect(result.ok).toBe(true);
		if (!result.ok) throw result.error;
		expect(result.settings.providerSettings.map(item => item.providerInstanceId))
			.toEqual(["duplicate", "replacement-1", "replacement-2", "retained-later"]);
		expect(result.settings.providerSettings).toHaveLength(4);
		expect(result.settings.providerSettings[1]).toMatchObject({ path: "second" });
	});

	test.each([
		[], "invalid", { schemaVersion: 2, providerSettings: [] }, { schemaVersion: 0 },
		{ schemaVersion: "1" }, { schemaVersion: 1 }, { providerSettings: null },
		{ providerSettings: [null] }, { providerSettings: [{}] },
		{ providerSettings: [{ ...defaults, enabled: "false" }] },
		{ providerSettings: [{ ...defaults, providerInstanceId: 42 }] },
		{ providerSettings: [{ ...defaults, path: null }] },
		{ providerSettings: [{ ...defaults, entityFilters: [{ type: "include", property: 1, value: "yes" }] }] },
		{ providerSettings: [{ ...defaults, entityCreationTemplates: [{}] }] },
		{ providerSettings: [{ ...defaults, entityCreationTemplates: [{ engine: ["templater"], templatePath: "test", entityName: "Test" }] }] },
	])("rejects unsafe data without changing it: %j", input => {
		const before = JSON.stringify(input);
		expect(normalizeSettings(input, defaultsForType).ok).toBe(false);
		expect(JSON.stringify(input)).toBe(before);
	});
});

describe("canonical edits and serialized saves", () => {
	test("same-type instances get distinct IDs that survive edits, reorder and restart", async () => {
		const { store, write } = setup();
		await store.load(async () => null);
		const a = store.addProvider(defaults)!;
		const b = store.addProvider(defaults)!;
		expect(a.providerInstanceId).not.toBe(b.providerInstanceId);
		store.updateProvider(a.providerInstanceId, patch("renamed"));
		store.reorderProviders([b.providerInstanceId, a.providerInstanceId]);
		await store.flush();
		const restarted = setup().store;
		await restarted.load(async () => write.mock.calls[0][0]);
		expect(restarted.settings.providerSettings.map(item => item.providerInstanceId))
			.toEqual([b.providerInstanceId, a.providerInstanceId]);
		expect(restarted.settings.providerSettings[1]).toMatchObject({ path: "renamed" });
	});

	test("deleting A before flush and receiving its late callback cannot resurrect A or overwrite B", async () => {
		const { store, write } = setup();
		await store.load(async () => saved("a", "b"));
		store.updateProvider("a", patch("edited A"));
		store.deleteProvider("a");
		expect(store.updateProvider("a", patch("late A"))).toBe(false);
		expect(store.settings.providerSettings).toEqual([configured("b")]);
		await store.flush();
		expect(write.mock.calls[0][0].providerSettings).toEqual([configured("b")]);
	});

	test("a new instance cannot reuse a deleted ID while old callbacks may still exist", async () => {
		const candidates = ["a", "fresh"];
		const store = new SettingsStore(async () => {}, async () => {}, defaultsForType, () => {}, () => candidates.shift()!);
		await store.load(async () => saved("a"));
		store.deleteProvider("a");
		expect(store.addProvider(defaults)?.providerInstanceId).toBe("fresh");
		expect(store.updateProvider("a", patch("late"))).toBe(false);
		await store.flush();
	});

	test("edits to two providers within one turn persist together and are visible immediately", async () => {
		const { store, write } = setup();
		await store.load(async () => saved("a", "b"));
		store.updateProvider("a", patch("first"));
		store.updateProvider("b", patch("second"));
		expect(store.settings.providerSettings).toMatchObject([{ path: "first" }, { path: "second" }]);
		await store.flush();
		expect(write).toHaveBeenCalledTimes(1);
		expect(write.mock.calls[0][0].providerSettings).toMatchObject([{ path: "first" }, { path: "second" }]);
	});

	test("reorder leaves late callbacks attached to the same ID and preserves unknown fields", async () => {
		const { store, write } = setup();
		await store.load(async () => ({ ...saved("a", "b"), privateTop: "keep", providerSettings: [
			{ ...configured("a"), privateField: { nested: true } }, configured("b"),
		] }));
		store.reorderProviders(["b", "a"]);
		store.updateProvider("a", patch("late edit"));
		await store.flush();
		expect(write.mock.calls[0][0]).toMatchObject({ privateTop: "keep", providerSettings: [
			{ providerInstanceId: "b", path: "b" },
			{ providerInstanceId: "a", path: "late edit", privateField: { nested: true } },
		] });
	});

	test("overlapping flushes serialize writes and coalesce outstanding edits into the latest snapshot", async () => {
		const first = deferred<void>();
		const { store, write } = setup(jest.fn<Promise<void>, [EntitiesSettings]>()
			.mockImplementationOnce(() => first.promise).mockResolvedValue(undefined));
		await store.load(async () => saved("a", "b"));
		store.updateProvider("a", patch("first"));
		const flush = store.flush();
		await Promise.resolve();
		expect(write).toHaveBeenCalledTimes(1);
		store.updateProvider("a", patch("intermediate"));
		store.updateProvider("b", patch("last"));
		store.deleteProvider("a");
		expect(store.flush()).toBe(flush);
		expect(write).toHaveBeenCalledTimes(1);
		expect(write.mock.calls[0][0].providerSettings).toMatchObject([{ path: "first" }, { path: "b" }]);
		first.resolve();
		expect(await flush).toBe(true);
		expect(write).toHaveBeenCalledTimes(2);
		expect(write.mock.calls[1][0].providerSettings).toMatchObject([{ providerInstanceId: "b", path: "last" }]);
		expect(store.hasPendingSave).toBe(false);
	});

	test("UI drafts and nested defaults cannot mutate canonical data without an edit", async () => {
		const { store } = setup();
		await store.load(async () => null);
		const a = store.addProvider(defaults)!;
		const b = store.addProvider(defaults)!;
		const filters = [{ type: "include", property: "kind", value: "person" }];
		store.updateProvider(a.providerInstanceId, { entityFilters: filters } as Partial<EntityProviderUserSettings>);
		filters[0].value = "mutated draft";
		const draft = store.settings;
		draft.providerSettings.splice(0, 1);
		expect(store.settings.providerSettings).toMatchObject([
			{ entityFilters: [{ value: "person" }] }, { providerInstanceId: b.providerInstanceId, entityFilters: [] },
		]);
		expect(defaults.entityFilters).toEqual([]);
		await store.flush();
	});
});

describe("recovery and lifecycle", () => {
	test("failed saves are visible, retain both edits, and retry the newest state", async () => {
		const { store, write, report } = setup(jest.fn<Promise<void>, [EntitiesSettings]>()
			.mockRejectedValueOnce(new Error("disk full")).mockResolvedValue(undefined));
		await store.load(async () => saved("a", "b"));
		store.updateProvider("a", patch("first"));
		expect(await store.flush()).toBe(false);
		expect(store.hasPendingSave).toBe(true);
		expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: "disk full" }));
		store.updateProvider("b", patch("second"));
		expect(await store.flush()).toBe(true);
		expect(write.mock.calls[1][0].providerSettings).toMatchObject([{ path: "first" }, { path: "second" }]);
		expect(store.saveError).toBeUndefined();
		expect(store.hasPendingSave).toBe(false);
	});

	test.each([{ schemaVersion: 2, providerSettings: [configured("a")] }, { providerSettings: "corrupt" }])(
		"protected input survives every edit/retry/flush/unload path: %j", async input => {
			const { store, write, backup } = setup();
			const before = JSON.stringify(input);
			expect(await store.load(async () => input)).toBe(false);
			expect(store.isReadOnly).toBe(true);
			expect(store.addProvider(defaults)).toBeUndefined();
			expect(store.updateProvider("a", patch("no"))).toBe(false);
			expect(store.deleteProvider("a")).toBe(false);
			expect(store.reorderProviders([])).toBe(false);
			expect(await store.flush()).toBe(false);
			expect(await store.load(async () => input)).toBe(false);
			expect(await store.close()).toBe(false);
			expect(write).not.toHaveBeenCalled();
			expect(backup).not.toHaveBeenCalled();
			expect(JSON.stringify(input)).toBe(before);
		}
	);

	test("a read failure is recoverable and simultaneous retries cannot overwrite later edits", async () => {
		const { store, write, report } = setup();
		expect(await store.load(async () => { throw new Error("read failed"); })).toBe(false);
		expect(report).toHaveBeenCalled();
		const read = deferred<unknown>();
		const retry = store.load(() => read.promise);
		const ignoredRead = jest.fn(async () => saved("stale"));
		expect(store.load(ignoredRead)).toBe(retry);
		read.resolve(saved("a"));
		expect(await retry).toBe(true);
		store.updateProvider("a", patch("new"));
		expect(await store.load(ignoredRead)).toBe(false);
		expect(ignoredRead).not.toHaveBeenCalled();
		expect(store.loadError).toBeUndefined();
		await store.flush();
		expect(write.mock.calls[0][0].providerSettings).toMatchObject([{ path: "new" }]);
	});

	test("migration waits for an original-data backup before enabling writes", async () => {
		const { store, backup, write } = setup();
		const pending = deferred<void>();
		backup.mockReturnValueOnce(pending.promise);
		const original = { privateField: [false, null], providerSettings: [defaults] };
		const load = store.load(async () => original);
		await Promise.resolve();
		expect(backup).toHaveBeenCalledWith(original);
		expect(store.isReadOnly).toBe(true);
		expect(await store.flush()).toBe(false);
		expect(write).not.toHaveBeenCalled();
		pending.resolve();
		expect(await load).toBe(true);
		await store.flush();
		expect(write).toHaveBeenCalledTimes(1);
		expect(write.mock.calls[0][0].schemaVersion).toBe(1);
	});

	test("backup failures stay read-only until successful retry", async () => {
		const { store, backup, write } = setup();
		backup.mockRejectedValueOnce(new Error("backup failed"));
		const read = async () => ({ providerSettings: [defaults] });
		expect(await store.load(read)).toBe(false);
		expect(store.loadError?.message).toBe("backup failed");
		expect(store.addProvider(defaults)).toBeUndefined();
		expect(await store.flush()).toBe(false);
		expect(write).not.toHaveBeenCalled();
		expect(await store.load(read)).toBe(true);
		await store.flush();
		expect(backup).toHaveBeenCalledTimes(2);
		expect(write).toHaveBeenCalledTimes(1);
	});

	test("a clean flush, immediate edit and close drain the edit in the same turn", async () => {
		const { store, write } = setup();
		await store.load(async () => saved());
		void store.flush();
		const provider = store.addProvider(defaults)!;
		expect(await store.close()).toBe(true);
		expect(write).toHaveBeenCalledTimes(1);
		expect(write.mock.calls[0][0].providerSettings).toEqual([provider]);
		expect(store.hasPendingSave).toBe(false);
		expect(store.updateProvider(provider.providerInstanceId, patch("late"))).toBe(false);
	});

	test("close drains an in-flight write and latest queued changes, exposing any final failure", async () => {
		const first = deferred<void>();
		const { store, write, report } = setup(jest.fn<Promise<void>, [EntitiesSettings]>()
			.mockReturnValueOnce(first.promise).mockRejectedValueOnce(new Error("unload save failed")));
		await store.load(async () => saved("a"));
		store.updateProvider("a", patch("first"));
		await Promise.resolve();
		store.updateProvider("a", patch("last"));
		const close = store.close();
		first.resolve();
		expect(await close).toBe(false);
		expect(write.mock.calls[1][0].providerSettings).toMatchObject([{ path: "last" }]);
		expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: "unload save failed" }));
		expect(store.hasPendingSave).toBe(true);
	});

	test("unload during load or backup cannot enable the store or write migrated data later", async () => {
		const { store, write, backup } = setup();
		const pending = deferred<void>();
		backup.mockReturnValueOnce(pending.promise);
		const load = store.load(async () => ({ providerSettings: [defaults] }));
		await Promise.resolve();
		await store.close();
		pending.resolve();
		expect(await load).toBe(false);
		expect(store.isReadOnly).toBe(true);
		expect(write).not.toHaveBeenCalled();
	});
});

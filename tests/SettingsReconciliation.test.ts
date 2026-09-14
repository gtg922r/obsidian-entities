import { SettingsStore } from "../src/SettingsStore";
import type { EntityProviderUserSettings } from "../src/Providers/EntityProvider";
import type { SettingsDiskSnapshot, SettingsPersistence } from "../src/SettingsStorage";
import { setImmediate } from "timers";

const defaults = { providerTypeID: "folder", enabled: true, icon: "folder", path: "", entityFilters: [] };
const saved = (path: string) => ({
	schemaVersion: 1,
	providerSettings: [{ ...defaults, providerInstanceId: "a", path }],
});
const raw = (path: string) => JSON.stringify(saved(path));
const patch = (path: string) => ({ path }) as Partial<EntityProviderUserSettings>;
type Snapshot = SettingsDiskSnapshot;

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
	return { promise, resolve, reject };
}

// End the current microtask turn without relying on a wall-clock delay.
const nextTurn = () => new Promise<void>(resolve => setImmediate(resolve));

function draftParticipant(pending = false) {
	const state = { generation: 0, pending, value: "exact pending text", baseline: "original baseline" };
	const commit = jest.fn(() => { state.pending = false; state.generation++; });
	const rollback = jest.fn();
	return {
		state, commit, rollback,
		capture: () => ({ generation: state.generation, pending: state.pending }),
		prepareDiscard: jest.fn((generation: number) => generation === state.generation ? { commit, rollback } : undefined),
	};
}

function setup(drafts = draftParticipant()) {
	let disk: Snapshot = { kind: "file", raw: raw("baseline") };
	const readSnapshot = jest.fn<Promise<Snapshot>, []>(async () => disk);
	const writeSnapshot = jest.fn<Promise<void>, [string]>(async value => { disk = { kind: "file", raw: value }; });
	const backupSnapshot = jest.fn<Promise<void>, Parameters<SettingsPersistence["backupSnapshot"]>>().mockResolvedValue(undefined);
	const changed = jest.fn();
	let nextId = 0;
	const createId = jest.fn(() => `generated-${++nextId}`);
	const store = new SettingsStore({ readSnapshot, writeSnapshot, backupSnapshot }, {
		drafts,
		defaultsForType: type => type === "folder" ? defaults : undefined,
		createId,
		onCanonicalChange: changed,
	});
	return {
		store, drafts, readSnapshot, writeSnapshot, backupSnapshot, changed, createId,
		setDisk: (value: Snapshot) => { disk = value; },
		external: (path: string) => { disk = { kind: "file", raw: raw(path) }; },
		getDisk: () => disk,
	};
}

async function loaded(drafts = draftParticipant()) {
	const harness = setup(drafts);
	expect(await harness.store.load()).toBe(true);
	harness.changed.mockClear();
	return harness;
}

describe("strict external settings observations", () => {
	test("accepts a clean external snapshot once, preserving IDs and unknown data without acknowledgment writes", async () => {
		const h = await loaded();
		const external = {
			...saved("external"), unknownTop: { nested: [false, null, 3] },
			providerSettings: [{ ...saved("external").providerSettings[0], privateField: { future: true } }],
		};
		h.setDisk({ kind: "file", raw: JSON.stringify(external) });
		const accepted = await h.store.observeExternal();
		expect(accepted).toMatchObject({ kind: "accepted", canonicalChanged: true });
		expect(h.store.settings).toEqual(external);
		expect(h.changed).toHaveBeenCalledTimes(1);
		expect(await h.store.observeExternal()).toMatchObject({
			kind: "unchanged", canonicalChanged: false, canonicalVersion: accepted.canonicalVersion,
		});
		expect(h.writeSnapshot).not.toHaveBeenCalled();
		expect(h.backupSnapshot).not.toHaveBeenCalled();
		expect(h.store.hasPendingSave).toBe(false);
		expect(h.store.recovery).toBeUndefined();
	});

	test("an in-flight writer can await its own notification before fulfilling", async () => {
		const h = await loaded();
		const observed = deferred<Awaited<ReturnType<SettingsStore["observeExternal"]>>>();
		const finish = deferred<void>();
		h.writeSnapshot.mockImplementation(async value => {
			h.setDisk({ kind: "file", raw: value });
			observed.resolve(await h.store.observeExternal());
			await finish.promise;
		});
		h.store.updateProvider("a", patch("local"));
		const flushing = h.store.flush();
		expect(await observed.promise).toMatchObject({ kind: "own-pending", canonicalChanged: false });
		expect(h.store.hasPendingSave).toBe(true);
		expect(h.store.recovery).toBeUndefined();
		finish.resolve();
		expect(await flushing).toBe(true);
		expect(h.store.hasPendingSave).toBe(false);
		expect(await h.store.observeExternal()).toMatchObject({ kind: "unchanged", canonicalChanged: false });
		expect(h.writeSnapshot).toHaveBeenCalledTimes(1);
	});

	test("an echo before rejection and repeated failed echoes never mark a write saved", async () => {
		const h = await loaded();
		const observed = deferred<void>();
		const finish = deferred<void>();
		h.writeSnapshot.mockImplementation(async value => {
			h.setDisk({ kind: "file", raw: value });
			expect(await h.store.observeExternal()).toMatchObject({ kind: "own-pending" });
			observed.resolve();
			await finish.promise;
		});
		h.store.updateProvider("a", patch("local"));
		const flushing = h.store.flush();
		await observed.promise;
		finish.reject(new Error("write rejected after notification"));
		expect(await flushing).toBe(false);
		expect(h.store.hasPendingSave).toBe(true);
		expect(h.store.saveError).toBeDefined();
		expect(await h.store.observeExternal()).toMatchObject({ kind: "own-failed", canonicalChanged: false });
		expect(await h.store.observeExternal()).toMatchObject({ kind: "own-failed", canonicalChanged: false });
		expect(h.store.hasPendingSave).toBe(true);
		expect(h.writeSnapshot).toHaveBeenCalledTimes(1);
	});

	test("bounds concurrent notifications to one active capture and one fresh follow-up", async () => {
		const h = await loaded();
		const first = deferred<Snapshot>();
		const second = deferred<Snapshot>();
		const enteredFirst = deferred<void>();
		const enteredSecond = deferred<void>();
		h.readSnapshot.mockClear();
		h.readSnapshot.mockImplementationOnce(() => { enteredFirst.resolve(); return first.promise; })
			.mockImplementationOnce(() => { enteredSecond.resolve(); return second.promise; });
		const observations = [h.store.observeExternal()];
		await enteredFirst.promise;
		for (let index = 0; index < 20; index++) observations.push(h.store.observeExternal());
		expect(h.readSnapshot).toHaveBeenCalledTimes(1);
		first.resolve({ kind: "file", raw: raw("first") });
		await enteredSecond.promise;
		expect(h.readSnapshot).toHaveBeenCalledTimes(2);
		second.resolve({ kind: "file", raw: raw("latest") });
		await Promise.all(observations);
		expect(h.readSnapshot).toHaveBeenCalledTimes(2);
		expect(h.store.settings).toEqual(saved("latest"));
		expect(h.writeSnapshot).not.toHaveBeenCalled();
	});

	test("preflights a local save so an unnotified external change is protected", async () => {
		const h = await loaded();
		h.external("external");
		h.store.updateProvider("a", patch("local"));
		expect(await h.store.flush()).toBe(false);
		expect(h.writeSnapshot).not.toHaveBeenCalled();
		expect(h.store.settings).toEqual(saved("local"));
		expect(h.store.recovery?.first?.raw).toBe(raw("external"));
	});

	test("retains an external candidate even when a previously dispatched write overwrites it", async () => {
		const h = await loaded();
		const entered = deferred<void>();
		const finish = deferred<void>();
		h.writeSnapshot.mockImplementation(async value => {
			entered.resolve();
			await finish.promise;
			h.setDisk({ kind: "file", raw: value });
		});
		h.store.updateProvider("a", patch("local"));
		const flushing = h.store.flush();
		await entered.promise;
		h.external("external");
		expect(await h.store.observeExternal()).toMatchObject({ kind: "protected", canonicalChanged: false });
		finish.resolve();
		await flushing;
		expect(h.store.recovery?.first?.raw).toBe(raw("external"));
		expect(h.store.settings).toEqual(saved("local"));
		expect(h.getDisk()).toEqual({ kind: "file", raw: h.writeSnapshot.mock.calls[0][0] });
		await h.store.observeExternal();
		expect(h.store.recovery?.first?.raw).toBe(raw("external"));
		h.store.updateProvider("a", patch("later local"));
		expect(await h.store.flush()).toBe(false);
		expect(h.writeSnapshot).toHaveBeenCalledTimes(1);
	});

	test("retains only first and latest offers across many external changes; errors do not evict them", async () => {
		const h = await loaded(draftParticipant(true));
		for (let index = 0; index < 40; index++) {
			h.external(`external-${index}`);
			expect(await h.store.observeExternal()).toMatchObject({ kind: "protected" });
		}
		expect(h.store.recovery?.first?.raw).toBe(raw("external-0"));
		expect(h.store.recovery?.latest?.raw).toBe(raw("external-39"));
		h.readSnapshot.mockRejectedValueOnce(new Error("temporary read failure"));
		await h.store.observeExternal();
		expect(h.store.recovery?.first?.raw).toBe(raw("external-0"));
		expect(h.store.recovery?.latest?.raw).toBe(raw("external-39"));
		expect(h.store.settings).toEqual(saved("baseline"));
		expect(h.drafts.state).toMatchObject({ pending: true, value: "exact pending text", baseline: "original baseline" });
		expect(h.writeSnapshot).not.toHaveBeenCalled();
		expect(h.backupSnapshot).not.toHaveBeenCalled();
	});

	test("evicted legacy candidates do not reserve generated provider IDs for the canonical lifetime", async () => {
		const h = await loaded(draftParticipant(true));
		let evictedId: string | undefined;
		for (let index = 0; index < 30; index++) {
			h.setDisk({ kind: "file", raw: JSON.stringify({ providerSettings: [{ ...defaults, path: `legacy-${index}` }] }) });
			expect(await h.store.observeExternal()).toMatchObject({ kind: "protected" });
			if (index === 1) evictedId = h.store.recovery?.latest?.settings.providerSettings[0].providerInstanceId;
		}
		expect(evictedId).toBeDefined();
		expect(h.store.recovery?.first?.settings.providerSettings[0].providerInstanceId).not.toBe(evictedId);
		expect(h.store.recovery?.latest?.settings.providerSettings[0].providerInstanceId).not.toBe(evictedId);
		h.createId.mockReturnValueOnce(evictedId!);
		expect(h.store.addProvider(defaults)?.providerInstanceId).toBe(evictedId);
		expect(await h.store.flush()).toBe(false);
		expect(h.writeSnapshot).not.toHaveBeenCalled();
		expect(h.backupSnapshot).not.toHaveBeenCalled();
	});

	test("protects a pending draft while a clean focused field permits external acceptance", async () => {
		const drafts = draftParticipant();
		const h = await loaded(drafts);
		h.external("clean external");
		expect(await h.store.observeExternal()).toMatchObject({ kind: "accepted" });
		drafts.state.pending = true;
		drafts.state.generation++;
		h.external("draft conflict");
		expect(await h.store.observeExternal()).toMatchObject({ kind: "protected", canonicalChanged: false });
		expect(h.store.settings).toEqual(saved("clean external"));
		expect(drafts.commit).not.toHaveBeenCalled();
		expect(drafts.state.pending).toBe(true);
	});

	test.each([
		["missing established data", { kind: "missing" } as Snapshot],
		["malformed JSON", { kind: "file", raw: "{invalid" } as Snapshot],
		["future schema", { kind: "file", raw: JSON.stringify({ schemaVersion: 2, providerSettings: [] }) } as Snapshot],
	])("protects persistence after %s", async (_label, snapshot) => {
		const h = await loaded();
		h.setDisk(snapshot);
		await h.store.observeExternal();
		expect(h.store.recovery?.error).toBeDefined();
		expect(h.store.settings).toEqual(saved("baseline"));
		h.store.updateProvider("a", patch("local"));
		expect(await h.store.flush()).toBe(false);
		expect(h.writeSnapshot).not.toHaveBeenCalled();
	});

	test.each(["stat failed", "read failed"])("an explicit unchanged check clears observation error after %s without saving dirty state", async message => {
		const h = await loaded();
		h.writeSnapshot.mockRejectedValueOnce(new Error("save failed"));
		h.store.updateProvider("a", patch("local"));
		expect(await h.store.flush()).toBe(false);
		const saveError = h.store.saveError;
		h.readSnapshot.mockRejectedValueOnce(new Error(message));
		await h.store.observeExternal();
		expect(h.store.recovery?.error).toBeDefined();
		expect(h.store.recovery?.first).toBeUndefined();
		expect(await h.store.retryObservation()).toMatchObject({ kind: "unchanged", canonicalChanged: false });
		expect(h.store.recovery).toBeUndefined();
		expect(h.store.saveError).toBe(saveError);
		expect(h.store.hasPendingSave).toBe(true);
		expect(h.store.settings).toEqual(saved("local"));
		expect(h.writeSnapshot).toHaveBeenCalledTimes(1);
		expect(await h.store.flush()).toBe(true);
		expect(h.writeSnapshot).toHaveBeenCalledTimes(2);
	});

	test.each(["stat failed", "read failed"])("checking failed-write bytes after %s clears only observation protection", async message => {
		const h = await loaded();
		h.writeSnapshot.mockImplementationOnce(async value => {
			h.setDisk({ kind: "file", raw: value });
			throw new Error("write failed after reaching disk");
		});
		h.store.updateProvider("a", patch("local"));
		expect(await h.store.flush()).toBe(false);
		const saveError = h.store.saveError;
		h.readSnapshot.mockRejectedValueOnce(new Error(message));
		await h.store.observeExternal();
		expect(h.store.recovery?.error).toBeDefined();
		expect(h.store.recovery?.first).toBeUndefined();
		expect(await h.store.retryObservation()).toMatchObject({ kind: "own-failed", canonicalChanged: false });
		expect(h.store.recovery).toBeUndefined();
		expect(h.store.saveError).toBe(saveError);
		expect(h.store.hasPendingSave).toBe(true);
		expect(h.store.settings).toEqual(saved("local"));
		expect(h.writeSnapshot).toHaveBeenCalledTimes(1);
		expect(await h.store.flush()).toBe(true);
		expect(h.writeSnapshot).toHaveBeenCalledTimes(2);
		expect(h.store.saveError).toBeUndefined();
		expect(h.store.hasPendingSave).toBe(false);
	});

	test("an unchanged check cannot dismiss a captured external conflict", async () => {
		const h = await loaded(draftParticipant(true));
		h.external("external");
		await h.store.observeExternal();
		h.external("baseline");
		await h.store.retryObservation();
		expect(h.store.recovery?.first?.raw).toBe(raw("external"));
		expect(h.drafts.state.pending).toBe(true);
		expect(h.writeSnapshot).not.toHaveBeenCalled();
	});

	test("normalizes and backs up a clean external migration once without rewriting its bytes", async () => {
		const h = await loaded();
		const legacy = JSON.stringify({ privateTop: [false, null], providerSettings: [defaults] });
		h.setDisk({ kind: "file", raw: legacy });
		expect(await h.store.observeExternal()).toMatchObject({ kind: "accepted" });
		const canonical = h.store.settings;
		expect(canonical).toMatchObject({ privateTop: [false, null], providerSettings: [{ providerInstanceId: "generated-1" }] });
		expect(h.backupSnapshot).toHaveBeenCalledTimes(1);
		expect(h.backupSnapshot.mock.calls[0][0]).toBe(legacy);
		expect(await h.store.observeExternal()).toMatchObject({ kind: "unchanged" });
		expect(h.store.settings).toEqual(canonical);
		expect(h.backupSnapshot).toHaveBeenCalledTimes(1);
		expect(h.writeSnapshot).not.toHaveBeenCalled();
		expect(h.getDisk()).toEqual({ kind: "file", raw: legacy });
	});

	test("a failed migration backup leaves external bytes and canonical state protected", async () => {
		const h = await loaded();
		const legacy = JSON.stringify({ providerSettings: [defaults] });
		h.setDisk({ kind: "file", raw: legacy });
		h.backupSnapshot.mockRejectedValueOnce(new Error("backup failed"));
		await h.store.observeExternal();
		expect(h.store.settings).toEqual(saved("baseline"));
		expect(h.store.recovery?.error).toBeDefined();
		expect(h.getDisk()).toEqual({ kind: "file", raw: legacy });
		expect(h.writeSnapshot).not.toHaveBeenCalled();
	});

	test("a migration recheck accepts a newer valid external snapshot without awaiting its own adoption", async () => {
		const h = await loaded();
		const legacy = JSON.stringify({ providerSettings: [{ ...defaults, path: "migration external" }] });
		h.setDisk({ kind: "file", raw: legacy });
		h.backupSnapshot.mockImplementationOnce(async () => { h.external("newer external"); });
		const observation = await h.store.observeExternal();
		expect(observation).toMatchObject({ kind: "accepted", canonicalChanged: true });
		expect(h.store.settings).toEqual(saved("newer external"));
		expect(h.changed).toHaveBeenCalledTimes(1);
		expect(h.backupSnapshot).toHaveBeenCalledTimes(1);
		expect(h.backupSnapshot).toHaveBeenCalledWith(legacy, "migration");
		expect(h.getDisk()).toEqual({ kind: "file", raw: raw("newer external") });
		expect(h.writeSnapshot).not.toHaveBeenCalled();
		expect(h.store.recovery).toBeUndefined();
	});

	test("a baseline reversion observed during migration backup prevents obsolete external adoption", async () => {
		const h = await loaded();
		const legacy = JSON.stringify({ providerSettings: [{ ...defaults, path: "obsolete external" }] });
		const entered = deferred<void>();
		const finish = deferred<void>();
		h.backupSnapshot.mockImplementationOnce(() => { entered.resolve(); return finish.promise; });
		h.setDisk({ kind: "file", raw: legacy });
		const observation = h.store.observeExternal();
		await entered.promise;
		h.external("baseline");
		expect(await h.store.observeExternal()).toMatchObject({ kind: "unchanged", canonicalChanged: false });
		finish.resolve();
		expect(await observation).toMatchObject({ canonicalChanged: false });
		expect(h.store.settings).toEqual(saved("baseline"));
		expect(h.changed).not.toHaveBeenCalled();
		expect(h.backupSnapshot).toHaveBeenCalledTimes(1);
		expect(h.backupSnapshot).toHaveBeenCalledWith(legacy, "migration");
		expect(h.getDisk()).toEqual({ kind: "file", raw: raw("baseline") });
		expect(h.writeSnapshot).not.toHaveBeenCalled();
		expect(h.store.recovery).toBeUndefined();
	});

	test("a migration recheck returning to a successfully saved local baseline cancels obsolete adoption", async () => {
		const h = await loaded();
		h.store.updateProvider("a", patch("saved local baseline"));
		expect(await h.store.flush()).toBe(true);
		const durableRaw = h.writeSnapshot.mock.calls[0][0];
		const legacy = JSON.stringify({ providerSettings: [{ ...defaults, path: "obsolete external" }] });
		h.changed.mockClear();
		h.setDisk({ kind: "file", raw: legacy });
		h.backupSnapshot.mockImplementationOnce(async () => { h.setDisk({ kind: "file", raw: durableRaw }); });
		expect(await h.store.observeExternal()).toMatchObject({ canonicalChanged: false });
		expect(h.store.settings).toEqual(saved("saved local baseline"));
		expect(h.changed).not.toHaveBeenCalled();
		expect(h.backupSnapshot).toHaveBeenCalledTimes(1);
		expect(h.backupSnapshot).toHaveBeenCalledWith(legacy, "migration");
		expect(h.getDisk()).toEqual({ kind: "file", raw: durableRaw });
		expect(h.writeSnapshot).toHaveBeenCalledTimes(1);
		expect(h.store.hasPendingSave).toBe(false);
		expect(h.store.recovery).toBeUndefined();
	});

	test.each(["draft becomes pending", "store closes", "backup fails"])("retains first and latest external data when %s during an older migration backup", async transition => {
		const h = await loaded();
		const older = JSON.stringify({ providerSettings: [{ ...defaults, path: "older external" }] });
		const entered = deferred<void>();
		const finish = deferred<void>();
		h.backupSnapshot.mockImplementationOnce(() => { entered.resolve(); return finish.promise; });
		h.setDisk({ kind: "file", raw: older });
		const firstObservation = h.store.observeExternal();
		await entered.promise;
		h.external("newer external");
		const latestObservation = h.store.observeExternal();
		await nextTurn();
		let closing: Promise<boolean> | undefined;
		if (transition === "store closes") closing = h.store.close();
		else if (transition === "draft becomes pending") {
			h.drafts.state.pending = true;
			h.drafts.state.generation++;
		}
		if (transition === "backup fails") finish.reject(new Error("migration backup failed"));
		else finish.resolve();
		await Promise.all([firstObservation, latestObservation, closing]);
		expect(h.store.recovery?.first?.raw).toBe(older);
		expect(h.store.recovery?.latest?.raw).toBe(raw("newer external"));
		expect(h.store.settings).toEqual(saved("baseline"));
		expect(h.changed).not.toHaveBeenCalled();
		expect(h.writeSnapshot).not.toHaveBeenCalled();
		if (transition === "backup fails") expect(h.store.recovery?.error).toBeDefined();
	});
});

describe("explicit external settings recovery choices", () => {
	test("reload commits the selected external canonical and matching draft discard before notification", async () => {
		const h = await loaded(draftParticipant(true));
		h.external("external");
		await h.store.observeExternal();
		const choice = h.store.getRecoveryChoice()!;
		expect(choice.requiresWrite).toBe(false);
		const published: { settings: SettingsStore["settings"]; pending: boolean }[] = [];
		h.changed.mockImplementation(() => { published.push({ settings: h.store.settings, pending: h.drafts.state.pending }); });
		await h.store.reloadExternal(choice);
		expect(h.store.settings).toEqual(saved("external"));
		expect(h.drafts.commit).toHaveBeenCalledTimes(1);
		expect(h.changed).toHaveBeenCalledTimes(1);
		expect(published).toEqual([{ settings: saved("external"), pending: false }]);
		expect(h.store.recovery).toBeUndefined();
		expect(h.writeSnapshot).not.toHaveBeenCalled();
		expect(h.backupSnapshot).toHaveBeenCalledTimes(1);
	});

	test("keep local can await a matching own notification and retains pending drafts on successful resolution", async () => {
		const h = await loaded(draftParticipant(true));
		h.external("external");
		await h.store.observeExternal();
		const choice = h.store.getRecoveryChoice()!;
		h.writeSnapshot.mockImplementation(async value => {
			h.setDisk({ kind: "file", raw: value });
			expect(await h.store.observeExternal()).toMatchObject({ kind: "own-pending", canonicalChanged: false });
		});
		await h.store.keepLocalAndRetry(choice);
		expect(h.store.recovery).toBeUndefined();
		expect(h.store.settings).toEqual(saved("baseline"));
		expect(h.drafts.state).toMatchObject({ pending: true, value: "exact pending text", baseline: "original baseline" });
		expect(h.drafts.commit).not.toHaveBeenCalled();
		expect(h.writeSnapshot).toHaveBeenCalledTimes(1);
		expect(h.store.hasPendingSave).toBe(false);
	});

	test("a choice echo classified after adapter fulfillment does not invalidate successful resolution", async () => {
		const h = await loaded(draftParticipant(true));
		h.external("external");
		await h.store.observeExternal();
		const entered = deferred<string>();
		const finishWrite = deferred<void>();
		h.writeSnapshot.mockImplementationOnce(value => {
			h.setDisk({ kind: "file", raw: value });
			entered.resolve(value);
			return finishWrite.promise;
		});
		const recovery = h.store.keepLocalAndRetry(h.store.getRecoveryChoice()!);
		const written = await entered.promise;
		const captureEntered = deferred<void>();
		const finishCapture = deferred<Snapshot>();
		h.readSnapshot.mockImplementationOnce(() => { captureEntered.resolve(); return finishCapture.promise; });
		const observation = h.store.observeExternal();
		await captureEntered.promise;
		// Dispatch already awaits this exact promise, so its settlement precedes this continuation.
		finishWrite.resolve();
		await finishWrite.promise;
		finishCapture.resolve({ kind: "file", raw: written });
		const result = await observation;
		expect(result.kind).not.toBe("own-pending");
		expect(result.canonicalChanged).toBe(false);
		expect(await recovery).toMatchObject({ kind: "accepted", canonicalChanged: false });
		expect(h.store.recovery).toBeUndefined();
		expect(h.store.saveError).toBeUndefined();
		expect(h.drafts.state.pending).toBe(true);
		expect(h.writeSnapshot).toHaveBeenCalledTimes(1);
	});

	test("a third snapshot during recovery backup invalidates the choice before overwrite", async () => {
		const h = await loaded(draftParticipant(true));
		h.external("external");
		await h.store.observeExternal();
		const choice = h.store.getRecoveryChoice()!;
		const entered = deferred<void>();
		const finish = deferred<void>();
		h.backupSnapshot.mockImplementation(async () => { entered.resolve(); await finish.promise; });
		const recovery = h.store.keepLocalAndRetry(choice);
		await entered.promise;
		h.external("third");
		finish.resolve();
		await recovery;
		expect(h.writeSnapshot).not.toHaveBeenCalled();
		expect(h.store.recovery?.first?.raw).toBe(raw("external"));
		expect(h.store.recovery?.latest?.raw).toBe(raw("third"));
		expect(h.store.settings).toEqual(saved("baseline"));
		expect(h.drafts.state.pending).toBe(true);
	});

	test.each(["keep", "reload"].flatMap(action => [2, 3, 4].map(depth => ({ action, depth }))))(
		"recovery $action respects a third capture admitted at microtask depth $depth", async ({ action, depth }) => {
		const h = await loaded(draftParticipant(true));
		h.external("external");
		await h.store.observeExternal();
		const third = deferred<Snapshot>();
		let pending = false;
		let wroteDuringCapture = false;
		let publishedDuringCapture = false;
		let discardedDuringCapture = false;
		h.changed.mockImplementation(() => { publishedDuringCapture ||= pending; });
		const commit = h.drafts.commit.getMockImplementation()!;
		h.drafts.commit.mockImplementation(() => { discardedDuringCapture ||= pending; commit(); });
		let observation: ReturnType<SettingsStore["observeExternal"]> | undefined;
		let choiceReads = 0;
		h.readSnapshot.mockImplementation(async () => {
			choiceReads++;
			if (choiceReads === 2) {
				const captured = h.getDisk();
				let admission = Promise.resolve();
				for (let index = 0; index < depth; index++) admission = admission.then(() => {});
				void admission.then(() => {
					h.external("third");
					pending = true;
					observation = h.store.observeExternal();
				});
				return captured;
			}
			return pending ? third.promise : h.getDisk();
		});
		h.writeSnapshot.mockImplementation(async value => {
			wroteDuringCapture ||= pending;
			h.setDisk({ kind: "file", raw: value });
		});
		const choice = h.store.getRecoveryChoice()!;
		const recovery = action === "keep" ? h.store.keepLocalAndRetry(choice) : h.store.reloadExternal(choice);
		await nextTurn();
		expect(observation).toBeDefined();
		pending = false;
		third.resolve({ kind: "file", raw: raw("third") });
		const [result] = await Promise.all([recovery, observation]);
		expect(wroteDuringCapture).toBe(false);
		expect(publishedDuringCapture).toBe(false);
		expect(discardedDuringCapture).toBe(false);
		if (depth < 4) {
			expect(result).toMatchObject({ kind: "stale" });
			expect(h.writeSnapshot).not.toHaveBeenCalled();
			expect(h.drafts.commit).not.toHaveBeenCalled();
			expect(h.changed).not.toHaveBeenCalled();
			expect(h.store.recovery?.latest?.raw).toBe(raw("third"));
			expect(h.store.settings).toEqual(saved("baseline"));
		}
	});

	test("draft changes during backup invalidate discard without applying or losing the new draft", async () => {
		const h = await loaded(draftParticipant(true));
		h.external("external");
		await h.store.observeExternal();
		const choice = h.store.getRecoveryChoice()!;
		const entered = deferred<void>();
		const finish = deferred<void>();
		h.backupSnapshot.mockImplementation(async () => { entered.resolve(); await finish.promise; });
		const recovery = h.store.reloadExternal(choice);
		await entered.promise;
		h.drafts.state.generation++;
		h.drafts.state.value = "new composing text";
		finish.resolve();
		await recovery;
		expect(h.drafts.commit).not.toHaveBeenCalled();
		expect(h.store.settings).toEqual(saved("baseline"));
		expect(h.drafts.state).toMatchObject({ pending: true, value: "new composing text" });
		expect(h.store.recovery?.first?.raw).toBe(raw("external"));
		expect(h.writeSnapshot).not.toHaveBeenCalled();
	});

	test("a failed recovery backup leaves both sides and does not dispatch a write", async () => {
		const h = await loaded(draftParticipant(true));
		h.external("external");
		await h.store.observeExternal();
		h.backupSnapshot.mockRejectedValueOnce(new Error("backup failed"));
		await h.store.keepLocalAndRetry(h.store.getRecoveryChoice()!);
		expect(h.writeSnapshot).not.toHaveBeenCalled();
		expect(h.store.recovery?.first?.raw).toBe(raw("external"));
		expect(h.store.recovery?.error).toBeDefined();
		expect(h.store.settings).toEqual(saved("baseline"));
		expect(h.drafts.state.pending).toBe(true);
	});

	test("unavailable draft-discard preparation prevents a required restoration write", async () => {
		const h = await loaded(draftParticipant(true));
		h.external("external first");
		await h.store.observeExternal();
		h.external("external latest");
		await h.store.observeExternal();
		const choice = h.store.getRecoveryChoice("first")!;
		expect(choice.requiresWrite).toBe(true);
		h.drafts.prepareDiscard.mockReturnValueOnce(undefined);
		await h.store.restoreExternal(choice);
		expect(h.drafts.prepareDiscard).toHaveBeenCalledWith(choice.draftGeneration);
		expect(h.drafts.commit).not.toHaveBeenCalled();
		expect(h.drafts.state.pending).toBe(true);
		expect(h.store.settings).toEqual(saved("baseline"));
		expect(h.store.recovery?.first?.raw).toBe(raw("external first"));
		expect(h.store.recovery?.latest?.raw).toBe(raw("external latest"));
		expect(h.getDisk()).toEqual({ kind: "file", raw: raw("external latest") });
		expect(h.writeSnapshot).not.toHaveBeenCalled();
	});

	test("a captured version overwritten by a dispatched write requires explicit restoration", async () => {
		const h = await loaded(draftParticipant(true));
		const entered = deferred<void>();
		const finish = deferred<void>();
		h.writeSnapshot.mockImplementationOnce(async value => {
			entered.resolve();
			await finish.promise;
			h.setDisk({ kind: "file", raw: value });
		});
		h.store.updateProvider("a", patch("local"));
		const flushing = h.store.flush();
		await entered.promise;
		h.external("external");
		await h.store.observeExternal();
		finish.resolve();
		await flushing;
		await h.store.observeExternal();
		const choice = h.store.getRecoveryChoice()!;
		expect(choice.requiresWrite).toBe(true);
		await h.store.reloadExternal(choice);
		expect(h.writeSnapshot).toHaveBeenCalledTimes(1);
		expect(h.store.recovery).toBeDefined();
		await h.store.restoreExternal(h.store.getRecoveryChoice()!);
		expect(h.writeSnapshot).toHaveBeenCalledTimes(2);
		expect(h.writeSnapshot.mock.calls[1][0]).toBe(raw("external"));
		expect(h.store.settings).toEqual(saved("external"));
		expect(h.drafts.state.pending).toBe(false);
		expect(h.store.recovery).toBeUndefined();
	});

	test("a previous successful own-write duplicate preserves the latest candidate during restoration", async () => {
		const h = await loaded(draftParticipant(true));
		const localEntered = deferred<string>();
		const finishLocal = deferred<void>();
		h.writeSnapshot.mockImplementationOnce(async value => {
			localEntered.resolve(value);
			await finishLocal.promise;
			h.setDisk({ kind: "file", raw: value });
		});
		h.store.updateProvider("a", patch("local"));
		const flushing = h.store.flush();
		const localRaw = await localEntered.promise;
		h.external("external first");
		await h.store.observeExternal();
		h.external("external latest");
		await h.store.observeExternal();
		finishLocal.resolve();
		await flushing;
		await h.store.observeExternal();
		const choice = h.store.getRecoveryChoice()!;
		expect(choice.requiresWrite).toBe(true);
		expect(h.store.recovery?.latest?.raw).toBe(raw("external latest"));
		const restoreEntered = deferred<string>();
		const finishRestore = deferred<void>();
		h.writeSnapshot.mockImplementationOnce(async value => {
			restoreEntered.resolve(value);
			await finishRestore.promise;
			h.setDisk({ kind: "file", raw: value });
		});
		const recovery = h.store.restoreExternal(choice);
		expect(await restoreEntered.promise).toBe(raw("external latest"));
		expect(h.getDisk()).toEqual({ kind: "file", raw: localRaw });
		expect(await h.store.observeExternal()).toMatchObject({ kind: "unchanged", canonicalChanged: false });
		expect(h.store.recovery?.first?.raw).toBe(raw("external first"));
		expect(h.store.recovery?.latest?.raw).toBe(raw("external latest"));
		expect(h.store.recovery?.version).toBe(choice.version);
		finishRestore.resolve();
		expect(await recovery).toMatchObject({ kind: "accepted", canonicalChanged: true });
		expect(h.store.settings).toEqual(saved("external latest"));
		expect(h.store.recovery).toBeUndefined();
		expect(h.drafts.state.pending).toBe(false);
		expect(h.writeSnapshot).toHaveBeenCalledTimes(2);
	});

	test("a failed keep-local write with its own echo remains retryable without discarding drafts", async () => {
		const h = await loaded(draftParticipant(true));
		h.external("external");
		await h.store.observeExternal();
		h.writeSnapshot.mockImplementationOnce(async value => {
			h.setDisk({ kind: "file", raw: value });
			await h.store.observeExternal();
			throw new Error("recovery write failed");
		});
		await h.store.keepLocalAndRetry(h.store.getRecoveryChoice()!);
		expect(h.store.recovery?.first?.raw).toBe(raw("external"));
		expect(h.store.saveError).toBeDefined();
		expect(h.drafts.state.pending).toBe(true);
		expect(h.writeSnapshot).toHaveBeenCalledTimes(1);
		expect(await h.store.retryObservation()).toMatchObject({ kind: "own-failed" });
		await h.store.keepLocalAndRetry(h.store.getRecoveryChoice()!);
		expect(h.writeSnapshot).toHaveBeenCalledTimes(2);
		expect(h.store.recovery).toBeUndefined();
		expect(h.store.saveError).toBeUndefined();
		expect(h.drafts.state.pending).toBe(true);
		expect(h.drafts.commit).not.toHaveBeenCalled();
	});

	test("a third snapshot present at preflight cannot be overwritten by an older choice", async () => {
		const h = await loaded(draftParticipant(true));
		h.external("external");
		await h.store.observeExternal();
		const choice = h.store.getRecoveryChoice()!;
		h.external("third");
		await h.store.keepLocalAndRetry(choice);
		expect(h.writeSnapshot).not.toHaveBeenCalled();
		expect(h.backupSnapshot).not.toHaveBeenCalled();
		expect(h.store.recovery?.first?.raw).toBe(raw("external"));
		expect(h.store.recovery?.latest?.raw).toBe(raw("third"));
		expect(h.getDisk()).toEqual({ kind: "file", raw: raw("third") });
	});

	test("different evidence during a dispatched recovery write remains protected after fulfillment", async () => {
		const h = await loaded(draftParticipant(true));
		h.external("external");
		await h.store.observeExternal();
		const entered = deferred<void>();
		const finish = deferred<void>();
		h.writeSnapshot.mockImplementationOnce(async value => {
			entered.resolve();
			await finish.promise;
			h.setDisk({ kind: "file", raw: value });
			await h.store.observeExternal();
		});
		const recovery = h.store.keepLocalAndRetry(h.store.getRecoveryChoice()!);
		await entered.promise;
		h.external("third");
		await h.store.observeExternal();
		finish.resolve();
		await recovery;
		expect(h.store.recovery?.first?.raw).toBe(raw("external"));
		expect(h.store.recovery?.latest?.raw).toBe(raw("third"));
		expect(h.drafts.state.pending).toBe(true);
		expect(h.writeSnapshot).toHaveBeenCalledTimes(1);
	});
});

describe("reconciliation close barrier", () => {
	test("close waits for an admitted initial strict read without accepting its canonical state", async () => {
		const h = setup();
		const read = deferred<Snapshot>();
		h.readSnapshot.mockReturnValueOnce(read.promise);
		const loading = h.store.load();
		let settled = false;
		const closing = h.store.close().then(result => { settled = true; return result; });
		await nextTurn();
		const settledBeforeRead = settled;
		read.resolve({ kind: "file", raw: raw("initial external") });
		expect(await loading).toBe(false);
		expect(await closing).toBe(false);
		expect(settledBeforeRead).toBe(false);
		expect(h.store.isClosed).toBe(true);
		expect(h.store.canonicalVersion).toBe(0);
		expect(h.store.settings).toEqual({ schemaVersion: 1, providerSettings: [] });
		expect(h.changed).not.toHaveBeenCalled();
		expect(h.writeSnapshot).not.toHaveBeenCalled();
		expect(h.backupSnapshot).not.toHaveBeenCalled();
	});

	test("closing settles an admitted external capture and dispatched write without a later overwrite", async () => {
		const h = await loaded();
		const writeEntered = deferred<void>();
		const finishWrite = deferred<void>();
		h.writeSnapshot.mockImplementationOnce(async value => {
			writeEntered.resolve();
			await finishWrite.promise;
			h.setDisk({ kind: "file", raw: value });
		});
		h.store.updateProvider("a", patch("local"));
		await writeEntered.promise;
		const captureEntered = deferred<void>();
		const finishCapture = deferred<Snapshot>();
		h.readSnapshot.mockImplementationOnce(() => { captureEntered.resolve(); return finishCapture.promise; });
		const observation = h.store.observeExternal();
		await captureEntered.promise;
		const closing = h.store.close();
		expect(h.store.isClosed).toBe(true);
		expect(h.store.updateProvider("a", patch("late"))).toBe(false);
		finishCapture.resolve({ kind: "file", raw: raw("external") });
		expect(await observation).toMatchObject({ kind: "protected" });
		finishWrite.resolve();
		expect(await closing).toBe(false);
		expect(h.store.recovery?.first?.raw).toBe(raw("external"));
		expect(h.store.settings).toEqual(saved("local"));
		expect(h.writeSnapshot).toHaveBeenCalledTimes(1);
		expect(await h.store.observeExternal()).toMatchObject({ kind: "unavailable" });
	});
});

test("local mutations never alter the normalized receipt for the accepted raw baseline", async () => {
	const h = await loaded();
	h.writeSnapshot.mockRejectedValueOnce(new Error("local write failed"));
	h.store.updateProvider("a", patch("unsaved local"));
	expect(await h.store.flush()).toBe(false);
	h.external("external");
	await h.store.observeExternal();
	const entered = deferred<void>();
	const finish = deferred<void>();
	h.writeSnapshot.mockImplementationOnce(async value => {
		entered.resolve();
		await finish.promise;
		h.setDisk({ kind: "file", raw: value });
	});
	const recovery = h.store.keepLocalAndRetry(h.store.getRecoveryChoice()!);
	await entered.promise;
	h.external("baseline");
	await h.store.observeExternal();
	expect(h.store.recovery?.latest?.settings).toEqual(saved("baseline"));
	expect(h.store.settings).toEqual(saved("unsaved local"));
	finish.resolve();
	await recovery;
	expect(h.store.recovery?.latest?.settings).toEqual(saved("baseline"));
});

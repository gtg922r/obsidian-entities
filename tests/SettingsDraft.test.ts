import { SettingsFieldDraft } from "../src/settingsDraft";
import { SettingsStore } from "../src/SettingsStore";

const defaults = { providerTypeID: "test", enabled: true, icon: "box" };
async function harness() {
	const write = jest.fn(async (_value: unknown) => {});
	const store = new SettingsStore(write, async () => {});
	await store.load(async () => ({ schemaVersion: 1, providerSettings: [
		{ ...defaults, providerInstanceId: "a", label: "original", list: [{ value: "first" }, { value: "second" }] },
		{ ...defaults, providerInstanceId: "b", label: "neighbor" },
	] }));
	return { store, write };
}

test("reading and constructing detached fields writes nothing; edits merge by ID", async () => {
	const { store, write } = await harness();
	const draft = new SettingsFieldDraft<string>(store, "a", "label");
	expect(draft.value).toBe("original");
	await Promise.resolve();
	expect(write).not.toHaveBeenCalled();
	store.reorderProviders(["b", "a"]);
	store.updateProvider("a", { icon: "new icon" });
	draft.stage("local");
	expect(draft.apply()).toBe("accepted");
	expect(store.settings.providerSettings[1]).toMatchObject({ label: "local", icon: "new icon" });
});

test("rejected exact scalar and original baseline survive refresh and later edits", async () => {
	const { store } = await harness();
	const first = new SettingsFieldDraft<string>(store, "a", "label");
	const second = new SettingsFieldDraft<string>(store, "a", "label");
	first.stage("canonical"); first.apply();
	second.stage(" [ exact rejected text ");
	expect(second.apply()).toBe("conflict");
	second.refresh();
	expect(second.value).toBe(" [ exact rejected text ");
	second.stage("another local attempt");
	expect(second.apply()).toBe("conflict");
	second.reload();
	second.stage("deliberate edit");
	expect(second.apply()).toBe("accepted");
});

test("pending whole collections never silently rebase onto a concurrent edit or reorder", async () => {
	const { store } = await harness();
	const a = new SettingsFieldDraft<{ value: string }[]>(store, "a", "list");
	const b = new SettingsFieldDraft<{ value: string }[]>(store, "a", "list");
	b.stage([{ value: "first" }, { value: "pending" }]);
	a.stage([{ value: "second" }, { value: "first" }]); a.apply();
	b.refresh();
	expect(b.apply()).toBe("conflict");
	expect(b.value).toEqual([{ value: "first" }, { value: "pending" }]);
});

test("a failed canonical update does not advance the baseline", async () => {
	const { store } = await harness();
	const draft = new SettingsFieldDraft<string>(store, "a", "label");
	const apply = jest.spyOn(store, "updateProvider").mockReturnValueOnce(false);
	draft.stage("pending");
	expect(draft.apply()).toBe("unavailable");
	expect(draft.dirty).toBe(true);
	draft.refresh();
	expect(draft.value).toBe("pending");
	expect(draft.apply()).toBe("accepted");
	expect(apply).toHaveBeenCalledTimes(2);
});

test("disk failure is separate from accepted canonical baseline and remains retryable", async () => {
	const { store, write } = await harness();
	write.mockRejectedValueOnce(new Error("disk full"));
	const draft = new SettingsFieldDraft<string>(store, "a", "label");
	draft.stage("accepted");
	expect(draft.apply()).toBe("accepted");
	expect(await store.flush()).toBe(false);
	expect(draft.dirty).toBe(false);
	draft.stage("next");
	expect(draft.apply()).toBe("accepted");
	expect(await store.flush()).toBe(true);
});

test("deleted and retired sessions cannot mutate or recreate providers", async () => {
	const { store } = await harness();
	const deleted = new SettingsFieldDraft<string>(store, "a", "label");
	deleted.stage("pending"); store.deleteProvider("a");
	expect(deleted.apply()).toBe("unavailable");
	const retired = new SettingsFieldDraft<string>(store, "b", "label");
	retired.stage("pending"); retired.retire();
	expect(retired.apply()).toBe("unavailable");
	expect(store.settings.providerSettings).toMatchObject([{ providerInstanceId: "b", label: "neighbor" }]);
});

test("forked child choices keep original baselines, including an existing conflict", async () => {
	const { store } = await harness(); const parent = new SettingsFieldDraft<string>(store, "a", "label");
	const a = parent.fork(); const b = parent.fork(); b.stage("new canonical"); expect(b.apply()).toBe("accepted");
	a.stage("rejected"); expect(a.apply()).toBe("conflict");
	const retry = a.fork(); retry.stage("later rejected"); expect(retry.apply()).toBe("conflict");
	expect(retry.value).toBe("later rejected"); expect(store.settings.providerSettings[0]).toMatchObject({ label: "new canonical" });
});

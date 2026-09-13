import { App, Plugin, Setting, TFile, TFolder } from "obsidian";
import { EntityProvider, EntityProviderUserSettings } from "../src/Providers/EntityProvider";
import { TemplateEntityProvider } from "../src/Providers/TemplateProvider";
import { MetadataMenuProvider } from "../src/Providers/MetadataMenuProvider";
import ProviderRegistry from "../src/Providers/ProviderRegistry";
import { EntitiesModalInput, EntitiesNotice } from "../src/userComponents";
import { createNewNoteFromTemplate, createOrReusePeriodicNote, TemplateCreationRequest } from "../src/entityCreation";
import { actionContext, getAction } from "./suggestionTestHelpers";

const mockModals: EntitiesModalInput[] = [];
const mockStatuses: string[] = [];
jest.mock("obsidian", () => {
	function element(tag = "div") {
		return Object.assign(document.createElement(tag), {
			empty() { this.innerHTML = ""; }, addClass() {}, removeClass() {}, appendText() {},
			createDiv() { const child = element(); this.appendChild(child); return child; },
			createSpan() { const child = element("span"); this.appendChild(child); return child; },
			createEl(tag: string) { const child = element(tag); this.appendChild(child); return child; },
		});
	}
	return {
		Plugin: class {}, TFile: class {}, TFolder: class {},
		normalizePath: (path: string) => path.replace(/\/{2,}/g, "/").replace(/\/$/, ""),
		Modal: class {
			contentEl = element(); modalEl = element();
			constructor(public app: App) { mockModals.push(this as unknown as EntitiesModalInput); }
			open() { (this as unknown as EntitiesModalInput).onOpen(); }
			close() { (this as unknown as EntitiesModalInput).onClose(); }
		},
		Notice: class {},
		Setting: class {
			addExtraButton(build: (button: unknown) => void) {
				build({ extraSettingsEl: { removeClass() {}, addClass() {} }, setIcon() {}, setTooltip: (text: string) => mockStatuses.push(text), setDisabled() {} }); return this;
			}
		},
	};
});
jest.mock("../src/userComponents", () => ({ ...jest.requireActual("../src/userComponents"), EntitiesNotice: jest.fn() }));
jest.mock("../src/ui/file-suggest", () => ({ FileSuggest: class {}, FolderSuggest: class {} }));

class RecipeProvider extends EntityProvider<EntityProviderUserSettings> {
	getDefaultSettings() { return { providerTypeID: "test", enabled: true, icon: "box" }; }
	getEntityList() { return []; }
}
function file(path: string): TFile {
	const name = path.split("/").pop()!;
	return Object.assign(new TFile(), { path, name, basename: name.slice(0, name.lastIndexOf(".")), extension: name.split(".").pop()! });
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>(yes => { resolve = yes; });
	return { promise, resolve };
}
function fixture(templatePath = "Templates/Person.md") {
	const root = Object.assign(new TFolder(), { path: "/" });
	const template = file(templatePath), source = file("Writing/Source.md");
	const folder = Object.assign(new TFolder(), { path: "Default" });
	const files = new Map<string, TFile | TFolder>([[root.path, root], [template.path, template], [source.path, source], [folder.path, folder]]);
	const create = jest.fn(async (_template: TFile, destination: TFolder | string, name: string) => {
		const prefix = typeof destination === "string" ? destination : destination.path;
		const target = file(`${prefix === "/" ? "" : prefix + "/"}${name}.${_template.extension}`);
		files.set(target.path, target);
		return target;
	});
	const integrations: Record<string, unknown> = { "templater-obsidian": { templater: { create_new_note_from_template: create } } };
	const generate = jest.fn((target: TFile) => `native:${target.path}`);
	const getNewFileParent = jest.fn(() => folder);
	const cleanups: (() => void)[] = [];
	const plugin = { register: jest.fn((cleanup: () => void) => cleanups.push(cleanup)), app: {
		plugins: { getPlugin: (id: string) => integrations[id] },
		vault: { getRoot: () => root, getAbstractFileByPath: (path: string) => files.get(path) ?? null,
			getFolderByPath: () => ({ children: [template] }) },
		fileManager: { generateMarkdownLink: generate, getNewFileParent },
		metadataCache: { getCache: () => ({ frontmatter: { newNoteTemplate: "[[Person]]" } }), getFirstLinkpathDest: () => template },
	} } as unknown as Plugin;
	const registry = ProviderRegistry.initializeRegistry(plugin);
	registry.registerProviderType(TemplateEntityProvider);
	const useTemplateProvider = () => {
		registry.instantiateProvidersFromSettings([{ ...TemplateEntityProvider.getDefaultSettings(), providerInstanceId: "template", path: "Templates" }]);
		return registry.getProviders()[0] as TemplateEntityProvider;
	};
	const request: TemplateCreationRequest = { engine: "templater", template: template.path, destination: { kind: "explicit", path: "" }, name: "Alice" };
	const context = actionContext(source);
	return { plugin, app: plugin.app, create, root, folder, files, template, source, context, request, integrations, generate, getNewFileParent, registry, useTemplateProvider, unload: () => cleanups.forEach(cleanup => cleanup()) };
}
function submit(name = "Alice") {
	const modal = mockModals.at(-1)!;
	const input = modal.modalEl.querySelector("input")!;
	input.value = name;
	input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
}
function runTemplate(h: ReturnType<typeof fixture>) {
	const provider = h.useTemplateProvider();
	const item = provider.getEntityList()[0];
	return getAction(item)!(h.context);
}
beforeEach(() => { mockModals.length = 0; mockStatuses.length = 0; jest.clearAllMocks(); });

test("IME confirmation keeps the prompt open; subsequent ordinary Enter submits once", async () => {
	const h = fixture(), pending = runTemplate(h);
	const modal = mockModals.at(-1)!;
	const close = jest.spyOn(modal, "close");
	const settled = jest.fn();
	void modal.getInput().then(settled);
	const input = modal.modalEl.querySelector("input")!;
	input.value = "東京";
	input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true }));
	await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
	expect(settled).not.toHaveBeenCalled();
	expect(close).not.toHaveBeenCalled();
	expect(h.create).not.toHaveBeenCalled();
	input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
	input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
	expect(await pending).toMatchObject({ status: "created", file: { path: "Default/東京.md" } });
	expect(settled).toHaveBeenCalledTimes(1);
	expect(settled).toHaveBeenCalledWith("東京");
	expect(h.create).toHaveBeenCalledTimes(1);
});

test("an undefined engine result must not produce a guessed success link", async () => {
	const h = fixture(); h.create.mockResolvedValue(undefined);
	const provider = new RecipeProvider(h.plugin, { providerInstanceId: "recipe", entityCreationTemplates: [
		{ engine: "templater", templatePath: h.template.path, entityName: "Person" },
	] });
	const item = provider.getTemplateCreationSuggestions("Alice")[0];
	expect(await getAction(item)!(h.context)).toMatchObject({ status: "failed" });
	expect(h.generate).not.toHaveBeenCalled();
	expect(EntitiesNotice).not.toHaveBeenCalled();
});
test("creation capability does not depend on append capability", async () => {
	const h = fixture();
	const result = await createNewNoteFromTemplate(h.app, h.request);
	expect(result).toMatchObject({ status: "created" });
	expect(h.create).toHaveBeenCalledWith(h.template, h.root, "Alice", false);
});
test.each(["", "/"])("configured root %j passes the live root folder", async path => {
	const h = fixture();
	await createNewNoteFromTemplate(h.app, { ...h.request, destination: { kind: "explicit", path } });
	expect(h.create.mock.calls[0][1]).toBe(h.root);
	expect(h.getNewFileParent).not.toHaveBeenCalled();
});
test.each([" Initial", "Trailing ", "  "])("explicit folder %j preserves ordinary spaces and existing contents", async path => {
	const h = fixture();
	const folder = Object.assign(new TFolder(), { path });
	const sentinel = Object.assign(file(`${path}/Existing.md`), { content: "keep spaced folder contents" });
	const otherPath = path.trim();
	const otherFolder = otherPath ? Object.assign(new TFolder(), { path: otherPath }) : h.root;
	const otherNote = Object.assign(file(`${otherPath ? otherPath + "/" : ""}Alice.md`), { content: "keep other destination contents" });
	h.files.set(path, folder); h.files.set(sentinel.path, sentinel);
	h.files.set(otherFolder.path, otherFolder); h.files.set(otherNote.path, otherNote);
	const result = await createNewNoteFromTemplate(h.app, { ...h.request, destination: { kind: "explicit", path } });
	expect(result).toMatchObject({ status: "created", file: { path: `${path}/Alice.md` } });
	expect(h.create.mock.calls[0][1]).toBe(path);
	expect(h.files.get(path)).toBe(folder);
	expect(h.files.get(sentinel.path)).toBe(sentinel);
	expect(sentinel.content).toBe("keep spaced folder contents");
	expect(h.files.get(otherFolder.path)).toBe(otherFolder);
	expect(h.files.get(otherNote.path)).toBe(otherNote);
	expect(otherNote.content).toBe("keep other destination contents");
});
test("normalized missing parents reach native creation and remain after later failure", async () => {
	const h = fixture();
	h.create.mockImplementation(async (_template, folder) => {
		h.files.set(String(folder), Object.assign(new TFolder(), { path: folder }));
		throw Error("write failed");
	});
	const result = await createNewNoteFromTemplate(h.app, { ...h.request, destination: { kind: "explicit", path: "New//Nested/" } });
	expect(result).toMatchObject({ status: "failed" });
	expect(h.create.mock.calls[0][1]).toBe("New/Nested");
	expect(h.files.has("New/Nested")).toBe(true);
});
test.each(["../Outside", "A/../B", "/absolute", "C:\\Folder", "A/./B", "Bad\u0000Path"])("invalid destination %j never starts native work", async path => {
	const h = fixture();
	expect(await createNewNoteFromTemplate(h.app, { ...h.request, destination: { kind: "explicit", path } })).toMatchObject({ status: "failed" });
	expect(h.create).not.toHaveBeenCalled();
});
test.each(["A", "A/B"])("file-versus-folder collision at %s is rejected", async blockingPath => {
	const h = fixture(); h.files.set(blockingPath, file(blockingPath));
	expect(await createNewNoteFromTemplate(h.app, { ...h.request, destination: { kind: "explicit", path: "A/B" } })).toMatchObject({ status: "failed" });
	expect(h.create).not.toHaveBeenCalled();
});
test.each(["", " ", "..", "A/B", "Bad?Name"])("invalid name %j never starts native work", async name => {
	const h = fixture();
	expect(await createNewNoteFromTemplate(h.app, { ...h.request, name })).toMatchObject({ status: "failed" });
	expect(h.create).not.toHaveBeenCalled();
});
test.each(["missing", "folder", "stale"])("%s template does not reach the engine as content", async kind => {
	const h = fixture();
	if (kind === "missing") h.files.delete(h.template.path);
	else h.files.set(h.template.path, kind === "folder" ? new TFolder() : file(h.template.path));
	expect(await createNewNoteFromTemplate(h.app, { ...h.request, template: kind === "stale" ? h.template : h.template.path })).toMatchObject({ status: "failed" });
	expect(h.create).not.toHaveBeenCalled();
});
test.each([undefined, {}, { templater: { append_template_to_active_file() {} } }])("missing creation capability gives failure and can become available later", async integration => {
	const h = fixture(); h.integrations["templater-obsidian"] = integration;
	expect(await createNewNoteFromTemplate(h.app, h.request)).toMatchObject({ status: "failed" });
	h.integrations["templater-obsidian"] = { templater: { create_new_note_from_template: h.create } };
	expect(await createNewNoteFromTemplate(h.app, h.request)).toMatchObject({ status: "created" });
});
test("Core stays explicitly unsupported", async () => {
	const h = fixture();
	expect(await createNewNoteFromTemplate(h.app, { ...h.request, engine: "core" })).toMatchObject({ status: "failed", error: expect.objectContaining({ message: expect.stringContaining("unsupported") }) });
	expect(h.create).not.toHaveBeenCalled();
});
test.each(["undefined", "rejected", "fabricated", "replaced"])("%s engine output is failure", async kind => {
	const h = fixture();
	h.create.mockImplementation(async () => {
		if (kind === "rejected") throw Error("engine rejected");
		if (kind === "undefined") return undefined;
		const result = file("Created.md");
		if (kind === "replaced") h.files.set(result.path, file(result.path));
		return result;
	});
	expect(await createNewNoteFromTemplate(h.app, h.request)).toMatchObject({ status: "failed" });
});
test("a rejection does not infer partial ownership from files created concurrently or a thrown partialFile property", async () => {
	const h = fixture(), unrelated = file("Someone Else.md");
	h.create.mockImplementation(async () => {
		h.files.set(unrelated.path, unrelated);
		throw Object.assign(Error("failed"), { partialFile: unrelated });
	});
	const result = await createNewNoteFromTemplate(h.app, h.request);
	expect(result).toEqual({ status: "failed", error: expect.any(Error) });
	expect(h.files.get(unrelated.path)).toBe(unrelated);
});
test("native unique/renamed identity preserves an existing target and captured link source", async () => {
	const h = fixture(), existing = file("Default/Alice.md"), gate = deferred<TFile>(); h.files.set(existing.path, existing);
	h.create.mockImplementation(() => gate.promise);
	const pending = runTemplate(h); submit();
	await Promise.resolve(); await Promise.resolve();
	h.source.path = "Changed/Source.md";
	const actual = file("Moved/Alice 1.md"); h.files.set(actual.path, actual); gate.resolve(actual);
	expect(await pending).toEqual({ status: "created", file: actual });
	expect(h.files.get(existing.path)).toBe(existing);
	expect(h.generate).not.toHaveBeenCalled();
});
test.each(["Templates/Meeting.canvas.md", "Templates/Drawing.canvas"])("default destination uses actual extension for %s before prompting", async path => {
	const h = fixture(path), gate = deferred<TFile>(); h.create.mockImplementation(() => gate.promise);
	const pending = runTemplate(h);
	expect(h.getNewFileParent).toHaveBeenCalledWith("Writing/Source.md", h.template.name);
	const other = Object.assign(new TFolder(), { path: "Other" }); h.files.set(other.path, other);
	h.getNewFileParent.mockReturnValue(other); h.source.path = "Other/Source.md";
	submit("Made"); await Promise.resolve(); await Promise.resolve();
	expect(h.create).toHaveBeenCalledWith(h.template, h.folder, "Made", false);
	const actual = file(`Default/Made.${h.template.extension}`); h.files.set(actual.path, actual); gate.resolve(actual);
	await pending;
	expect(h.generate).not.toHaveBeenCalled();
});
test("a resolved default folder replaced during the prompt prevents creation", async () => {
	const h = fixture(), pending = runTemplate(h);
	h.files.set(h.folder.path, Object.assign(new TFolder(), { path: h.folder.path })); submit();
	expect(await pending).toMatchObject({ status: "failed" }); expect(h.create).not.toHaveBeenCalled();
});
test.each(["close", "unload", "reconfigure", "submit-then-unload"])("prompt %s leaves creation unstarted", async mode => {
	const h = fixture(), pending = runTemplate(h);
	if (mode === "submit-then-unload") { submit(); h.unload(); }
	else if (mode === "unload") h.unload();
	else if (mode === "reconfigure") h.registry.resetProviders();
	else mockModals.at(-1)!.close();
	expect(await pending).toMatchObject({ status: "cancelled" }); expect(h.create).not.toHaveBeenCalled();
});
test("unload in the final promise continuation cannot start native work", async () => {
	const h = fixture(), pending = runTemplate(h);
	submit();
	await Promise.resolve(); // The prompt wrapper has resolved; provider continuation is still queued.
	h.unload();
	expect(await pending).toMatchObject({ status: "cancelled" }); expect(h.create).not.toHaveBeenCalled();
});
test("repeated provider rebuilds and prompts retain only one plugin cleanup and no registry listeners", async () => {
	const h = fixture(), listeners = new Set<() => void>();
	const original = h.registry.onChange.bind(h.registry);
	jest.spyOn(h.registry, "onChange").mockImplementation(listener => {
		listeners.add(listener); const dispose = original(listener);
		return () => { listeners.delete(listener); dispose(); };
	});
	for (let i = 0; i < 5; i++) { const pending = runTemplate(h); mockModals.at(-1)!.close(); await pending; expect(listeners.size).toBe(0); }
	expect(h.plugin.register).toHaveBeenCalledTimes(1);
});
test("closing and submitting the modal settles once", async () => {
	const h = fixture(), modal = new EntitiesModalInput(h.app); modal.open();
	const settled = jest.fn(); void modal.getInput().then(settled);
	modal.close(); submit("late"); await Promise.resolve();
	expect(settled).toHaveBeenCalledTimes(1); expect(settled).toHaveBeenCalledWith(undefined);
});
test("periodic creation reuses a live target without requiring create capability", async () => {
	const h = fixture(); h.integrations["periodic-notes"] = { getPeriodicNote: () => h.template };
	expect(await createOrReusePeriodicNote(h.app, "day", {} as never)).toEqual({ status: "existing", file: h.template });
});
test("periodic creation rechecks lookup at execution and returns actual created file", async () => {
	const h = fixture(), target = file("Calendar/Renamed.md");
	const create = jest.fn(async () => { h.files.set(target.path, target); return target; });
	h.integrations["periodic-notes"] = { getPeriodicNote: () => h.files.get(target.path), createPeriodicNote: create };
	expect(await createOrReusePeriodicNote(h.app, "day", {} as never)).toEqual({ status: "created", file: target });
	expect(await createOrReusePeriodicNote(h.app, "day", {} as never)).toEqual({ status: "existing", file: target });
	expect(create).toHaveBeenCalledTimes(1);
});
test("Metadata Menu creation captures default source and awaits actual output", async () => {
	const h = fixture("Templates/Drawing.canvas"), gate = deferred<TFile>(); h.create.mockImplementation(() => gate.promise);
	const cls = { name: "Person" };
	h.integrations["metadata-menu"] = { fieldIndex: { fileClassesPath: new Map([["Classes/Person.md", cls]]), fileClassesName: new Map([["Person", cls]]) } };
	const provider = new MetadataMenuProvider(h.plugin, { providerInstanceId: "metadata" });
	const item = provider.getTemplateCreationSuggestions("Alice")[0], pending = getAction(item)!(h.context);
	expect(h.getNewFileParent).toHaveBeenCalledWith("Writing/Source.md", "Alice.canvas");
	h.source.path = "Elsewhere.md";
	const actual = file("Default/Alice 1.canvas"); h.files.set(actual.path, actual); gate.resolve(actual);
	expect(await pending).toEqual({ status: "created", file: actual });
	expect(h.generate).not.toHaveBeenCalled();
});


test("Metadata Menu summary reflects actual creation capability on each render, including late enablement", () => {
	const h = fixture();
	const render = () => MetadataMenuProvider.buildSummarySetting(new Setting(document.createElement("div")), MetadataMenuProvider.getDefaultSettings(), () => {}, h.plugin);
	render(); expect(mockStatuses.at(-1)).toBe("Metadata Menu file classes unavailable");
	h.integrations["metadata-menu"] = { fieldIndex: { fileClassesPath: new Map(), fileClassesName: new Map() } };
	delete h.integrations["templater-obsidian"];
	h.integrations.templater = { templater: { create_new_note_from_template: h.create } }; // Wrong historical ID must not pass.
	render(); expect(mockStatuses.at(-1)).toBe("Templater note creation unavailable");
	h.integrations["templater-obsidian"] = { templater: { append_template_to_active_file() {} } };
	render(); expect(mockStatuses.at(-1)).toBe("Templater note creation unavailable");
	h.integrations["templater-obsidian"] = { templater: { create_new_note_from_template: h.create } };
	render(); expect(mockStatuses.at(-1)).toBe("Note creation integrations available");
});

test("unloading after engine start does not undo or cancel its file creation", async () => {
	const h = fixture(), gate = deferred<TFile>(); h.create.mockImplementation(() => gate.promise);
	const pending = runTemplate(h); submit();
	await Promise.resolve(); await Promise.resolve();
	expect(h.create).toHaveBeenCalledTimes(1);
	h.unload();
	const actual = file("Created.md"); h.files.set(actual.path, actual); gate.resolve(actual);
	await pending;
	expect(h.files.get(actual.path)).toBe(actual);
});

test.each(["before prompt", "while prompt", "final continuation"])("source invalidation %s prevents native engine startup", async stage => {
	const h = fixture();
	let valid = stage !== "before prompt";
	Object.assign(h.context, { canStartWork: () => valid });
	const pending = runTemplate(h);
	if (stage !== "before prompt") {
		if (stage === "while prompt") valid = false;
		submit();
		if (stage === "final continuation") { await Promise.resolve(); valid = false; }
	}
	expect(await pending).toEqual({ status: "cancelled" });
	expect(h.create).not.toHaveBeenCalled();
});

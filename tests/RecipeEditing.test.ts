import { App } from "obsidian";
import { TemplateDetailsModal } from "../src/userComponents";
import { buildTemplateCreationSetting } from "../src/ui/providerSettingsComponents";
import { SettingsStore } from "../src/SettingsStore";
import { cloneSettings } from "../src/settingsData";

const mockRows: { name: string; buttons: { text: string; click: () => void | Promise<void> }[] }[] = [];
const mockModals: TemplateDetailsModal[] = [];
const mockEngineOptions: string[] = [];

jest.mock("obsidian", () => {
	function element() {
		return { empty() {}, createEl: () => element(), createDiv: () => element(), addClass() {}, removeClass() {} };
	}
	class Button {
		text = "";
		click: () => void | Promise<void> = () => {};
		setButtonText(value: string) { this.text = value; return this; }
		onClick(callback: () => void | Promise<void>) { this.click = callback; return this; }
	}
	class Text {
		inputEl = document.createElement("input");
		setPlaceholder() { return this; }
		setValue(value: string) { this.inputEl.value = value; return this; }
		getValue() { return this.inputEl.value; }
		setDisabled() { return this; }
	}
	class Dropdown {
		selectEl = document.createElement("select");
		addOption(key: string, label: string) { mockEngineOptions.push(key); this.selectEl.add(new Option(label, key)); return this; }
		addOptions(options: Record<string, string>) { Object.entries(options).forEach(([key, label]) => this.addOption(key, label)); return this; }
		setValue(value: string) { this.selectEl.value = value; return this; }
		getValue() { return this.selectEl.value; }
		onChange() { return this; }
	}
	return {
		Modal: class {
			contentEl = element();
			constructor(public app: App) { mockModals.push(this as unknown as TemplateDetailsModal); }
			open() { (this as unknown as TemplateDetailsModal).onOpen(); }
			close() { (this as unknown as { onClose?: () => void }).onClose?.(); }
		},
		Notice: class {},
		Setting: class {
			name = "";
			buttons: Button[] = [];
			constructor() { mockRows.push(this); }
			setName(value: string) { this.name = value; return this; }
			setDesc() { return this; }
			addDropdown(build: (dropdown: Dropdown) => void) { build(new Dropdown()); return this; }
			addText(build: (text: Text) => void) { build(new Text()); return this; }
			addButton(build: (button: Button) => void) { const button = new Button(); this.buttons.push(button); build(button); return this; }
		},
	};
});
jest.mock("../src/ui/file-suggest", () => ({ FileSuggest: class {}, FolderSuggest: class {} }));

const coreRecipe = { engine: "core" as const, templatePath: "Core/Person.md", entityName: "Person", folderPath: "People", future: { nested: [false, "preserved"] } };
const tailRecipe = { engine: "templater" as const, templatePath: "Templates/Project.md", entityName: "Project", futureTail: 42 };
const defaults = { providerTypeID: "folder", enabled: true, icon: "folder", entityCreationTemplates: [] };
const app = {} as App;
const saveButton = () => mockRows.flatMap(row => row.buttons).find(button => button.text === "Save")!;

beforeEach(() => { mockRows.length = 0; mockModals.length = 0; mockEngineOptions.length = 0; });

test("saving an unchanged legacy Core recipe remains valid on store reload", async () => {
	const modal = new TemplateDetailsModal(app, cloneSettings(coreRecipe));
	const result = modal.openAndGetValue();
	saveButton().click();
	const recipe = await result;
	expect(recipe).toEqual(coreRecipe);
	const data = { schemaVersion: 1, providerSettings: [{ ...defaults, providerInstanceId: "a", entityCreationTemplates: [recipe] }] };
	const store = new SettingsStore(async () => {}, async () => {}, () => defaults);
	expect(await store.load(async () => JSON.parse(JSON.stringify(data)))).toBe(true);
	expect(store.settings.providerSettings[0].entityCreationTemplates).toEqual([coreRecipe]);
});

test("the first recipe editor preserves untouched tail recipes and unknown fields", async () => {
	const settings = { ...defaults, entityCreationTemplates: [cloneSettings(coreRecipe), cloneSettings(tailRecipe)] };
	const save = jest.fn();
	buildTemplateCreationSetting(document.createElement("div"), settings, save, app);
	const editing = mockRows[0].buttons[0].click();
	saveButton().click();
	await editing;
	expect(settings.entityCreationTemplates).toEqual([coreRecipe, tailRecipe]);
	expect(save).toHaveBeenCalledWith(settings);
});


test("new recipes do not offer the unsupported Core engine", () => {
	const modal = new TemplateDetailsModal(app);
	void modal.openAndGetValue();
	expect(mockEngineOptions).toEqual(["disabled", "templater"]);
	modal.close();
});

test.each(["close", "cancel"])("recipe %s settles once and leaves the collection untouched", async mode => {
	const settings = { ...defaults, entityCreationTemplates: [cloneSettings(coreRecipe), cloneSettings(tailRecipe)] };
	const save = jest.fn();
	buildTemplateCreationSetting(document.createElement("div"), settings, save, app);
	const editing = mockRows[0].buttons[0].click();
	if (mode === "cancel") mockRows.flatMap(row => row.buttons).find(button => button.text === "Cancel")!.click();
	else mockModals.at(-1)!.close(); // Host Escape, close button and programmatic close share this path.
	saveButton().click(); // A late Save handler cannot reverse cancellation.
	await editing;
	expect(save).not.toHaveBeenCalled();
	expect(settings.entityCreationTemplates).toEqual([coreRecipe, tailRecipe]);
});

test("a root-picker recipe roundtrips its canonical slash path", async () => {
	const recipe = { ...tailRecipe, folderPath: "/" };
	const modal = new TemplateDetailsModal(app, recipe), pending = modal.openAndGetValue();
	saveButton().click(); modal.close();
	expect(await pending).toEqual(recipe);
});

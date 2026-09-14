import { App } from "obsidian";
import { TemplateDetailsModal } from "../src/userComponents";
import { InputSuggestScope } from "../src/ui/inputSuggestLifecycle";
import { createKeymap, installInputSuggestDom, poppers } from "./inputSuggestHostMock";

const mockButtons: { text: string; click: () => void }[] = [];
jest.mock("obsidian", () => {
	class Control {
		text = "";
		inputEl: HTMLInputElement;
		click: () => void = () => {};
		constructor(parent: HTMLElement) { this.inputEl = parent.ownerDocument.createElement("input"); parent.appendChild(this.inputEl); }
		setPlaceholder(value: string) { this.inputEl.placeholder = value; return this; }
		setValue(value: string) { this.inputEl.value = value; return this; }
		getValue() { return this.inputEl.value; }
		setDisabled(value: boolean) { this.inputEl.disabled = value; return this; }
		setButtonText(text: string) { this.text = text; return this; }
		onClick(callback: () => void) { this.click = callback; return this; }
		onChange() { return this; } addOption() { return this; } addOptions() { return this; }
	}
	return {
		...jest.requireActual("./__mocks__/obsidian"),
		Notice: class {},
		Modal: class {
			contentEl = document.createElement("div");
			constructor(public app: App) {}
			open() { document.body.appendChild(this.contentEl); (this as unknown as TemplateDetailsModal).onOpen(); }
			close() { this.contentEl.remove(); (this as unknown as TemplateDetailsModal).onClose(); }
		},
		Setting: class {
			constructor(private parent: HTMLElement) {}
			setName() { return this; } setDesc() { return this; }
			addText(build: (control: Control) => void) { build(new Control(this.parent)); return this; }
			addDropdown(build: (control: Control) => void) { return this.addText(build); }
			addButton(build: (control: Control) => void) { const control = new Control(this.parent); mockButtons.push(control); build(control); return this; }
		},
	};
});
jest.mock("@popperjs/core", () => ({ createPopper: jest.requireActual("./inputSuggestHostMock").createPopper }));

let restoreDom: () => void;
beforeEach(() => {
	restoreDom = installInputSuggestDom(document);
	Object.defineProperty(window.HTMLElement.prototype, "createEl", { configurable: true, value(this: HTMLElement, tag: string, options: { text: string }) {
		const element = this.ownerDocument.createElement(tag); element.textContent = options.text; this.appendChild(element); return element;
	} });
	mockButtons.length = 0; poppers.length = 0;
});
afterEach(() => { document.body.replaceChildren(); Reflect.deleteProperty(window.HTMLElement.prototype, "createEl"); restoreDom(); });

test.each(["close", "rebuild", "owner teardown", "save"])("template picker cleanup on %s preserves one settlement", async reason => {
	const keymap = createKeymap();
	const recipe = { engine: "templater" as const, templatePath: "", folderPath: "", entityName: "Person" };
	const app = { keymap, vault: { getMarkdownFiles: () => [{ path: "Templates/ Person.md" }], getAllLoadedFiles: () => [], getRoot: () => ({ path: "/" }) } } as unknown as App;
	const owner = new InputSuggestScope();
	const modal = new TemplateDetailsModal(app, recipe, owner);
	const result = modal.openAndGetValue();
	const control = modal.contentEl.querySelector<HTMLInputElement>('[placeholder="Template path"]')!;
	control.focus();
	expect(keymap.scopes).toHaveLength(1);
	const retainedSave = mockButtons.find(button => button.text === "Save")!.click;
	const popper = poppers.at(-1)!;
	if (reason === "close") modal.close();
	if (reason === "owner teardown") owner.dispose();
	if (reason === "rebuild") { modal.onOpen(); modal.close(); }
	if (reason === "save") retainedSave();
	expect(keymap.scopes).toHaveLength(0);
	expect(popper.destroy).toHaveBeenCalledTimes(1);
	expect(popper.popup.isConnected).toBe(false);
	control.value = "detached.md"; retainedSave();
	expect(await result).toEqual(reason === "save" ? recipe : null);
	owner.dispose();
});


test("a retained template opener cannot allocate suggestions after its owner is gone", async () => {
	const owner = new InputSuggestScope(); owner.dispose();
	const modal = new TemplateDetailsModal({} as App, undefined, owner);
	expect(await modal.openAndGetValue()).toBeNull();
	expect(modal.contentEl.isConnected).toBe(false);
	expect(poppers).toHaveLength(0);
});

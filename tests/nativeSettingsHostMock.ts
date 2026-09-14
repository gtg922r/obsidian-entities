import type { App, SettingDefinitionItem, SettingDefinitionRender } from "obsidian";

/** Synthetic public Setting controls; the separate private probe executes unchanged native reconciliation. */
export class NativeControl {
	options: string[] = [];
	text = ""; tooltip = ""; placeholder = ""; value: unknown; disabled = false;
	inputEl: HTMLInputElement; buttonEl: HTMLButtonElement; extraSettingsEl: HTMLElement;
	change: (value: any) => void = () => {};
	click: () => unknown = () => {};
	constructor(parent: HTMLElement, readonly kind: string) {
		this.inputEl = parent.ownerDocument.createElement("input");
		this.buttonEl = parent.ownerDocument.createElement("button");
		this.extraSettingsEl = this.buttonEl;
		parent.append(kind === "text" || kind === "dropdown" || kind === "toggle" ? this.inputEl : this.buttonEl);
	}
	setValue(value: unknown) { this.value = value; this.inputEl.value = String(value ?? ""); return this; }
	getValue() { return this.inputEl.value; }
	setButtonText(value: string) { this.text = value; this.buttonEl.textContent = value; return this; }
	setIcon(value: string) { this.text = value; return this; }
	setTooltip(value: string) { this.tooltip = value; return this; }
	setPlaceholder(value: string) { this.placeholder = value; this.inputEl.placeholder = value; return this; }
	setDisabled(value: boolean) { this.disabled = value; this.inputEl.disabled = value; this.buttonEl.disabled = value; return this; }
	setCta() { return this; }
	addOption(value: string) { this.options.push(value); if (this.value === undefined) this.setValue(value); return this; }
	addOptions(options: Record<string, string>) { Object.keys(options).forEach(value => this.addOption(value)); return this; }
	onChange(callback: (value: any) => void) {
		this.change = callback;
		this.inputEl.addEventListener("input", () => callback(this.kind === "toggle" ? this.inputEl.checked : this.inputEl.value));
		return this;
	}
	onClick(callback: () => unknown) { this.click = callback; this.buttonEl.addEventListener("click", () => { void callback(); }); return this; }
}

export class NativeSetting {
	name = ""; description = ""; controls: NativeControl[] = [];
	settingEl: HTMLElement; controlEl: HTMLElement; descEl: HTMLElement; nameEl: HTMLElement;
	constructor(parent: HTMLElement) {
		this.settingEl = parent.ownerDocument.createElement("div"); parent.append(this.settingEl);
		this.nameEl = parent.ownerDocument.createElement("div");
		this.descEl = parent.ownerDocument.createElement("div");
		this.controlEl = parent.ownerDocument.createElement("div");
		this.settingEl.append(this.nameEl, this.descEl, this.controlEl);
	}
	setName(value: string) { this.name = value; this.nameEl.textContent = value; return this; }
	setDesc(value: string) { this.description = value; this.descEl.textContent = value; return this; }
	setHeading() { return this; }
	clear() { this.controls = []; this.controlEl.replaceChildren(); return this; }
	private control(kind: string, build: (control: NativeControl) => void) { const control = new NativeControl(this.controlEl, kind); this.controls.push(control); build(control); return this; }
	addText(build: (control: NativeControl) => void) { return this.control("text", build); }
	addDropdown(build: (control: NativeControl) => void) { return this.control("dropdown", build); }
	addToggle(build: (control: NativeControl) => void) { return this.control("toggle", build); }
	addButton(build: (control: NativeControl) => void) { return this.control("button", build); }
	addExtraButton(build: (control: NativeControl) => void) { return this.control("extra", build); }
}

/** A test controller with the floor's public Setting reuse and cleanup boundaries. */
export class NativeTab {
	containerEl = document.createElement("div");
	private pageContainerEl?: HTMLElement;
	get activeContainerEl(): HTMLElement { return this.pageContainerEl ?? this.containerEl; }
	settingItems: SettingDefinitionItem[] = [];
	nativeRows = new Map<string, { setting: NativeSetting; cleanup?: () => void }>();
	page: string[] = [];
	shown = false;
	updates = 0;
	constructor(public app: App, public plugin: unknown) {}
	getSettingDefinitions(): SettingDefinitionItem[] { return []; }
	getControlValue(_key: string): unknown { throw new Error("Unexpected inherited getter"); }
	setControlValue(_key: string, _value: unknown): void { throw new Error("Unexpected inherited persistence"); }
	update() { this.updates++; this.settingItems = this.getSettingDefinitions(); if (this.shown) this.render(); }
	show(page: string[] = []) {
		const doc = this.activeContainerEl.ownerDocument;
		this.clearRows(); this.page = page; this.shown = true;
		this.pageContainerEl?.remove();
		if (page.length) {
			this.containerEl.remove();
			this.pageContainerEl = doc.createElement("div");
		} else this.pageContainerEl = undefined;
		if (!this.activeContainerEl.isConnected) doc.body.append(this.activeContainerEl);
		this.update();
	}
	hide() { this.shown = false; this.clearRows(); }
	private clearRows() { for (const row of this.nativeRows.values()) row.cleanup?.(); this.nativeRows.clear(); this.activeContainerEl.replaceChildren(); }
	refreshDomState() {}
	private render() {
		let items = this.settingItems;
		for (const name of this.page) {
			const page = items.find(item => "type" in item && item.type === "page" && item.name === name);
			items = page && "items" in page ? page.items ?? [] : [];
		}
		const remaining = new Set(this.nativeRows.keys());
		const walk = (items: SettingDefinitionItem[], group = "") => {
			for (const item of items) {
				if ("type" in item) { if (item.type === "group") walk(item.items ?? [], item.heading); continue; }
				const key = `${group}/${item.name}`;
				remaining.delete(key);
				let row = this.nativeRows.get(key);
				if (!row) { row = { setting: new NativeSetting(this.activeContainerEl) }; this.nativeRows.set(key, row); }
				row.cleanup?.(); row.setting.clear();
				row.setting.setName(item.name).setDesc(typeof item.desc === "string" ? item.desc : "");
				if (item.render) row.cleanup = (item as SettingDefinitionRender).render(row.setting as never, {} as never) ?? undefined;
			}
		};
		walk(items);
		for (const key of remaining) { const row = this.nativeRows.get(key)!; row.cleanup?.(); row.setting.settingEl.remove(); this.nativeRows.delete(key); }
	}
}

export function nativeTab(tab: unknown): NativeTab { return tab as NativeTab; }
export function row(tab: unknown, name: string): NativeSetting {
	const found = [...nativeTab(tab).nativeRows.values()].find(row => row.setting.name === name)?.setting;
	if (!found) throw new Error(`Missing setting: ${name}`);
	return found;
}
export function control(tab: unknown, name: string, kind = "text"): NativeControl {
	const found = row(tab, name).controls.find(control => control.kind === kind);
	if (!found) throw new Error(`Missing ${kind}: ${name}`);
	return found;
}

export function pageNames(tab: unknown): string[] {
	return nativeTab(tab).getSettingDefinitions().flatMap(item => "type" in item && item.type === "page" ? [item.name] : []);
}

import type { App } from "obsidian";
import { installInputSuggestDom } from "./inputSuggestHostMock";

export const modals: NativeModal[] = [];

export class NativeModal {
	modalEl: HTMLElement; contentEl: HTMLElement; titleEl: HTMLElement;
	constructor(public app: App) {
		const doc = (app as App & { activeDocument?: Document }).activeDocument ?? document;
		this.modalEl = doc.createElement("div"); this.contentEl = doc.createElement("div"); this.titleEl = doc.createElement("div");
		this.modalEl.append(this.titleEl, this.contentEl); modals.push(this);
	}
	open() { this.modalEl.ownerDocument.body.append(this.modalEl); this.onOpen(); }
	close() { this.modalEl.remove(); this.onClose(); }
	onOpen() {} onClose() {}
}

export function installNativeDom(doc: Document): () => void {
	const restore = installInputSuggestDom(doc);
	const prototype = doc.defaultView!.HTMLElement.prototype;
	const extras = {
		createEl(this: HTMLElement, tag: string, options?: { text?: string; cls?: string; attr?: Record<string, string> }) {
			const child = this.ownerDocument.createElement(tag); child.textContent = options?.text ?? ""; child.className = options?.cls ?? "";
			for (const [key, value] of Object.entries(options?.attr ?? {})) child.setAttribute(key, value);
			this.append(child); return child;
		},
		createSpan(this: HTMLElement, options?: { text?: string; cls?: string }) {
			const child = this.ownerDocument.createElement("span"); child.textContent = options?.text ?? ""; child.className = options?.cls ?? ""; this.append(child); return child;
		},
		appendText(this: HTMLElement, text: string) { this.append(this.ownerDocument.createTextNode(text)); },
	};
	for (const [key, value] of Object.entries(extras)) Object.defineProperty(prototype, key, { configurable: true, value });
	return () => { for (const key of Object.keys(extras)) Reflect.deleteProperty(prototype, key); restore(); };
}

import type { Scope } from "obsidian";

interface PopperRecord {
	reference: Element;
	popup: HTMLElement;
	destroy: jest.Mock;
	update: jest.Mock;
}

/** Track the positioning resources owned by the real popup implementation. */
export const poppers: PopperRecord[] = [];
export const createPopper = jest.fn((reference: Element, popup: HTMLElement) => {
	const record = { reference, popup, destroy: jest.fn(), update: jest.fn() };
	poppers.push(record);
	return record;
});

/** Route keys through handlers registered by the retained Suggest implementation. */
export function createKeymap() {
	const scopes: Scope[] = [];
	return {
		scopes,
		pushScope: jest.fn((scope: Scope) => { scopes.push(scope); }),
		popScope: jest.fn((scope: Scope) => {
			const index = scopes.lastIndexOf(scope);
			if (index !== -1) scopes.splice(index, 1);
		}),
		press(key: string, doc: Document = document, isComposing = false) {
			const scope = scopes[scopes.length - 1] as (Scope & { handleKey(event: KeyboardEvent): unknown }) | undefined;
			return scope?.handleKey(new doc.defaultView!.KeyboardEvent("keydown", { key, isComposing }));
		},
	};
}

/** Rendered rows are inspected through DOM; no substitute suggestion engine is used. */
export function suggestionRows(input: HTMLInputElement): HTMLElement[] {
	const popup = [...poppers].reverse().find(record => record.reference === input)?.popup;
	return popup ? Array.from(popup.querySelectorAll<HTMLElement>(".suggestion-item")) : [];
}

/** Supply Obsidian DOM conveniences independently in each document's own realm. */
export function installInputSuggestDom(doc: Document): () => void {
	const prototype = doc.defaultView!.HTMLElement.prototype;
	const previous = new Map<string, PropertyDescriptor | undefined>();
	const methods = {
		createDiv(this: HTMLElement, options?: string | { cls?: string | string[]; text?: string }) {
			const element = this.ownerDocument.createElement("div");
			const classes = typeof options === "string" ? options : options?.cls;
			if (classes) element.className = Array.isArray(classes) ? classes.join(" ") : classes;
			if (typeof options === "object" && options.text) element.textContent = options.text;
			this.appendChild(element);
			return element;
		},
		setText(this: HTMLElement, text: string) { this.textContent = text; },
		addClass(this: HTMLElement, ...classes: string[]) { this.classList.add(...classes); },
		removeClass(this: HTMLElement, ...classes: string[]) { this.classList.remove(...classes); },
		empty(this: HTMLElement) { this.replaceChildren(); },
		detach(this: HTMLElement) { this.remove(); },
		scrollIntoView() {},

	};
	for (const [name, method] of Object.entries(methods)) {
		previous.set(name, Object.getOwnPropertyDescriptor(prototype, name));
		Object.defineProperty(prototype, name, { value: method, configurable: true, writable: true });
	}
	return () => {
		for (const [name, descriptor] of previous) {
			if (descriptor) Object.defineProperty(prototype, name, descriptor);
			else Reflect.deleteProperty(prototype, name);
		}
	};
}

/** Count active listeners using the browser's callback/type/capture matching rule. */
export function trackListeners(target: EventTarget) {
	const active: { type: string; callback: EventListenerOrEventListenerObject; capture: boolean }[] = [];
	const add = target.addEventListener.bind(target);
	const remove = target.removeEventListener.bind(target);
	jest.spyOn(target, "addEventListener").mockImplementation((type, callback, options) => {
		const capture = typeof options === "boolean" ? options : options?.capture ?? false;
		if (callback && !active.some(item => item.type === type && item.callback === callback && item.capture === capture)) active.push({ type, callback, capture });
		add(type, callback, options);
	});
	jest.spyOn(target, "removeEventListener").mockImplementation((type, callback, options) => {
		const capture = typeof options === "boolean" ? options : options?.capture ?? false;
		const index = active.findIndex(item => item.type === type && item.callback === callback && item.capture === capture);
		if (index !== -1) active.splice(index, 1);
		remove(type, callback, options);
	});
	return active;
}

/** Observe popup and row listeners from creation, before the suggest constructor attaches them. */
export function trackCreatedElementListeners(doc: Document) {
	const listeners: ReturnType<typeof trackListeners>[] = [];
	const create = doc.createElement.bind(doc);
	jest.spyOn(doc, "createElement").mockImplementation((tagName, options) => {
		const element = create(tagName, options);
		if (tagName === "div") listeners.push(trackListeners(element));
		return element;
	});
	return listeners;
}

/*!
Source: [Obsidian Periodic Notes](https://github.com/liamcain/obsidian-periodic-notes)
Author: Liam Cain

MIT License

Copyright (c) 2021 Liam Cain

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import { createPopper, type Instance as PopperInstance } from "@popperjs/core";
import { App, type ISuggestOwner, Scope } from "obsidian";
import { inputSuggestScope } from "./inputSuggestLifecycle";

const wrapAround = (value: number, size: number): number => ((value % size) + size) % size;

// Retain the original navigation engine; this class owns only its popup listeners.
class Suggest<T> {
	private values: T[] = [];
	private suggestions: HTMLDivElement[] = [];
	private selectedItem = 0;
	private readonly onClick = (event: MouseEvent) => {
		const index = this.itemIndex(event);
		if (index < 0) return;
		event.preventDefault();
		this.setSelectedItem(index, false);
		this.useSelectedItem(event);
	};
	private readonly onMouseover = (event: MouseEvent) => {
		const index = this.itemIndex(event);
		if (index >= 0) this.setSelectedItem(index, false);
	};

	constructor(private owner: ISuggestOwner<T>, private containerEl: HTMLElement, scope: Scope) {
		containerEl.addEventListener("click", this.onClick);
		containerEl.addEventListener("mousemove", this.onMouseover);
		scope.register([], "ArrowUp", event => {
			if (!event.isComposing) { this.setSelectedItem(this.selectedItem - 1, true); return false; }
		});
		scope.register([], "ArrowDown", event => {
			if (!event.isComposing) { this.setSelectedItem(this.selectedItem + 1, true); return false; }
		});
		scope.register([], "Enter", event => {
			if (!event.isComposing) { this.useSelectedItem(event); return false; }
		});
	}

	private itemIndex(event: MouseEvent): number {
		const win = this.containerEl.ownerDocument.defaultView;
		if (!win || !(event.target instanceof win.Element)) return -1;
		const el = event.target.closest(".suggestion-item");
		return this.suggestions.findIndex(item => item === el);
	}

	setSuggestions(values: T[]): void {
		this.containerEl.empty();
		this.values = values;
		this.suggestions = values.map(value => {
			const el = this.containerEl.createDiv("suggestion-item");
			this.owner.renderSuggestion(value, el);
			return el;
		});
		this.setSelectedItem(0, false);
	}

	private useSelectedItem(event: MouseEvent | KeyboardEvent): void {
		if (this.selectedItem < this.values.length) this.owner.selectSuggestion(this.values[this.selectedItem], event);
	}

	private setSelectedItem(index: number, scrollIntoView: boolean): void {
		if (!this.suggestions.length) { this.selectedItem = 0; return; }
		const normalized = wrapAround(index, this.suggestions.length);
		this.suggestions[this.selectedItem]?.removeClass("is-selected");
		const selected = this.suggestions[normalized];
		selected.addClass("is-selected");
		this.selectedItem = normalized;
		if (scrollIntoView) selected.scrollIntoView(false);
	}

	dispose(): void {
		this.setSuggestions([]);
		this.containerEl.removeEventListener("click", this.onClick);
		this.containerEl.removeEventListener("mousemove", this.onMouseover);
	}
}

/** Optional styles for the existing owned popup. */
export interface TextInputSuggestOptions {
	additionalClasses?: string[] | string;
}

/** Owned settings autocomplete; catalogs refresh once per focus, never per keystroke. */
export abstract class TextInputSuggest<T> implements ISuggestOwner<T> {
	private catalog: T[] = [];
	private popper?: PopperInstance;
	private readonly scope: Scope;
	private readonly suggestEl: HTMLElement;
	private readonly suggest: Suggest<T>;
	private opened = false;
	private disposed = false;
	private committing = false;
	private releaseOwner?: () => void;
	private readonly onFocus = () => {
		if (!this.usable()) return;
		let catalog: T[];
		try { catalog = this.getCatalog(); } catch { catalog = []; }
		// Build locally: reentrant teardown/focus loss cannot publish a late catalog.
		if (!this.usable() || this.inputEl.ownerDocument.activeElement !== this.inputEl) return;
		this.catalog = catalog;
		this.onInput();
	};
	private readonly onInput = () => {
		if (!this.usable() || this.committing || this.inputEl.ownerDocument.activeElement !== this.inputEl) return;
		const values = this.getSuggestions(this.inputEl.value);
		if (!values.length) { this.close(); return; }
		this.suggest.setSuggestions(values);
		this.open();
	};
	private readonly onBlur = () => this.close();
	private readonly onPageHide = () => this.dispose();
	private readonly preventBlur = (event: MouseEvent) => event.preventDefault();

	constructor(protected app: App, protected inputEl: HTMLInputElement, options: TextInputSuggestOptions = {}) {
		this.scope = new Scope();
		this.suggestEl = inputEl.ownerDocument.createElement("div");
		this.suggestEl.classList.add("suggestion-container", "popover");
		const classes = options.additionalClasses ?? [];
		this.suggestEl.addClass(...(Array.isArray(classes) ? classes : classes.split(/\s+/).filter(Boolean)));
		this.suggest = new Suggest(this, this.suggestEl.createDiv("suggestion"), this.scope);
		this.scope.register([], "Escape", event => {
			if (!event.isComposing) { this.close(); return false; }
		});
		inputEl.addEventListener("focus", this.onFocus);
		inputEl.addEventListener("input", this.onInput);
		inputEl.addEventListener("blur", this.onBlur);
		this.suggestEl.addEventListener("mousedown", this.preventBlur);
		inputEl.ownerDocument.defaultView?.addEventListener("blur", this.onBlur);
		inputEl.ownerDocument.defaultView?.addEventListener("pagehide", this.onPageHide);
		this.releaseOwner = inputSuggestScope(inputEl)?.own(() => this.dispose());
	}

	private usable(): boolean {
		return !this.disposed && this.inputEl.isConnected && !this.inputEl.disabled;
	}

	getSuggestions(query: string): T[] {
		return this.usable() ? this.filterCatalog(this.catalog, query) : [];
	}

	open(): void {
		if (!this.usable() || this.committing || this.inputEl.ownerDocument.activeElement !== this.inputEl) return;
		if (this.opened) { void this.popper?.update(); return; }
		this.opened = true;
		this.app.keymap.pushScope(this.scope);
		this.inputEl.ownerDocument.body.appendChild(this.suggestEl);
		try {
			// Native 1.12.7/1.13.4/1.14.1 close leaks a capture-scroll listener; see docs/input-suggestions.md.
			// eslint-disable-next-line obsidianmd/prefer-abstract-input-suggest -- Retain owned lifecycle until native public disposal is corrected and verified.
			this.popper = createPopper(this.inputEl, this.suggestEl, {
				placement: "bottom-start",
				modifiers: [{
					name: "sameWidth", enabled: true, phase: "beforeWrite", requires: ["computeStyles"],
					fn: ({ state, instance }) => {
						const width = `${state.rects.reference.width}px`;
						if (state.styles.popper.width === width) return;
						state.styles.popper.width = width;
						void instance.update();
					},
				}],
			});
		} catch {
			this.close();
		}
	}

	close(): void {
		if (this.opened) this.app.keymap.popScope(this.scope);
		this.opened = false;
		this.popper?.destroy();
		this.popper = undefined;
		this.suggest.setSuggestions([]);
		this.suggestEl.remove();
	}

	/** Commit exact text once using the input's own window, without reopening. */
	protected commitValue(value: string): void {
		if (!this.usable() || !this.opened || this.committing) return;
		const win = this.inputEl.ownerDocument.defaultView;
		if (!win) return;
		this.committing = true;
		this.close();
		try {
			this.inputEl.value = value;
			this.inputEl.dispatchEvent(new win.Event("input", { bubbles: true }));
		} finally {
			this.committing = false;
		}
	}

	/** Idempotently release every listener, popup, catalog and owner registration. */
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.close();
		this.catalog = [];
		this.suggest.dispose();
		this.inputEl.removeEventListener("focus", this.onFocus);
		this.inputEl.removeEventListener("input", this.onInput);
		this.inputEl.removeEventListener("blur", this.onBlur);
		this.suggestEl.removeEventListener("mousedown", this.preventBlur);
		this.inputEl.ownerDocument.defaultView?.removeEventListener("blur", this.onBlur);
		this.inputEl.ownerDocument.defaultView?.removeEventListener("pagehide", this.onPageHide);
		this.releaseOwner?.();
		this.releaseOwner = undefined;
	}

	protected abstract getCatalog(): T[];
	protected abstract filterCatalog(catalog: T[], query: string): T[];
	abstract renderSuggestion(value: T, el: HTMLElement): void;
	abstract selectSuggestion(value: T, event?: MouseEvent | KeyboardEvent): void;
}

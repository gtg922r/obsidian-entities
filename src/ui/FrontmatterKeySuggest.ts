import { App } from "obsidian";
import { TextInputSuggest, TextInputSuggestOptions } from "./suggest";

export class FrontmatterKeySuggest extends TextInputSuggest<string> {
	private allKeys: string[] = [];

	constructor(app: App, inputEl: HTMLInputElement, options?: Partial<TextInputSuggestOptions>) {
		super(app, inputEl, options);
		this.initialize();
	}

	private async initialize() {
		const allKeysSet = await getAllFrontmatterKeys(this.app);
		this.allKeys = Array.from(allKeysSet);
	}

	getSuggestions(inputStr: string): string[] {
		return this.allKeys.filter(key => key.toLowerCase().includes(inputStr.toLowerCase()));
	}

	renderSuggestion(key: string, el: HTMLElement): void {
		el.setText(key);
	}

	selectSuggestion(key: string): void {
		this.inputEl.value = key;
		this.inputEl.trigger("input");
		this.close();
	}
}

async function getAllFrontmatterKeys(app: App): Promise<Set<string>> {
	const metadataCache = app.metadataCache;
	const vault = app.vault;
	const allFiles = vault.getMarkdownFiles();

	const allKeys = new Set<string>();

	for (const file of allFiles) {
		const fileCache = metadataCache.getFileCache(file);

		if (fileCache && fileCache.frontmatter) {
			const frontmatterKeys = Object.keys(fileCache.frontmatter);
			frontmatterKeys.forEach(key => allKeys.add(key));
		}
	}

	return allKeys;
}

import { TextInputSuggest } from "./suggest";

/** Offer cached frontmatter keys, refreshed when the input next receives focus. */
export class FrontmatterKeySuggest extends TextInputSuggest<string> {
	protected getCatalog(): string[] {
		const keys = new Set<string>();
		for (const file of this.app.vault.getMarkdownFiles()) {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (frontmatter) Object.keys(frontmatter).forEach(key => keys.add(key));
		}
		return Array.from(keys);
	}

	protected filterCatalog(catalog: string[], query: string): string[] {
		return catalog.filter(key => key.toLowerCase().includes(query.toLowerCase()));
	}

	renderSuggestion(key: string, el: HTMLElement): void {
		el.setText(key);
	}

	selectSuggestion(key: string): void {
		this.commitValue(key);
	}
}

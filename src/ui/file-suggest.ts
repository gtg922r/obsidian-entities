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

import { TFile, TFolder } from "obsidian";
import { TextInputSuggest } from "./suggest";

/** Pick a Markdown file using its exact vault path. */
export class FileSuggest extends TextInputSuggest<TFile> {
	protected getCatalog(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	protected filterCatalog(catalog: TFile[], query: string): TFile[] {
		return catalog.filter(file => file.path.toLowerCase().includes(query.toLowerCase()));
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.setText(file.path);
	}

	selectSuggestion(file: TFile): void {
		this.commitValue(file.path);
	}
}

/** Pick a folder, including the canonical vault root, without normalizing paths. */
export class FolderSuggest extends TextInputSuggest<TFolder> {
	protected getCatalog(): TFolder[] {
		const folders = this.app.vault.getAllLoadedFiles().filter((file): file is TFolder => file instanceof TFolder);
		const root = this.app.vault.getRoot();
		return folders.includes(root) ? folders : [root, ...folders];
	}

	protected filterCatalog(catalog: TFolder[], query: string): TFolder[] {
		return catalog.filter(folder => folder.path.toLowerCase().includes(query.toLowerCase()));
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder): void {
		this.commitValue(folder.path);
	}
}

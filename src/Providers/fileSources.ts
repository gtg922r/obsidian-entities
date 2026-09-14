import { App, TFile, TFolder } from "obsidian";
import { applyCompiledFiltersToFiles, compileFilters } from "./EntityFilters";

/** Source validity and qualifying file counts are independent of alias expansion. */
export type FileSourceResult =
	| { status: "ready"; files: TFile[]; total: number }
	| { status: "error" | "unavailable"; message: string };

/** Walk actual child folders in vault order, retaining every TFile including attachments. */
export function collectFolderFiles(folder: TFolder, recursive: boolean): TFile[] {
	const files: TFile[] = [];
	const visit = (current: TFolder) => {
		for (const child of current.children) {
			if (child instanceof TFile) files.push(child);
			else if (recursive && child instanceof TFolder) visit(child);
		}
	};
	visit(folder);
	return files;
}

/** Compile once and count real candidates before expanding any aliases. */
export function filterSourceFiles(files: TFile[], filters: unknown, app: App): FileSourceResult {
	const compiled = compileFilters(filters);
	if (compiled.error) return { status: "error", message: compiled.error };
	return { status: "ready", files: applyCompiledFiltersToFiles(files, compiled, app), total: files.length };
}

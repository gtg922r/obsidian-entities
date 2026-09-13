import { App } from "obsidian";
import { CreationResult, requireLiveFile } from "./entityCreation";
import { effectiveFileAlias } from "./suggestionTargets";
import { EntitiesNotice } from "./userComponents";

/** Provider/UI boundary: only confirmed outcomes become native links to the captured source. */
export function creationResultLink(app: App, result: CreationResult, sourcePath: string, alias?: string): string | undefined {
	if (result.status === "cancelled") {
		new EntitiesNotice("Note creation cancelled.", "info", 4000);
		return;
	}
	if (result.status === "failed") {
		const partial = result.partialFile ? ` A partial file was reported: ${result.partialFile.path}.` : "";
		new EntitiesNotice(`Unable to create note: ${result.error.message.slice(0, 180)}${partial.slice(0, 180)}`, "alert-triangle", 8000);
		return;
	}
	try {
		const file = requireLiveFile(app, result.file);
		const link = app.fileManager.generateMarkdownLink(file, sourcePath, undefined, effectiveFileAlias(file, alias));
		if (typeof link !== "string" || !link.length) throw new Error("No native link returned.");
		return link;
	} catch {
		new EntitiesNotice(`The note was ${result.status === "created" ? "created" : "found"}, but its link could not be inserted: ${result.file.path.slice(0, 180)}`, "alert-triangle", 8000);
	}
}

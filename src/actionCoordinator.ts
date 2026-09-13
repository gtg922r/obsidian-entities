import { App, Editor, EditorPosition, EditorSuggestContext, Notice, TFile } from "obsidian";
import { ActionContext, ActionEdit, ActionResult, CapturedSelection, NonActionTarget, SuggestionTarget } from "./suggestion.types";
import { effectiveFileAlias, readSuggestionTarget, unresolvedWikilink } from "./suggestionTargets";
import { EditorBindings, EditorBindingSnapshot } from "./editorBindings";

interface Operation {
	readonly editor: Editor;
	readonly binding: EditorBindingSnapshot;
	readonly context: ActionContext;
	readonly isProviderCurrent: () => boolean;
	settled: boolean;
}

/** Reject invalid positions rather than relying on the host's clamping conversions. */
export function snapshotOffset(snapshot: string, position: EditorPosition): number {
	const lines = snapshot.split("\n");
	if (!Number.isInteger(position.line) || !Number.isInteger(position.ch) || position.line < 0 ||
		position.line >= lines.length || position.ch < 0 || position.ch > lines[position.line].length) throw new Error("The suggestion range is no longer valid.");
	let offset = position.ch;
	for (let i = 0; i < position.line; i++) offset += lines[i].length + 1;
	return offset;
}

function positionAt(snapshot: string, offset: number): EditorPosition {
	const lines = snapshot.slice(0, offset).split("\n");
	return { line: lines.length - 1, ch: lines[lines.length - 1].length };
}

function selectionsAt(editor: Editor, snapshot: string): readonly CapturedSelection[] {
	return Object.freeze(editor.listSelections().map(selection => Object.freeze({
		anchor: snapshotOffset(snapshot, selection.anchor), head: snapshotOffset(snapshot, selection.head),
	})));
}

function readResult(value: unknown): ActionResult {
	if (!value || typeof value !== "object") throw new Error("The action returned an invalid outcome.");
	const result = value as Record<string, unknown>;
	switch (result.status) {
		case "created":
		case "existing":
			// Validate shape separately: a later deletion must retain the known creation status.
			if (result.file instanceof TFile && typeof result.file.path === "string" &&
				(result.alias === undefined || typeof result.alias === "string")) return { status: result.status, file: result.file, alias: result.alias };
			break;
		case "cancelled": return { status: "cancelled" };
		case "failed":
			if (result.error instanceof Error && (result.partialFile === undefined || result.partialFile instanceof TFile)) {
				return { status: "failed", error: result.error, partialFile: result.partialFile };
			}
			break;
		case "unavailable":
			if (typeof result.message === "string" && result.message.length) return { status: "unavailable", message: result.message };
			break;
		case "target": {
			const target = readSuggestionTarget(result.target);
			if (target.kind !== "action") return { status: "target", target };
			break;
		}
		case "edit": {
			const edit = result.edit as ActionEdit | undefined;
			if (edit && [edit.from, edit.to, edit.cursor].every(Number.isInteger) && typeof edit.text === "string") {
				return { status: "edit", edit: { from: edit.from, to: edit.to, text: edit.text, cursor: edit.cursor } };
			}
		}
	}
	throw new Error("The action returned an invalid outcome.");
}

/** Owns action settlement, feedback and the sole guarded editor commit. */
export class ActionCoordinator {
	private pending = new WeakMap<Editor, Operation>();
	private disposed = false;

	constructor(private readonly app: App, private readonly bindings: EditorBindings) {}

	private notice(message: string): void {
		if (this.disposed) return;
		// A host feedback failure must not retry or reject an already-settled action.
		try { new Notice(`Entities: ${message}`, 8000); } catch { /* No editor cleanup or retry. */ }
	}

	private current(operation: Operation): boolean {
		const { context, editor } = operation;
		if (this.disposed || operation.settled || this.pending.get(editor) !== operation || !operation.isProviderCurrent() ||
			!this.bindings.isCurrent(operation.binding) || context.source.file.path !== context.source.path ||
			this.app.vault.getAbstractFileByPath(context.source.path) !== context.source.file || editor.getValue() !== context.snapshot) return false;
		const selections = selectionsAt(editor, context.snapshot);
		return selections.length === context.selections.length && selections.every((selection, i) =>
			selection.anchor === context.selections[i].anchor && selection.head === context.selections[i].head) &&
			context.snapshot.slice(context.trigger.from, context.trigger.to) === context.trigger.text;
	}

	private canStart(operation: Operation): boolean {
		try { return this.current(operation); } catch { return false; }
	}

	/** Entry is synchronous, including ordinary targets and displayed-selection consumption. */
	select(context: EditorSuggestContext, sourcePath: string, target: SuggestionTarget, isProviderCurrent: () => boolean, consume: () => void): void {
		const previous = this.pending.get(context.editor);
		if (previous && this.canStart(previous)) return;
		let operation: Operation;
		try {
			const editor = context.editor, snapshot = editor.getValue();
			const from = snapshotOffset(snapshot, { line: context.start.line, ch: context.start.ch - 1 });
			const to = snapshotOffset(snapshot, context.end);
			if (from > to || !context.query || snapshot.slice(from, to) !== context.query ||
				context.file.path !== sourcePath || this.app.vault.getAbstractFileByPath(sourcePath) !== context.file) throw new Error("The suggestion source changed. Search again.");
			const binding = this.bindings.capture(editor, context.file);
			if (!binding) throw new Error("The source editor is unavailable. Search again in a live note.");
			const selections = selectionsAt(editor, snapshot);
			if (!selections.length || snapshotOffset(snapshot, editor.getCursor("head")) !== to) throw new Error("The source selection changed. Search again.");
			const captured = Object.freeze({ source: Object.freeze({ file: context.file, path: sourcePath }), snapshot,
				trigger: Object.freeze({ from, to, text: snapshot.slice(from, to), query: context.query }), selections,
				canStartWork: () => this.canStart(operation) });
			operation = { editor, binding, context: captured, isProviderCurrent, settled: false };
			this.pending.set(editor, operation);
		} catch (error) {
			consume();
			this.notice(error instanceof Error ? error.message : "The source editor is unavailable.");
			return;
		}
		consume();
		try {
			if (!this.canStart(operation)) { this.settle(operation); return; }
			const result = target.kind === "action" ? target.callback(operation.context) : { status: "target" as const, target };
			if (result && typeof (result as Promise<ActionResult>).then === "function") {
				void Promise.resolve(result).then(value => this.finish(operation, value), error => this.fail(operation, error));
			} else this.finish(operation, result);
		} catch (error) { this.fail(operation, error); }
	}

	private settle(operation: Operation): void {
		operation.settled = true;
		if (this.pending.get(operation.editor) === operation) this.pending.delete(operation.editor);
	}

	private fail(operation: Operation, error: unknown): void {
		if (operation.settled) return;
		this.settle(operation);
		this.notice(`Unable to complete action: ${error instanceof Error ? error.message.slice(0, 180) : "Unexpected action failure."}`);
	}

	private replacement(target: NonActionTarget, sourcePath: string): string {
		switch (target.kind) {
			case "text": return target.text;
			case "unresolved-link": return unresolvedWikilink(target.linkpath, target.alias);
			case "file": {
				if (this.app.vault.getAbstractFileByPath(target.file.path) !== target.file) throw new Error("The target file was deleted or replaced. Search again.");
				const path = target.file.path;
				let link: string;
				try { link = this.app.fileManager.generateMarkdownLink(target.file, sourcePath, undefined, effectiveFileAlias(target.file, target.alias)); }
				catch { throw new Error("Unable to make a native link to this file."); }
				if (target.file.path !== path || typeof link !== "string" || !link.length) throw new Error("Unable to make a native link to this file.");
				return link;
			}
		}
	}

	private finish(operation: Operation, value: unknown): void {
		if (operation.settled) return;
		let result: ActionResult | undefined;
		try {
			result = readResult(value);
			if (result.status === "cancelled" || result.status === "failed" || result.status === "unavailable") {
				this.settle(operation);
				this.notice(result.status === "cancelled" ? "Action cancelled." : result.status === "unavailable" ? result.message :
					`Unable to complete action: ${result.error.message.slice(0, 180)}${result.partialFile ? ` Partial file reported: ${result.partialFile.path}` : ""}`);
				return;
			}
			if (!this.canStart(operation)) throw new Error("The source changed; insertion was cancelled.");
			const { context } = operation;
			let edit: ActionEdit;
			if (result.status === "edit") edit = result.edit;
			else {
				const target: NonActionTarget = result.status === "target" ? result.target : { kind: "file", file: result.file, alias: result.alias };
				const text = this.replacement(target, context.source.path);
				edit = { from: context.trigger.from, to: context.trigger.to, text, cursor: context.trigger.from + text.length };
			}
			if (edit.from < 0 || edit.to < edit.from || edit.to > context.snapshot.length || edit.cursor < 0 ||
				edit.cursor > context.snapshot.length - (edit.to - edit.from) + edit.text.length) throw new Error("The action returned an invalid edit range.");
			const after = context.snapshot.slice(0, edit.from) + edit.text + context.snapshot.slice(edit.to);
			const transaction = { changes: [{ from: positionAt(context.snapshot, edit.from), to: positionAt(context.snapshot, edit.to), text: edit.text }],
				selection: { from: positionAt(after, edit.cursor) } };
			// Formatting may run integration code: recheck target identity and all captured state last.
			const file = result.status === "created" || result.status === "existing" ? result.file :
				result.status === "target" && result.target.kind === "file" ? result.target.file : undefined;
			if (file && this.app.vault.getAbstractFileByPath(file.path) !== file) throw new Error("The target file was deleted or replaced.");
			if (!this.canStart(operation)) throw new Error("The source changed; insertion was cancelled.");
			this.settle(operation);
			operation.editor.transaction(transaction, "input.complete");
		} catch (error) {
			this.settle(operation);
			if (result?.status === "created" || result?.status === "existing") {
				this.notice(`The note was ${result.status === "created" ? "created" : "found"}, but its link could not be inserted: ${result.file.path}`);
			} else this.notice(error instanceof Error ? error.message.slice(0, 180) : "Unable to complete action.");
		}
	}

	/** Pending native work can finish, but cannot edit or resurrect feedback after unload. */
	dispose(): void { this.disposed = true; this.pending = new WeakMap(); }
}

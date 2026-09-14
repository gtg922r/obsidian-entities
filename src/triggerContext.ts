import { EditorState } from "@codemirror/state";
import { syntaxTree, syntaxTreeAvailable } from "@codemirror/language";
import { EditorPosition, EditorSuggestTriggerInfo } from "obsidian";

const WHITESPACE = /\s/;
const PROTECTED_PARTS = new Set([
	"inline-code", "hmd-codeblock", "hmd-indented-code", "HyperMD-codeblock",
	"hmd-internal-link", "formatting-link-start", "formatting-link-end", "url", "formatting-link-string",
]);

/** Choose the newest boundary starter before validating; an invalid newer query never revives an older one. */
export function triggerCandidate(line: string, cursor: EditorPosition): EditorSuggestTriggerInfo | null {
	if (!Number.isInteger(cursor.line) || cursor.line < 0 || !Number.isInteger(cursor.ch) || cursor.ch < 0 || cursor.ch > line.length) return null;
	for (let i = cursor.ch - 1; i >= 0; i--) {
		const mark = line[i];
		if (!"@:/".includes(mark) || (i > 0 && !WHITESPACE.test(line[i - 1]))) continue;
		const query = line.slice(i, cursor.ch), tail = query.slice(1);
		if (mark === "@" ? tail.length > 0 && !/\S/.test(tail) : WHITESPACE.test(tail) || (mark === "/" && tail.includes("/"))) return null;
		return { start: { line: cursor.line, ch: i + 1 }, end: { ...cursor }, query };
	}
	return null;
}

/** Native syntax knowledge is confined here; unavailable trees are retried only on normal future requests. */
export function triggerSyntax(state: EditorState, from: number, to: number): "allowed" | "blocked" | "unavailable" {
	try {
		if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from || to > state.doc.length) return "unavailable";
		const line = state.doc.lineAt(from);
		if (to > line.to || !syntaxTreeAvailable(state, to)) return "unavailable";
		let blocked = false;
		let wikiEnd = -1;
		let unfinishedFrom = -1;
		const overlaps = (a: number, b: number) => a < b && a < to && b > from;
		syntaxTree(state).iterate({ from: line.from, to, enter(node) {
			if (node.to <= node.from || node.from >= to || node.to <= line.from) return false;
			const parts = node.name.split("_");
			if (parts.some(part => PROTECTED_PARTS.has(part)) && overlaps(node.from, node.to)) blocked = true;
			// Structural wrappers are not token classifications. Still visit their children.
			if (node.type.isTop || parts.some(part => part.startsWith("HyperMD-"))) return;
			if (node.node.firstChild) return;
			if (!node.name) return;
			const has = (part: string) => parts.includes(part);
			// Only the contiguous native bare-link run after an actual [[ opener belongs to open wiki syntax.
			if (has("formatting-link") && state.sliceDoc(node.from, node.from + 2) === "[[") {
				wikiEnd = node.to;
				if (overlaps(node.from, node.to)) blocked = true;
			} else if (node.from === wikiEnd && has("hmd-barelink") && has("link")) {
				wikiEnd = node.to;
				if (overlaps(node.from, node.to)) blocked = true;
			} else wikiEnd = -1;
			// A classified token ends the unclassified tail; no balancing or free-text link scan.
			if (unfinishedFrom >= 0) {
				if (overlaps(unfinishedFrom, node.from)) blocked = true;
				unfinishedFrom = -1;
			}
			if (has("formatting") && has("formatting-link") && has("link") && !has("hmd-barelink") &&
				state.sliceDoc(node.from, node.to) === "]" && state.sliceDoc(node.to, node.to + 1) === "(") unfinishedFrom = node.to;
		} });
		if (unfinishedFrom >= 0 && overlaps(unfinishedFrom, to)) blocked = true;
		return blocked ? "blocked" : "allowed";
	} catch { return "unavailable"; }
}

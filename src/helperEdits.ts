import { ActionContext, ActionEdit } from "./suggestion.types";

function sourceLine(context: ActionContext) {
	const { snapshot, trigger } = context;
	const from = snapshot.slice(0, trigger.from).lastIndexOf("\n") + 1;
	const newline = snapshot.indexOf("\n", trigger.to);
	const to = newline < 0 ? snapshot.length : newline;
	if (snapshot.slice(trigger.from, trigger.to).includes("\n")) throw new Error("Helpers require a single source line.");
	const original = snapshot.slice(from, to);
	const indentation = original.match(/^[\t ]*/)?.[0] ?? "";
	const remaining = snapshot.slice(from, trigger.from) + snapshot.slice(trigger.to, to);
	return { from, to, indentation, content: remaining.slice(indentation.length) };
}

/** Change only the ordinary dash/task prefix and optionally append an absent created tag. */
export function checkboxEdit(context: ActionContext, status: string, addCreatedTag: boolean, date: string): ActionEdit {
	const line = sourceLine(context);
	let content = line.content.replace(/^- (?:\[[^\]\r\n]?\](?:[\t ]|$))?/, "");
	if (addCreatedTag && !/\[created::[^\]\r\n]*\]/.test(content)) {
		content += `${content.length && !/[\t ]$/.test(content) ? " " : ""}[created::${date}]`;
	}
	const text = `${line.indentation}- [${status}] ${content}`;
	return { from: line.from, to: line.to, text, cursor: line.from + text.length };
}

/** Retain original indentation before both quote markers in one affected-line replacement. */
export function calloutEdit(context: ActionContext, type: string): ActionEdit {
	const line = sourceLine(context);
	const text = `${line.indentation}> [!${type}]\n${line.indentation}> ${line.content}`;
	return { from: line.from, to: line.to, text, cursor: line.from + text.length };
}

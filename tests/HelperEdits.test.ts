import { checkboxEdit, calloutEdit } from "../src/helperEdits";
import { actionContext } from "./suggestionTestHelpers";

const date = "2026-09-13";
test.each([
	["Task /done", true, "- [x] Task [created::2026-09-13]"],
	["\t- [/] Plan [created::2025-01-02] /done", true, "\t- [x] Plan [created::2025-01-02] "],
	["  - Plan /done", false, "  - [x] Plan "],
	["Task [created::old value] /done", false, "- [x] Task [created::old value] "],
	["Task [created::first] [created::second] /done", true, "- [x] Task [created::first] [created::second] "],
	["Task /done remainder", false, "- [x] Task  remainder"],
	["Task/done remainder", false, "- [x] Task remainder"],
	["\t/done", true, "\t- [x] [created::2026-09-13]"],
	["- [x] Already /done", false, "- [x] Already "],
	["- [ ]  Extra spacing  /done", false, "- [x]  Extra spacing  "],
] as const)("checkbox preserves nontrigger content in %j", (snapshot, enabled, expected) => {
	const edit = checkboxEdit(actionContext(undefined, snapshot, "/done"), "x", enabled, date);
	expect(edit).toEqual({ from: 0, to: snapshot.length, text: expected, cursor: expected.length });
});

test("repeat conversion changes status without adding or deleting created metadata", () => {
	const first = checkboxEdit(actionContext(undefined, "\tTask /done", "/done"), "x", true, date).text;
	const next = `${first} /todo`;
	expect(checkboxEdit(actionContext(undefined, next, "/todo"), " ", true, "2030-01-01").text).toBe("\t- [ ] Task [created::2026-09-13] ");
});

test.each(["", "  ", "\t"])("callout retains indentation %j before both markers", indentation => {
	const snapshot = `previous\n${indentation}Body /note suffix\nfollowing`;
	const edit = calloutEdit(actionContext(undefined, snapshot, "/note"), "note");
	expect(snapshot.slice(0, edit.from) + edit.text + snapshot.slice(edit.to)).toBe(`previous\n${indentation}> [!note]\n${indentation}> Body  suffix\nfollowing`);
	expect(edit.cursor).toBe(edit.from + edit.text.length);
});

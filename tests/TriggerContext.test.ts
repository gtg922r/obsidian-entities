import { EditorState } from "@codemirror/state";
import { syntaxTreeAvailable } from "@codemirror/language";
import { triggerCandidate, triggerSyntax } from "../src/triggerContext";
import { NativeNode, replayLanguage } from "./nativeSyntaxFixture";

interface Fixture { name: string; doc: string; nodes: NativeNode[] }
const cases: Fixture[] = require("./fixtures/native-syntax.json").cases;
const read = (name: string) => cases.find(item => item.name === name)!;
const stateFor = (fixture: Fixture) => EditorState.create({ doc: fixture.doc, extensions: replayLanguage(() => fixture.nodes) });

// These are actual emitted native token ranges replayed into a synthetic tree, not a live host parser test.
test.each([
	["prose", "@Bob Hope", "allowed"], ["inline", "@Bob", "blocked"], ["inline-open", "@Bob", "blocked"],
	["inline-double", "@Bob", "blocked"], ["fence", "/todo", "blocked"], ["fence-open", "@Bob", "blocked"],
	["tilde-fence", "@Bob", "blocked"], ["indented", "@Bob", "blocked"], ["fence-language", "@Bob", "blocked"],
	["fence-empty", "@Bob", "blocked"], ["indent-after-prose", "@Bob", "allowed"],
	["wiki-open", "@Bob", "blocked"], ["wiki-alias-open", "@Robert", "blocked"], ["embed-open", "@Robert", "blocked"],
	["wiki-half-close", "@Alice", "blocked"], ["wiki-alias-closed", "@Robert", "blocked"], ["wiki-closed", "@Bob", "blocked"],
	["markdown-dest", "@Bob", "blocked"], ["markdown-dest-open", "@Bob", "blocked"], ["markdown-url", "@Bob", "blocked"],
	["markdown-label", "@Bob", "allowed"], ["reference", "@Bob", "allowed"],
	["destination-nested-open", "@Bob", "allowed"], ["destination-closed-tail", "@Bob", "allowed"],
	["destination-spaced", "@Bob", "allowed"], ["destination-literal", "@Bob", "allowed"], ["barelink", "@Bob", "allowed"],
	["wiki-then-prose", "@Alice", "allowed"], ["inline-then-prose", "@Alice", "allowed"],
	["wiki-closed-query", "@Bob [[Wiki]] tail", "blocked"], ["inline-query", "@Bob `code` tail", "blocked"],
])("native %s at %s → %s", (name, query, expected) => {
	const fixture = read(name), from = fixture.doc.indexOf(query), to = from + query.length;
	const state = stateFor(fixture);
	expect(syntaxTreeAvailable(state, to)).toBe(true);
	expect(triggerSyntax(state, from, to)).toBe(expected);
});

test.each(["inline", "inline-double", "wiki-closed", "markdown-dest"])("%s trigger cannot leak through its closing delimiter into prose", name => {
	const fixture = read(name), state = stateFor(fixture), from = fixture.doc.indexOf("@");
	const next = fixture.doc.indexOf("@", from + 1), to = next < 0 ? fixture.doc.length : next;
	expect(triggerSyntax(state, from, to)).toBe("blocked");
});

test.each(["inline", "wiki-alias-closed", "destination-closed-tail"])("%s closing boundary does not exclude a later starter", name => {
	const fixture = read(name), state = stateFor(fixture), from = fixture.doc.lastIndexOf("@");
	expect(triggerSyntax(state, from, fixture.doc.length)).toBe("allowed");
});

test("an unfinished destination requires native label evidence, not literal text or generic link parts", () => {
	const doc = "[label]( @Bob", from = doc.indexOf("@");
	for (const nodes of [[], [{ name: "link", from: 6, to: 7 }], [{ name: "formatting_formatting-link_hmd-barelink_link", from: 6, to: 7 }]]) {
		expect(triggerSyntax(EditorState.create({ doc, extensions: replayLanguage(() => nodes) }), from, doc.length)).toBe("allowed");
	}
});

test("classified tokens end the narrowly unclassified unfinished-destination tail", () => {
	const doc = "[label]( *label* @Bob";
	const nodes = [...read("markdown-dest-open").nodes, { name: "em", from: 9, to: 16 }];
	const state = EditorState.create({ doc, extensions: replayLanguage(() => nodes) });
	expect(triggerSyntax(state, doc.indexOf("@"), doc.length)).toBe("allowed");
	// A candidate originating before the opener still crosses the protected gap.
	expect(triggerSyntax(state, 1, doc.length)).toBe("blocked");
});

test("unknown token names are exact parts, and generic strings/labels remain eligible", () => {
	for (const name of ["link", "string", "variable-code", "hmd-internal-link-extra", "unknown"]) {
		const state = EditorState.create({ doc: "@Bob", extensions: replayLanguage(() => [{ name, from: 0, to: 4 }]) });
		expect(triggerSyntax(state, 0, 4)).toBe("allowed");
	}
});

test("checks the starter as well as the query with positive-width half-open overlap", () => {
	const doc = "@Bob", state = EditorState.create({ doc, extensions: replayLanguage(() => [{ name: "inline-code", from: 0, to: 1 }]) });
	expect(triggerSyntax(state, 0, 4)).toBe("blocked");
	expect(triggerSyntax(state, 1, 4)).toBe("allowed");
	const zero = EditorState.create({ doc, extensions: replayLanguage(() => [{ name: "inline-code", from: 1, to: 1 }]) });
	expect(triggerSyntax(zero, 0, 4)).toBe("allowed");
});

test("the enclosing native fence line protects nested token names", () => {
	const state = EditorState.create({ doc: "@Bob", extensions: replayLanguage(() => [{ name: "HyperMD-codeblock", from: 0, to: 4, kind: "line" }, { name: "variableName", from: 0, to: 4 }]) });
	expect(triggerSyntax(state, 0, 4)).toBe("blocked");
});

test("missing syntax and invalid offsets are unavailable; complete empty prose is allowed", () => {
	const noLanguage = EditorState.create({ doc: "@Bob" });
	expect(triggerSyntax(noLanguage, 0, 4)).toBe("unavailable");
	const state = EditorState.create({ doc: "@Bob\n@Alice", extensions: replayLanguage() });
	for (const [from, to] of [[-1, 4], [0, 100], [0, 6], [0.5, 4], [1, 1]]) expect(triggerSyntax(state, from, to)).toBe("unavailable");
	expect(triggerSyntax(state, 0, 4)).toBe("allowed");
});

test("rejects invalid cursor positions without host clamping", () => {
	for (const cursor of [{ line: 0, ch: 100 }, { line: -1, ch: 4 }, { line: 0, ch: -1 }, { line: 0, ch: 1.5 }]) expect(triggerCandidate("@Bob", cursor)).toBeNull();
});

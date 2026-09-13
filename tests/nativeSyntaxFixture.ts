import { defineLanguageFacet, Language } from "@codemirror/language";
import { Input, NodeType, Parser, PartialParse, Tree } from "@lezer/common";

export interface NativeNode { name: string; from: number; to: number; kind?: string }
const top = NodeType.define({ id: 0, name: "Document", top: true });

/** Replay recorded native token boundaries in a real Lezer tree. This is not an Obsidian parser or scheduling fixture. */
export function nativeTree(doc: string, nodes: readonly NativeNode[] = []): Tree {
	const leaf = (node: NativeNode) => new Tree(NodeType.define({ id: 1, name: node.name }), [], [], node.to - node.from);
	const wrappers = nodes.filter(node => node.kind === "line");
	const tokens = nodes.filter(node => node.kind !== "line");
	const roots = tokens.filter(node => !wrappers.some(wrapper => wrapper.from <= node.from && wrapper.to >= node.to))
		.map(node => ({ from: node.from, tree: leaf(node) }));
	for (const wrapper of wrappers) {
		const children = tokens.filter(node => node.from >= wrapper.from && node.to <= wrapper.to);
		roots.push({ from: wrapper.from, tree: new Tree(NodeType.define({ id: 2, name: wrapper.name }), children.map(leaf), children.map(node => node.from - wrapper.from), wrapper.to - wrapper.from) });
	}
	roots.sort((a, b) => a.from - b.from);
	return new Tree(top, roots.map(node => node.tree), roots.map(node => node.from), doc.length);
}

/** Test-only synchronous replay; an empty complete tree deliberately models ordinary prose. */
export function replayLanguage(records: (doc: string) => readonly NativeNode[] = () => []) {
	class ReplayParser extends Parser {
		createParse(input: Input): PartialParse {
			const doc = input.read(0, input.length);
			return { parsedPos: input.length, stoppedAt: null, stopAt() {}, advance: () => nativeTree(doc, records(doc)) };
		}
	}
	return new Language(defineLanguageFacet(), new ReplayParser()).extension;
}

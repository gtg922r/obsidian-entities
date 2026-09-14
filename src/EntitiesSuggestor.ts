import { EditorState } from "@codemirror/state";
import { ViewUpdate } from "@codemirror/view";
import Entities from "./main";
import {
	EditorSuggest,
	EditorPosition,
	Editor,
	TFile,
	EditorSuggestContext,
	setIcon,
	prepareFuzzySearch,
	EditorSuggestTriggerInfo,
	Scope,
} from "obsidian";
import ProviderRegistry from "./Providers/ProviderRegistry";
import { EntityProvider, EntityProviderUserSettings, RefreshBehavior } from "./Providers/EntityProvider";
import { ActionCoordinator } from "./actionCoordinator";
import { EditorBindings, EditorBindingSnapshot } from "./editorBindings";
import { TriggerCharacter } from "./entities.types";
import { EntitySuggestionItem } from "./suggestion.types";
import { readSuggestionTarget, suggestionTargetKey } from "./suggestionTargets";

import { triggerCandidate, triggerSyntax } from "./triggerContext";

interface TriggerSession {
	readonly binding: EditorBindingSnapshot;
	readonly context: EditorSuggestContext;
	state: EditorState;
}

type Provider = EntityProvider<EntityProviderUserSettings>;
type ProviderStage = "policy" | "ordinary" | "creation" | "item" | "action";

interface SuggestionCacheEntry {
	provider: Provider;
	query: string | undefined;
	timestamp: number;
	registryRevision: number;
	dataRevision: number;
	items: EntitySuggestionItem[];
}

interface SuggestionProvenance {
	provider: Provider;
	registryRevision: number;
	epoch: number;
	context: EditorSuggestContext;
	sourcePath: string;
}

interface SuggestionCandidate {
	item: EntitySuggestionItem;
	provider: Provider;
	match: EntitySuggestionItem["match"];
}

/** Collects synchronous provider results and guards selection against runtime replacement. */
export class EntitiesSuggestor extends EditorSuggest<EntitySuggestionItem> {
	plugin: Entities;

	private providerRegistry: ProviderRegistry;

	private providerSuggestions = new Map<string, SuggestionCacheEntry>();
	private provenance = new WeakMap<EntitySuggestionItem, SuggestionProvenance>();
	private diagnostics = new WeakMap<Provider, Set<ProviderStage>>();
	private dataRevision = 0;
	private resultEpoch = 0;
	private disposed = false;
	private readonly actions: ActionCoordinator;
	private readonly removeRegistryListener: () => void;

	private liveTrigger?: TriggerSession;
	private dismissed?: TriggerSession;
	private displayedBinding?: EditorBindingSnapshot;
	private readonly removeBindingListener: () => void;

	private lastSuggestionCount = 0;

	constructor(plugin: Entities, registry: ProviderRegistry, private readonly bindings = new EditorBindings(plugin.app)) {
		super(plugin.app);
		this.plugin = plugin;
		this.actions = new ActionCoordinator(plugin.app, bindings);
		this.providerRegistry = registry;
		this.removeRegistryListener = registry.onChange(() => this.invalidateProviders());
		this.removeBindingListener = bindings.onChange(update => this.validateSessions(update));
		// Native Escape runs first in its own scope. A public child scope captures it
		// before native close clears context; every other key retains the native parent.
		this.scope = new Scope(this.scope);
		this.scope.register([], "Escape", event => {
			if (event.isComposing) return;
			const binding = this.liveTrigger?.binding ?? this.displayedBinding, context = this.context;
			if (!binding || !context || context.editor !== binding.binding.editor || context.file !== binding.binding.file ||
				!this.bindings.isSessionCurrent(binding)) {
				this.close();
				return;
			}
			// Eligibility may already be gone while the native menu awaits its delayed close.
			if (binding.binding.view.composing) return;
			this.dismissByEscape();
			this.close();
			return false;
		});
	}

	/** Use only the supplied live editor and the newest deliberate starter on its current line. */
	onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
		if (this.disposed) return null;
		const request = this.readTrigger(cursor, editor, file);
		if (!request || request.syntax === "blocked") {
			this.liveTrigger = this.dismissed = undefined;
			return null;
		}
		if (this.dismissed && (this.dismissed.context.editor !== editor || this.dismissed.context.file !== file ||
			!this.bindings.isSessionCurrent(this.dismissed.binding) || (request.session && !this.sameSession(this.dismissed, request.session)))) this.dismissed = undefined;
		this.liveTrigger = undefined;
		if (request.syntax === "unavailable" || !request.session || this.dismissed) return null;
		this.liveTrigger = request.session;
		const { start, end, query } = request.session.context;
		return { start, end, query };
	}

	private readTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null) {
		try {
			if (!file) return { syntax: "unavailable" as const };
			const binding = this.bindings.capture(editor, file);
			if (!binding) return { syntax: "unavailable" as const };
			const state = binding.binding.view.state;
			if (!Number.isInteger(cursor.line) || cursor.line < 0 || cursor.line >= state.doc.lines) return { syntax: "unavailable" as const };
			const line = state.doc.line(cursor.line + 1);
			if (!Number.isInteger(cursor.ch) || cursor.ch < 0 || cursor.ch > line.length || editor.getLine(cursor.line) !== line.text ||
				state.selection.main.head !== line.from + cursor.ch || !state.selection.main.empty) return { syntax: "unavailable" as const };
			const candidate = triggerCandidate(line.text, cursor);
			if (!candidate) return null;
			const from = { line: cursor.line, ch: candidate.start.ch - 1 };
			if (editor.posToOffset(from) !== line.from + from.ch || editor.posToOffset(cursor) !== line.from + cursor.ch) return { syntax: "unavailable" as const };
			const context = { ...candidate, editor, file };
			const syntax = triggerSyntax(state, line.from + from.ch, line.from + cursor.ch);
			if (binding.binding.view.state !== state || !this.bindings.isSessionCurrent(binding)) return { syntax: "unavailable" as const };
			return { syntax, session: { binding, context, state } };
		} catch { return { syntax: "unavailable" as const }; }
	}

	private sameSession(a: TriggerSession, b?: TriggerSession): boolean {
		return !!b && this.bindings.isSessionCurrent(a.binding) && a.binding.binding === b.binding.binding &&
			a.context.start.line === b.context.start.line && a.context.start.ch === b.context.start.ch &&
			a.context.query[0] === b.context.query[0];
	}

	private validateSessions(update?: ViewUpdate): void {
		const valid = (session: TriggerSession) => {
			if (!this.bindings.isSessionCurrent(session.binding)) return false;
			const view = session.binding.binding.view;
			if (!update || update.view !== view || session.state === update.state) return true;
			const { start } = session.context;
			if (start.line >= update.startState.doc.lines) return false;
			const mark = update.startState.doc.line(start.line + 1).from + start.ch - 1;
			let replaced = false;
			update.changes.iterChangedRanges((from, to) => { if (from <= mark && to >= mark) replaced = true; });
			if (replaced) return false;
			const selection = view.state.selection.main, line = view.state.doc.lineAt(selection.head);
			const candidate = triggerCandidate(line.text, { line: line.number - 1, ch: selection.head - line.from });
			session.state = update.state;
			return selection.empty && !!candidate && candidate.start.line === start.line && candidate.start.ch === start.ch &&
				candidate.query[0] === session.context.query[0] && triggerSyntax(view.state, line.from + start.ch - 1, selection.head) !== "blocked";
		};
		if (this.liveTrigger && !valid(this.liveTrigger)) this.liveTrigger = undefined;
		if (this.dismissed && !valid(this.dismissed)) this.dismissed = undefined;
	}

	private dismissByEscape(): void {
		const session = this.liveTrigger, context = this.context;
		if (!session || !context || !this.lastSuggestionCount || context.editor !== session.context.editor || context.file !== session.context.file ||
			context.query !== session.context.query || context.start.line !== session.context.start.line || context.start.ch !== session.context.start.ch ||
			context.end.line !== session.context.end.line || context.end.ch !== session.context.end.ch) return;
		// Rendered rows can lag typing until the native delayed request. Dismiss the
		// current continuation only if it still belongs to that same starter session.
		const state = session.binding.binding.view.state, head = state.selection.main.head;
		const line = state.doc.lineAt(head);
		const request = this.readTrigger({ line: line.number - 1, ch: head - line.from }, context.editor, context.file);
		if (request?.syntax === "allowed" && this.sameSession(session, request.session)) this.dismissed = request.session;
	}

	/** Refresh on the next request while keeping displayed results selectable. */
	invalidateData(): void {
		if (this.disposed) return;
		this.dataRevision++;
	}

	/** Configuration replacement closes old results and permits the same span to reopen. */
	private invalidateProviders(): void {
		this.providerSuggestions.clear();
		this.resultEpoch++;
		this.close();
		this.context = null;
		this.liveTrigger = this.dismissed = undefined;
		this.lastSuggestionCount = 0;
	}

	/** Close runtime state and release the registry subscription; safe to call repeatedly. */
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.actions.dispose();
		this.removeRegistryListener();
		this.removeBindingListener();
		this.invalidateProviders();
	}

	private reportFailure(provider: Provider, stage: ProviderStage, error: unknown): void {
		let stages = this.diagnostics.get(provider);
		if (!stages) {
			stages = new Set();
			this.diagnostics.set(provider, stages);
		}
		if (stages.has(stage)) return;
		stages.add(stage);
		console.error(`Entities: provider ${provider.providerInstanceId} ${stage} failed.`, error);
	}

	/** Reject unrenderable items individually, without normalizing provider metadata. */
	private readItems(value: unknown, provider: Provider): { items: EntitySuggestionItem[]; malformed: boolean } {
		if (!Array.isArray(value)) throw new Error("Expected a synchronous suggestion array.");
		const items: EntitySuggestionItem[] = [];
		let malformed = false;
		for (const item of value) {
			try {
				if (!item || typeof item !== "object") throw new Error("Invalid suggestion.");
				const copy = { ...item } as EntitySuggestionItem;
				if (typeof copy.suggestionText !== "string" || !copy.suggestionText.length ||
					[copy.icon, copy.flair, copy.noteText].some(field => field !== undefined && typeof field !== "string") ||
					("action" in copy || "replacementText" in copy)) {
					throw new Error("Invalid suggestion fields.");
				}
				copy.target = readSuggestionTarget(copy.target);
				if (copy.match !== undefined) {
					if (!Number.isFinite(copy.match?.score) || !Array.isArray(copy.match.matches)) throw new Error("Invalid suggestion match.");
					copy.match = { ...copy.match, matches: copy.match.matches.map(range => [...range]) };
				}
				items.push(copy);
			} catch (error) {
				malformed = true;
				this.reportFailure(provider, "item", error);
			}
		}
		return { items, malformed };
	}

	getSuggestions(context: EditorSuggestContext): EntitySuggestionItem[] {
		if (this.disposed) return [];
		const currentTime = performance.now();
		const registryRevision = this.providerRegistry.revision;
		const dataRevision = this.dataRevision;
		const epoch = ++this.resultEpoch;
		const capturedContext = { ...context, start: { ...context.start }, end: { ...context.end } };
		const sourcePath = context.file?.path;
		const trigger = (context.query.charAt(0) as TriggerCharacter) || TriggerCharacter.At;
		const searchQuery = context.query.slice(1);
		const fuzzyMatch = prepareFuzzySearch(searchQuery);
		const ordinary: SuggestionCandidate[] = [];
		const creation: SuggestionCandidate[] = [];
		const providers = this.providerRegistry.getProvidersForTrigger(trigger);

		for (const provider of providers) {
			const key = JSON.stringify([provider.providerInstanceId, trigger]);
			let policy: { behavior: RefreshBehavior; query: string | undefined } | undefined;
			try {
				policy = { behavior: provider.getRefreshBehavior(), query: provider.isQueryDependent ? searchQuery : undefined };
			} catch (error) {
				this.providerSuggestions.delete(key);
				this.reportFailure(provider, "policy", error);
			}
			if (policy) {
				try {
					let cached = this.providerSuggestions.get(key);
					if (!cached || cached.provider !== provider || cached.query !== policy.query ||
						cached.registryRevision !== registryRevision || cached.dataRevision !== dataRevision ||
						policy.behavior === RefreshBehavior.ShouldRefresh ||
						(policy.behavior !== RefreshBehavior.Never && currentTime - cached.timestamp > 200)) {
						// A failed refresh must never fall back to an older success, even under Never.
						this.providerSuggestions.delete(key);
						const { items, malformed } = this.readItems(provider.getEntityList(searchQuery, trigger), provider);
						cached = { provider, query: policy.query, timestamp: currentTime, registryRevision, dataRevision, items };
						if (!malformed) this.providerSuggestions.set(key, cached);
					}
					for (const item of cached.items) {
						const match = fuzzyMatch(item.suggestionText);
						if (match) ordinary.push({ item, provider, match });
					}
				} catch (error) {
					this.providerSuggestions.delete(key);
					this.reportFailure(provider, "ordinary", error);
				}
			}
			// Creation remains query-sensitive and independent of ordinary retrieval/policy failures.
			if (trigger === TriggerCharacter.At) {
				try {
					const { items } = this.readItems(provider.getTemplateCreationSuggestions(searchQuery), provider);
					for (const item of items) creation.push({ item, provider, match: item.match });
				} catch (error) {
					this.reportFailure(provider, "creation", error);
				}
			}
		}

		const uniqueSuggestions = new Map<string, SuggestionCandidate>();
		const fileIds = new Map<TFile, number>();
		const deduplicate = (result: SuggestionCandidate) => {
			const key = suggestionTargetKey(result.item.target, result.provider.providerInstanceId, fileIds);
			const previous = uniqueSuggestions.get(key);
			if (!previous || (result.match?.score ?? -10) > (previous.match?.score ?? -10)) {
				// Replacement keeps the key's first encounter position for stable score ties.
				uniqueSuggestions.set(key, result);
			}
		};
		// Keys observe live files after every provider call, with all ordinary rows first.
		for (const result of ordinary) deduplicate(result);
		for (const result of creation) deduplicate(result);
		const sortedSuggestions = Array.from(uniqueSuggestions.values()).sort(
			(a, b) => (b.match?.score ?? -10) - (a.match?.score ?? -10)
		);
		this.lastSuggestionCount = sortedSuggestions.length;
		const session = this.liveTrigger;
		this.displayedBinding = sortedSuggestions.length && session && context.editor === session.context.editor &&
			context.file === session.context.file ? session.binding : undefined;
		const limit = this.limit;
		const visible = Number.isSafeInteger(limit) && limit > 0 ? sortedSuggestions.slice(0, limit) : sortedSuggestions;
		return visible.map(({ item, provider, match }) => {
			const copy = { ...item, target: { ...item.target } };
			// Preserve creation rows' absent/explicit undefined match property.
			if (match) copy.match = match;
			this.provenance.set(copy, { provider, registryRevision, epoch, context: capturedContext, sourcePath });
			return copy;
		});
	}

	renderSuggestion(value: EntitySuggestionItem, el: HTMLElement): void {
		el.addClasses(["entities-suggestion", "mod-complex"]);
		const suggestionAux = el.createDiv({ cls: "suggestion-aux" });
		const suggestionFlair = suggestionAux.createDiv({
			cls: "suggestion-flair",
		});
		const suggestionContent = el.createDiv({ cls: "suggestion-content" });
		const suggestionTitle = suggestionContent.createDiv({
			cls: "suggestion-title",
		});
		const suggestionNote = suggestionContent.createDiv({
			cls: "suggestion-note",
		});

		if (value.icon) {
			setIcon(suggestionFlair, value.icon);
		} else if (value.flair) {
			suggestionFlair.setText(value.flair);
		}
		// suggestionTitle.setText(value.suggestionText + ` (${value.match?.score ?? -10})`);
		suggestionTitle.setText(value.suggestionText);
		const note = [value.noteText, value.target.kind === "file" ? value.target.file.path : undefined]
			.filter(Boolean).join(" · ");
		if (note) suggestionNote.setText(note);
	}

	private isCurrentProvider(source: SuggestionProvenance): boolean {
		return !this.disposed && source.registryRevision === this.providerRegistry.revision &&
			this.providerRegistry.getProviders().includes(source.provider);
	}

	selectSuggestion(value: EntitySuggestionItem, evt: MouseEvent | KeyboardEvent): void {
		if ("isComposing" in evt && evt.isComposing) return;
		const source = this.provenance.get(value);
		if (!source || source.epoch !== this.resultEpoch || !this.isCurrentProvider(source)) return;
		// Native close-before-select is valid. Only entry uses the result epoch;
		// a fresh retrieval or menu close does not cancel already-started work.
		this.actions.select(source.context, source.sourcePath, value.target, () => this.isCurrentProvider(source), () => {
			this.resultEpoch++;
			this.close();
		});
	}

	close(): void {
		this.liveTrigger = undefined;
		this.displayedBinding = undefined;
		this.lastSuggestionCount = 0;
		super.close();
	}
}

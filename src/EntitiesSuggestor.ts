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
} from "obsidian";
import ProviderRegistry from "./Providers/ProviderRegistry";
import { EntityProvider, EntityProviderUserSettings, RefreshBehavior } from "./Providers/EntityProvider";
import { ActionCoordinator } from "./actionCoordinator";
import { EditorBindings } from "./editorBindings";
import { TriggerCharacter } from "./entities.types";
import { EntitySuggestionItem } from "./suggestion.types";
import { readSuggestionTarget, suggestionTargetKey } from "./suggestionTargets";

// Pre-compiled whitespace matcher to avoid recreating a RegExp per character
const WHITESPACE_RE = /\s/;

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

	// Track the last dismissed query
	private lastDismissedQuery: EditorPosition | null = null;

	private lastSuggestionCount = 0;

	//empty constructor
	constructor(plugin: Entities, registry: ProviderRegistry, bindings = new EditorBindings(plugin.app)) {
		super(plugin.app);
		this.plugin = plugin;
		this.actions = new ActionCoordinator(plugin.app, bindings);
		this.providerRegistry = registry;
		this.removeRegistryListener = registry.onChange(() => this.invalidateProviders());
	}

	/**
	 * This function is triggered when the user starts typing in the editor. It checks...
	 * If these conditions are met, it returns an object with the start and end positions
	 * of the word and the word itself as the query. If not, it returns null.
	 *
	 * @param cursor - The current position of the cursor in the editor.
	 * @param editor - The current editor instance.
	 * @param file - The current file being edited.
	 * @returns An object with the start and end positions of the word and the word itself as the query, or null if the conditions are not met.
	 */
	onTrigger(
		cursor: EditorPosition,
		editor: Editor,
		file: TFile
	): EditorSuggestTriggerInfo | null {
		if (this.disposed) return null;
		const currentLine = cursor.line;
		const currentLineToCursor = editor.getLine(currentLine).slice(0, cursor.ch);

		// Returns true if any non-whitespace character exists after `idx` before the cursor,
		// or if `idx` is the last character (lone trigger at EOL allowed). This prevents
		// opening suggestions for spans like "@   " while still allowing "@" at EOL and
		// multi-word phrases like "@bob ho".
		// Defined inline for locality; recreated per keystroke but trivial cost.
		const hasNonWhitespaceAfter = (idx: number): boolean => {
			if (idx < 0) return false; // invalid index
			if (idx + 1 >= currentLineToCursor.length) return true; // trigger at EOL
			for (let i = idx + 1; i < currentLineToCursor.length; i++) {
				const ch = currentLineToCursor.charAt(i);
				if (!WHITESPACE_RE.test(ch)) return true; // early-exit on first non-space
			}
			return false; // only spaces remain
		};

		// Phrase-scoped '@': prefer any valid '@' anywhere before cursor
		const lastAt = currentLineToCursor.lastIndexOf("@");
		const atValid = lastAt >= 0 && hasNonWhitespaceAfter(lastAt);

		// Token start detection for ':' and '/'
		let tokenStart = currentLineToCursor.length - 1;
		while (tokenStart >= 0 && !/\s/.test(currentLineToCursor.charAt(tokenStart))) tokenStart--;
		tokenStart += 1;
		const tokenStartChar = currentLineToCursor.charAt(tokenStart) ?? "";
		const colonValid = tokenStartChar === ":" && hasNonWhitespaceAfter(tokenStart);

		// Slash trigger: find the last '/' within the current token so that
		// typing e.g. "word/command" still activates the suggestor.
		const tokenSlice = currentLineToCursor.slice(tokenStart);
		const lastSlashInToken = tokenSlice.lastIndexOf("/");
		const slashIndex = lastSlashInToken >= 0 ? tokenStart + lastSlashInToken : -1;
		const slashValid = slashIndex >= 0 && hasNonWhitespaceAfter(slashIndex);

		let triggerIndex = -1;
		let triggerChar: string | null = null;
		if (atValid) {
			triggerIndex = lastAt;
			triggerChar = "@";
		} else if (colonValid) {
			triggerIndex = tokenStart;
			triggerChar = ":";
		} else if (slashValid) {
			triggerIndex = slashIndex;
			triggerChar = "/";
		}

		if (triggerIndex === -1 || !triggerChar) {
			return null;
		}

		const start = triggerIndex + 1;
		const query = currentLineToCursor.slice(triggerIndex);

		// Respect last dismissed query span
		if (
			this.lastDismissedQuery &&
			this.lastDismissedQuery.line === cursor.line &&
			this.lastDismissedQuery.ch === start
		) {
			return null;
		}
		this.lastDismissedQuery = null;

		return {
			start: { line: currentLine, ch: start },
			query,
			end: cursor,
		};
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
		this.lastDismissedQuery = null;
		this.lastSuggestionCount = 0;
	}

	/** Close runtime state and release the registry subscription; safe to call repeatedly. */
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.actions.dispose();
		this.removeRegistryListener();
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
		const ordinary: EntitySuggestionItem[] = [];
		const creation: EntitySuggestionItem[] = [];
		const providers = this.providerRegistry.getProvidersForTrigger(trigger);
		const remember = (item: EntitySuggestionItem, provider: Provider): EntitySuggestionItem => {
			const copy = { ...item, target: { ...item.target } };
			this.provenance.set(copy, { provider, registryRevision, epoch, context: capturedContext, sourcePath });
			return copy;
		};

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
						if (match) ordinary.push(remember({ ...item, match }, provider));
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
					creation.push(...items.map(item => remember(item, provider)));
				} catch (error) {
					this.reportFailure(provider, "creation", error);
				}
			}
		}

		const uniqueSuggestions = new Map<string, EntitySuggestionItem>();
		const fileIds = new Map<TFile, number>();
		for (const result of [...ordinary, ...creation]) {
			const source = this.provenance.get(result)!;
			const key = suggestionTargetKey(result.target, source.provider.providerInstanceId, fileIds);
			const previous = uniqueSuggestions.get(key);
			if (!previous || (result.match?.score ?? -10) > (previous.match?.score ?? -10)) {
				// Keep the winning result and its existing R2 provenance, including source context.
				uniqueSuggestions.set(key, result);
			}
		}
		const sortedSuggestions = Array.from(uniqueSuggestions.values()).sort(
			(a, b) => (b.match?.score ?? -10) - (a.match?.score ?? -10)
		);
		this.lastSuggestionCount = sortedSuggestions.length;
		return sortedSuggestions;
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
		if (this.context && this.lastSuggestionCount > 0) {
			this.lastDismissedQuery = this.context.start;
		}
		super.close();
	}
}

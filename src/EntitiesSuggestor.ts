import Entities from "./main";
import {
	EditorSuggest,
	EditorPosition,
	Editor,
	TFile,
	EditorSuggestContext,
	setIcon,
	prepareFuzzySearch,
	SearchResult,
	EditorSuggestTriggerInfo,
} from "obsidian";
import ProviderRegistry from "./Providers/ProviderRegistry";
import { EntityProvider, EntityProviderUserSettings, RefreshBehavior } from "./Providers/EntityProvider";
import { TriggerCharacter } from "./entities.types";

// Pre-compiled whitespace matcher to avoid recreating a RegExp per character
const WHITESPACE_RE = /\s/;

/** A renderable suggestion with an optional insertion/action override. */
export interface EntitySuggestionItem {
	suggestionText: string;
	replacementText?: string;
	icon?: string;
	flair?: string;
	noteText?: string;
	match?: SearchResult;
	action?: (
		item: EntitySuggestionItem,
		context: EditorSuggestContext | null
	) => Promise<string> | string | void;
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
	private readonly removeRegistryListener: () => void;

	// Track the last dismissed query
	private lastDismissedQuery: EditorPosition | null = null;

	private lastSuggestionCount = 0;

	//empty constructor
	constructor(plugin: Entities, registry: ProviderRegistry) {
		super(plugin.app);
		this.plugin = plugin;
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
					[copy.replacementText, copy.icon, copy.flair, copy.noteText].some(field => field !== undefined && typeof field !== "string") ||
					(copy.action !== undefined && typeof copy.action !== "function")) {
					throw new Error("Invalid suggestion fields.");
				}
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
		const trigger = (context.query.charAt(0) as TriggerCharacter) || TriggerCharacter.At;
		const searchQuery = context.query.slice(1);
		const fuzzyMatch = prepareFuzzySearch(searchQuery);
		const ordinary: EntitySuggestionItem[] = [];
		const creation: EntitySuggestionItem[] = [];
		const providers = this.providerRegistry.getProvidersForTrigger(trigger);
		const remember = (item: EntitySuggestionItem, provider: Provider): EntitySuggestionItem => {
			const copy = { ...item };
			this.provenance.set(copy, { provider, registryRevision, epoch, context });
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
		for (const result of [...ordinary, ...creation]) {
			if (!uniqueSuggestions.has(result.suggestionText)) uniqueSuggestions.set(result.suggestionText, result);
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
		if (value.noteText) {
			suggestionNote.setText(value.noteText);
		}
	}

	private isCurrentProvider(source: SuggestionProvenance): boolean {
		return !this.disposed && source.registryRevision === this.providerRegistry.revision &&
			this.providerRegistry.getProviders().includes(source.provider);
	}

	selectSuggestion(value: EntitySuggestionItem, evt: MouseEvent | KeyboardEvent): void {
		const source = this.provenance.get(value);
		if (!source || source.epoch !== this.resultEpoch || !this.isCurrentProvider(source)) return;
		// Obsidian may close before selection. Provenance retains this result's context.
		const originalContext = source.context;
		if (value.action) {
			try {
				const actionResult = value.action(value, originalContext);
				Promise.resolve(actionResult).then((result) => {
					// This only guards configuration/unload, not action side effects or editor/range safety (R4).
					if (result != undefined && this.isCurrentProvider(source)) {
						this.replaceTextAtContext(result, originalContext);
					}
				}).catch(error => this.reportFailure(source.provider, "action", error));
			} catch (error) {
				this.reportFailure(source.provider, "action", error);
			}
		} else {
			this.replaceTextAtContext(`[[${value.replacementText ?? value.suggestionText}]]`, originalContext);
		}
	}

	private replaceTextAtContext(
		text: string,
		context: EditorSuggestContext
	): void {
		// console.log("Inserting text:", text);
		// console.log("Inserting using Context:", context);

		const editor = context.editor;
		const start = {
			...context.start,
			ch: Math.max(context.start.ch - 1, 0), // Ensure ch is not negative
		};
		const end = context.end;

               const startOffset = editor.posToOffset(start);
               editor.replaceRange(text, start, end);
               const newCursor = editor.offsetToPos(startOffset + text.length);

               editor.setCursor(newCursor);
               this.close();
	}

	async close(): Promise<void> {
		if (this.context && this.lastSuggestionCount > 0) {
			this.lastDismissedQuery = this.context.start;
		}
		super.close();
	}
}

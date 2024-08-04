import Entities from "./main";
import {
	EditorSuggest,
	EditorPosition,
	Editor,
	TFile,
	EditorSuggestContext,
	setIcon,
	fuzzySearch,
	prepareQuery,
	SearchResult,
	EditorSuggestTriggerInfo,
} from "obsidian";
import ProviderRegistry from "./Providers/ProviderRegistry";
import { RefreshBehavior } from "./Providers/EntityProvider";
import { TriggerCharacter } from "./entities.types";

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

export class EntitiesSuggestor extends EditorSuggest<EntitySuggestionItem> {
	plugin: Entities;

	private providerRegistry: ProviderRegistry;

	/**
	 * Time of last suggestion list update
	 * @type {number | undefined}
	 * @private */
	private lastSuggestionListUpdate: number | undefined = undefined;

	/**
	 * List of possible suggestions based on current code block
	 * @type {EntitySuggestionItem[]}
	 * @private */
	private localSuggestionCache: EntitySuggestionItem[] = [];

	// Track the last dismissed query
	private lastDismissedQuery: EditorPosition | null = null;

	//empty constructor
	constructor(plugin: Entities, registry: ProviderRegistry) {
		super(plugin.app);
		this.plugin = plugin;
		this.providerRegistry = registry;
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
		const currentLine = cursor.line;
		const currentLineToCursor = editor
			.getLine(currentLine)
			.slice(0, cursor.ch);

		// Match the last occurrence of the trigger character
		const match = currentLineToCursor.match(/(.*)([@:/])($|(?:[^\s].*?$))/);

		if (match && match.index !== undefined) {
			const start = match.index + match[1].length + 1; // Correctly adjust start to include trigger character
			const query = match[2] + match[3]; // The trigger and the captured query part after the trigger

			// Check if the query starts with the last dismissed query
			if (
				this.lastDismissedQuery &&
				this.lastDismissedQuery.line === cursor.line &&
				this.lastDismissedQuery.ch === start
			) {
				return null;
			} else {
				this.lastDismissedQuery = null;
			}

			return {
				start: { line: currentLine, ch: start },
				query,
				end: cursor,
			};
		}

		return null;
	}

	private providerSuggestions: Map<string, EntitySuggestionItem[]> =
		new Map();
	private lastRefreshTime: Map<string, number> = new Map();

	getSuggestions(
		context: EditorSuggestContext
	): EntitySuggestionItem[] | Promise<EntitySuggestionItem[]> {
		const currentTime = performance.now();
		const refreshThreshold = 200; // milliseconds

		const allSuggestions: EntitySuggestionItem[] = [];
		const trigger =
			(context.query.charAt(0) as TriggerCharacter) ||
			TriggerCharacter.At; // Default to '@' if trigger is not specified
		const searchQuery = context.query.slice(1);

		this.providerRegistry
			.getProvidersForTrigger(trigger)
			.forEach((provider) => {
				const providerId = provider.constructor.name;
				const refreshBehavior = provider.getRefreshBehavior();
				const lastRefresh = this.lastRefreshTime.get(providerId) || 0;
				//TODO: Support multiple trigger types from a provider with suggestion cacheing
				let providerSuggestions: EntitySuggestionItem[];

				if (
					refreshBehavior === RefreshBehavior.ShouldRefresh ||
					(refreshBehavior === RefreshBehavior.Default &&
						currentTime - lastRefresh > refreshThreshold) ||
					!this.providerSuggestions.has(providerId)
				) {
					providerSuggestions = provider.getEntityList(
						searchQuery,
						trigger
					);
					this.providerSuggestions.set(
						providerId,
						providerSuggestions
					);
					this.lastRefreshTime.set(providerId, currentTime);
				} else if (
					refreshBehavior === RefreshBehavior.Never &&
					this.providerSuggestions.has(providerId)
				) {
					providerSuggestions =
						this.providerSuggestions.get(providerId) || [];
				} else {
					providerSuggestions = provider.getEntityList(
						searchQuery,
						trigger
					);
					this.providerSuggestions.set(
						providerId,
						providerSuggestions
					);
					this.lastRefreshTime.set(providerId, currentTime);
				}

				allSuggestions.push(...providerSuggestions);
			});

		// Prepare the search query for fuzzy search
		const preparedQuery = prepareQuery(searchQuery);

		// Perform fuzzy search on the cached suggestions
		const fuzzySearchResults: EntitySuggestionItem[] =
			allSuggestions.flatMap((suggestionItem) => {
				const match: SearchResult | null = fuzzySearch(
					preparedQuery,
					suggestionItem.suggestionText
				);
				return match ? [{ ...suggestionItem, match }] : [];
			});

		// Only fetch template suggestions if the trigger is '@'
		if (trigger === TriggerCharacter.At) {
			this.providerRegistry.getProviders().forEach((provider) => {
				const templateSuggestions =
					provider.getTemplateCreationSuggestions(searchQuery);
				fuzzySearchResults.push(...templateSuggestions);
			});
		}

		const uniqueSuggestions = new Map<string, EntitySuggestionItem>();
		fuzzySearchResults.forEach((result) => {
			if (!uniqueSuggestions.has(result.suggestionText)) {
				uniqueSuggestions.set(result.suggestionText, result);
			}
		});
		const sortedSuggestions = Array.from(uniqueSuggestions.values()).sort(
			(a, b) => (b.match?.score ?? -10) - (a.match?.score ?? -10)
		);

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

	selectSuggestion(
		value: EntitySuggestionItem,
		evt: MouseEvent | KeyboardEvent
	): void {
		// console.log("context entering select:", this.context);
		if (!this.context) {
			console.error("No context found for suggestion selection");
			return;
		}
		const originalContext = this.context;
		if (value.action) {
			const actionResult = value.action(value, originalContext);
			Promise.resolve(actionResult).then((result) => {
				// console.log("Action result:", result);
				// console.log("Action context:", this.context);
				if (result != undefined) {
					this.replaceTextAtContext(result, originalContext);
				}
			});
		} else {
			this.insertText(
				`[[${value.replacementText ?? value.suggestionText}]]`
			);
		}
	}

	private insertText(text: string): void {
		// console.log("Inserting text:", text);
		// console.log("Inserting using Context:", this.context);
		if (this.context) {
			this.replaceTextAtContext(text, this.context);
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

		editor.replaceRange(text, start, end);
		const newCursor = end;

		newCursor.ch = start.ch + text.length;

		editor.setCursor(newCursor);
		this.close();
	}

	async close(): Promise<void> {
		if (this.context) {
			const { start } = this.context;
			const suggestions = await this.getSuggestions(this.context);
			if (suggestions && suggestions.length > 0) {
				this.lastDismissedQuery = start;
			}
		}
		console.log("close");
		super.close();
	}
}

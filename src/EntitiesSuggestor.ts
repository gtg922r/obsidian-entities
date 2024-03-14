import Entities from "./main";
import {
	EditorSuggest,
	EditorPosition,
	Editor,
	TFile,
	EditorSuggestTriggerInfo,
	EditorSuggestContext,
	setIcon,
	Plugin,
	fuzzySearch, prepareQuery,
	SearchResult
} from "obsidian";

export interface EntitySuggestionItem {
	suggestionText: string;
	replacementText?: string;
	icon?: string;
	noteText?: string;
	match?: SearchResult;
}
export class EntityProvider {
	plugin: Plugin;

	constructor(
		plugin: Plugin,
		getEntityList: (query: string) => EntitySuggestionItem[]
	) {
		this.plugin = plugin;
		this.getEntityList = getEntityList;
	}

	public getEntityList: (query: string) => EntitySuggestionItem[];
}

export class EntitiesSuggestor extends EditorSuggest<EntitySuggestionItem> {
	plugin: Entities;
	entityProviders: EntityProvider[] = [];

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

	//empty constructor
	constructor(plugin: Entities, entityProviders: EntityProvider[] = []) {
		super(plugin.app);
		this.plugin = plugin;
		this.entityProviders = entityProviders;
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

		const match = currentLineToCursor.match(/(^|[\W])@(.*)$/);

		if (match && match.index !== undefined) {
			const start = match.index + match[1].length + 1; // Correctly adjust start to include '@' directly
			const query = match[2]; // The captured query part after '@'

			return {
				start: { line: currentLine, ch: start },
				query,
				end: cursor,
			};
		}

		return null;
	}

	getSuggestions(
		context: EditorSuggestContext
	): EntitySuggestionItem[] | Promise<EntitySuggestionItem[]> {
		if (
			this.lastSuggestionListUpdate == undefined ||
			performance.now() - this.lastSuggestionListUpdate > 200
		) {
			this.localSuggestionCache = this.entityProviders.flatMap(
				(provider) => provider.getEntityList(context.query)
			);
			this.lastSuggestionListUpdate = performance.now();
		}
    // Prepare the search query for fuzzy search
		const preparedQuery = prepareQuery(context.query);

		// Perform fuzzy search on the cached suggestions
		const fuzzySearchResults = this.localSuggestionCache.flatMap(suggestionItem => {
			const match: SearchResult | null = fuzzySearch(
				preparedQuery,
				suggestionItem.suggestionText
			);
			return match ? [{...suggestionItem, match }] : [];
		});

		fuzzySearchResults.sort((a, b) => b.match.score - a.match.score);
		return fuzzySearchResults.map(result => result);
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
		}
		suggestionTitle.setText(value.suggestionText + ` (${value.match?.score ?? -10})`);
		if (value.noteText) {
			suggestionNote.setText(value.noteText);
		}
	}

	selectSuggestion(
		value: EntitySuggestionItem,
		evt: MouseEvent | KeyboardEvent
	): void {
		if (this.context) {
			const editor = this.context.editor;
			const suggestionLink = `[[${
				value.replacementText ?? value.suggestionText
			}]]`;
			const start = {
				...this.context.start,
				ch: this.context.start.ch - 1,
			};
			const end = editor.getCursor();

			editor.replaceRange(suggestionLink, start, end);
			const newCursor = end;

			newCursor.ch = start.ch + suggestionLink.length;

			editor.setCursor(newCursor);
			this.close();
		}
	}
}

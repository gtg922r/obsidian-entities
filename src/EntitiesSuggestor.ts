import Entities from "./main";
import {
	EditorSuggest,
	EditorPosition,
	Editor,
	TFile,
	EditorSuggestTriggerInfo,
	EditorSuggestContext,
	setIcon,
	fuzzySearch,
	prepareQuery,
	SearchResult,
} from "obsidian";
import { EntityProvider } from "./Providers/EntityProvider";

export interface EntitySuggestionItem {
	suggestionText: string;
	replacementText?: string;
	icon?: string;
	noteText?: string;
	match?: SearchResult;
	action?: (
		item: EntitySuggestionItem,
		context: EditorSuggestContext | null
	) => Promise<string> | string | void;
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

		console.log(`Entities: 🔄 Loading entity providers...`);
		entityProviders.forEach((provider) => {
			console.log(
				`Entities: \t${provider.description ?? "unspecified"} added...`
			);
			this.addEntityProvider(provider);
		});
		
	}

	clearEntityProviders(): void {
		this.entityProviders = [];
	}

	addEntityProvider(entityProvider: EntityProvider): void {
		console.log(
			`Entities: \t${
				entityProvider.description ?? "unspecified"
			} added...`
		);
		this.entityProviders.push(entityProvider);
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
		const fuzzySearchResults: EntitySuggestionItem[] =
			this.localSuggestionCache.flatMap((suggestionItem) => {
				const match: SearchResult | null = fuzzySearch(
					preparedQuery,
					suggestionItem.suggestionText
				);
				return match ? [{ ...suggestionItem, match }] : [];
			});

		this.entityProviders.forEach((provider) => {
			const templateSuggestions = provider.getTemplateCreationSuggestions(
				context.query
			);
			fuzzySearchResults.push(...templateSuggestions);
		});

		fuzzySearchResults.sort(
			(a, b) => (b.match?.score ?? -10) - (a.match?.score ?? -10)
		);
		return fuzzySearchResults.map((result) => result);
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
		console.log("context entering select:", this.context);
		if (!this.context) {
			console.error("No context found for suggestion selection");
			return;
		}
		const originalContext = this.context;
		if (value.action) {
			const actionResult = value.action(value, originalContext);
			Promise.resolve(actionResult).then((result) => {
				console.log("Action result:", result);
				console.log("Action context:", this.context);
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
		console.log("Inserting text:", text);
		console.log("Inserting using Context:", this.context);
		if (this.context) {
			this.replaceTextAtContext(text, this.context);
		}
	}

	private replaceTextAtContext(
		text: string,
		context: EditorSuggestContext
	): void {
		console.log("Inserting text:", text);
		console.log("Inserting using Context:", context);

		const editor = context.editor;
		const start = {
			...context.start,
			ch: context.start.ch - 1,
		};
		// const end = editor.getCursor();
		const end = context.end;

		editor.replaceRange(text, start, end);
		const newCursor = end;

		newCursor.ch = start.ch + text.length;

		editor.setCursor(newCursor);
		this.close();
	}
}

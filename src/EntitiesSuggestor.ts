import Entities from "./main";
import {
	EditorSuggest,
	EditorPosition,
	Editor,
	TFile,
	EditorSuggestTriggerInfo,
	EditorSuggestContext,
	setIcon,
} from "obsidian";

export interface EntitySuggestionItem {
	suggestionText: string;
	icon?: string;
	noteText?: string;
}
export class EntityProvider {
	constructor(getEntityList: (query: string) => EntitySuggestionItem[]) {
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
	 * If these conditions are met, it returns an object with the start and end positions of the word and the word itself as the query.
	 * If not, it returns null.
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
		console.log("onTrigger");
		const currentLine = cursor.line;
		const currentLineToCursor = editor
			.getLine(currentLine)
			.slice(0, cursor.ch);

		const match = currentLineToCursor.match(/(?:^|[\W])(@)(\S*)$/);

		if (match && match.index !== undefined) {
			const start = match.index + match[0].indexOf("@") + 1; // Adjust start to exclude '@' and any leading space
			const query = match[2]; // The captured query part after '@'
			const end = start + query.length; // Calculate end based on start and query length

			return {
				start: { line: currentLine, ch: start },
				query,
				end: { line: currentLine, ch: end },
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
		const suggestions = this.localSuggestionCache.filter((suggestionItem) =>
			suggestionItem.suggestionText
				.toLowerCase()
				.includes(context.query?.toLowerCase() ?? "")
		);

		return suggestions;
	}

	renderSuggestion(value: EntitySuggestionItem, el: HTMLElement): void {
		console.log("renderSuggestion");
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
		suggestionTitle.setText(value.suggestionText);
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
			const suggestionLink = `[[${value.suggestionText}]]`;
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

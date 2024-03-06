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

export class EntitiesSuggestor extends EditorSuggest<string> {
	plugin: Entities;

	/**
	 * Time of last suggestion list update
	 * @type {number | undefined}
	 * @private */
	private lastSuggestionListUpdate: number | undefined = undefined;

	/**
	 * List of possible suggestions based on current code block
	 * @type {string[]}
	 * @private */
	private localSuggestionCache: string[] = [];

	public getEntityList(): string[] {
		// return list of entities
		// const allFiles = this.plugin.app.vault.getFiles();
		// const folderName = "People";
		// const entities = allFiles.filter((file) => file.path.startsWith(folderName));

		const entityFolder = this.plugin.app.vault.getFolderByPath("People");
		const entities: TFile[] | undefined = entityFolder?.children.filter(
			(file) => file instanceof TFile
		) as TFile[] | undefined;

		return entities?.map((file) => `p|${file.basename}`) ?? [];
	}

	//empty constructor
	constructor(plugin: Entities) {
		super(plugin.app);
		this.plugin = plugin;
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
	): string[] | Promise<string[]> {
		if (this.lastSuggestionListUpdate == undefined || performance.now() - this.lastSuggestionListUpdate > 200) {
			this.localSuggestionCache = this.getEntityList();
			this.lastSuggestionListUpdate = performance.now();
		}
		const suggestions = this.localSuggestionCache.filter((suggestion) =>
			suggestion.toLowerCase().includes(context.query?.toLowerCase() ?? "")
		);

		return suggestions;
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.addClasses(["entities-suggestion"]);
		const suggestionContent = el.createDiv({ cls: "suggestion-content" });
		const suggestionTitle = suggestionContent.createDiv({
			cls: "suggestion-title",
		});
		const suggestionNote = suggestionContent.createDiv({
			cls: "suggestion-note",
		});
		const suggestionAux = el.createDiv({ cls: "suggestion-aux" });
		const suggestionFlair = suggestionAux.createDiv({
			cls: "suggestion-flair",
		});

		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const [iconType, suggestionText, noteText] = value.split("|");

		if (iconType === "p") {
			setIcon(suggestionFlair, "user");
		}
		suggestionTitle.setText(suggestionText);
		if (noteText) {
			suggestionNote.setText(noteText);
		}
	}

	/**
	 * Called when a suggestion is selected. Replaces the current word with the selected suggestion
	 * @param value The selected suggestion
	 * @param evt The event that triggered the selection
	 * @returns void
	 */
	selectSuggestion(value: string, evt: MouseEvent | KeyboardEvent): void {
		if (this.context) {
			const editor = this.context.editor;
			const [suggestionType, suggestion] = value.split("|");
			const start = this.context.start;
			const end = editor.getCursor(); // get new end position in case cursor has moved

			editor.replaceRange(suggestion, start, end);
			const newCursor = end;

			newCursor.ch = start.ch + suggestion.length;

			editor.setCursor(newCursor);
			this.close();
		}
	}
}

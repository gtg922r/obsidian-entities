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
	 * @type {number}
	 * @private */
	private lastSuggestionListUpdate = 0;

	/**
	 * List of possible suggestions based on current code block
	 * @type {string[]}
	 * @private */
	private localSuggestionCache: string[] = [];

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
	onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestTriggerInfo | null {
		// Get line to cursor and look for entities key character (e.g. @) and at least one character after it
		const currentLineToCursor = editor.getLine(cursor.line).slice(0, cursor.ch);
		const indexOfSearchStart = currentLineToCursor.search(/@.+/) + 1;
		// if there is no word, return null
		if (indexOfSearchStart === -1) {
			return null;
		}

		return {
			start: {line: cursor.line, ch: indexOfSearchStart},
			end: cursor,
			query: currentLineToCursor.slice(indexOfSearchStart)
		};
	}

	getSuggestions(context: EditorSuggestContext): string[] | Promise<string[]> {
		let localSymbols: string [] = [];	

		// check if the last suggestion list update was less than 200ms ago
		if (performance.now() - this.lastSuggestionListUpdate > 200) {
			// const currentFileToStart = context.editor.getRange({line: 0, ch: 0}, context.start);
			// localSymbols = ...
			// localSymbols = [...new Set(Array.from(matches, (match) => 'v|' + match[1]))];
			localSymbols = ['p|test1', 'p|test2', 'p|test3'];

			this.localSuggestionCache = localSymbols;
			this.lastSuggestionListUpdate = performance.now();
		} else {
			localSymbols = this.localSuggestionCache
		}

		let suggestions: string[] = [];
		// ...
		suggestions = localSymbols.filter((suggestion) => suggestion.toLowerCase().includes(context.query.split("|")[1].toLowerCase()));

		return suggestions;
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		
		// el.addClasses(['mod-complex', 'numerals-suggestion']);
		const suggestionContent = el.createDiv({cls: 'suggestion-content'});
		const suggestionTitle = suggestionContent.createDiv({cls: 'suggestion-title'});
		const suggestionNote = suggestionContent.createDiv({cls: 'suggestion-note'});
		const suggestionAux = el.createDiv({cls: 'suggestion-aux'});
		const suggestionFlair = suggestionAux.createDiv({cls: 'suggestion-flair'});

		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const [iconType, suggestionText, noteText] = value.split('|');

		if (iconType === 'p') {
			setIcon(suggestionFlair, 'user');		
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
			const [suggestionType, suggestion] = value.split('|');
			const start = this.context.start;
			const end = editor.getCursor(); // get new end position in case cursor has moved
			
			editor.replaceRange(suggestion, start, end);
			const newCursor = end;

			newCursor.ch = start.ch + suggestion.length;

			editor.setCursor(newCursor);			
			this.close()
		}
	}
}

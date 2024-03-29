import { EntityProvider, EntitySuggestionItem } from "src/EntitiesSuggestor";
import { Plugin, FuzzySuggestModal, App, TFile, TFolder } from "obsidian";
import { EntitiesModalInput } from "src/userComponents";
import {
	createNewNoteFromTemplate,
	insertTemplateUsingTemplater,
} from "src/entititiesUtilities";
import { TemplateProviderSettings } from "src/entities.types";

export class FuzzySearchModal extends FuzzySuggestModal<string> {
	items: string[]; // List of items to search from

	constructor(app: App, items: string[]) {
		super(app);
		this.items = items;
	}

	getItems(): string[] {
		return this.items;
	}

	getItemText(item: string): string {
		return item;
	}

	onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
		// Handle the selection of an item
		console.log(`Selected item: ${item}`);
	}
}

export function createNoteFromTemplateEntityProvider(
	plugin: Plugin,
	settings: TemplateProviderSettings
): EntityProvider {

	const templateFolders = Array.isArray(settings.path)
		? settings.path
		: [settings.path];

	const folders: TFolder[] = templateFolders
		.map((folder) => plugin.app.vault.getFolderByPath(folder))
		.filter((folder) => folder !== null) as TFolder[];
	const files: TFile[] = folders.flatMap(
		(folder) =>
			folder.children.filter(
				(file: unknown) => file instanceof TFile
			) as TFile[]
	);
	const actionFunction: (file: TFile) => Promise<string> = (file: TFile) => {
		console.log(`Selected file: ${file.basename}`);
		const FOLDER_SETTING = "";
		const OPEN_NEW_NOTE = false;
		const modal = new EntitiesModalInput(plugin.app, {
			placeholder: "Enter new note name...",
			instructions: {
				insertString: "to create a new note",
				dismissString: "to dismiss",
			},
		});
		modal.open();
		return modal.getInput().then((NEW_TEMPLATE_NAME) => {
			// Call the function to create a new note from the template
			createNewNoteFromTemplate(
				plugin,
				file,
				FOLDER_SETTING,
				NEW_TEMPLATE_NAME,
				OPEN_NEW_NOTE
			);
			// Immediately return the link assuming the operation is successful
			return `[[${NEW_TEMPLATE_NAME}]]`;
		});
	};

	const entities: EntitySuggestionItem[] = files.map((file) => ({
		suggestionText: file.basename,
		icon: "file-plus",
		action: () => actionFunction(file),
	}));

	return new EntityProvider({
		plugin,
		getEntityList: () => entities,
		description: `📄 New File From Template Entity Provider (${settings.path})`,
	});
}

export function createInsertTemplateEntityProvider(
	plugin: Plugin,
	settings: TemplateProviderSettings
): EntityProvider {
	const templateFolders = Array.isArray(settings.path)
		? settings.path
		: [settings.path];

	const folders: TFolder[] = templateFolders
		.map((folder) => plugin.app.vault.getFolderByPath(folder))
		.filter((folder) => folder !== null) as TFolder[];
	const files: TFile[] = folders.flatMap(
		(folder) =>
			folder.children.filter(
				(file: unknown) => file instanceof TFile
			) as TFile[]
	);
	const actionFunction: (file: TFile) => Promise<string> = (file: TFile) => {
		console.log(`Selected file: ${file.basename}`);
		return insertTemplateUsingTemplater(plugin, file).then(() => "");
	};

	const entities: EntitySuggestionItem[] = files.map((file) => ({
		suggestionText: file.basename,
		icon: "stamp",
		action: () => actionFunction(file),
	}));

	return new EntityProvider({
		plugin,
		getEntityList: () => entities,
		description: `📝 Insert Template Entity Provider (${settings.path})`,
	});
}

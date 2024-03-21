import { EntityProvider, EntitySuggestionItem } from "src/EntitiesSuggestor";
import { Plugin, FuzzySuggestModal, App, TFile, TFolder } from "obsidian";
import { AppWithPlugins } from "src/entities.types";
import { EntitiesModalInput } from "src/userComponents";

interface TemplaterPlugin {
	templater?: {
		create_new_note_from_template?: (
			file: TFile,
			folderSetting: string,
			newTemplateName: string,
			openNewNote: boolean
		) => void;
		append_template_to_active_file?: (
			template_file: TFile
		) => Promise<void>;
	};
}

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
	templateFolder: string | string[]
): EntityProvider {
	const templateFolders = Array.isArray(templateFolder)
		? templateFolder
		: [templateFolder];

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
		const templaterPlugin = (
			plugin.app as AppWithPlugins
		).plugins?.getPlugin("templater-obsidian") as TemplaterPlugin;
		if (
			!templaterPlugin ||
			!templaterPlugin.templater?.create_new_note_from_template
		) {
			console.error("Templater plugin not found!");
			return Promise.reject("Templater plugin not found!");
		}

		const FOLDER_SETTING = "folder";
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
			if (templaterPlugin.templater?.create_new_note_from_template) {
				templaterPlugin.templater.create_new_note_from_template(
					file,
					FOLDER_SETTING,
					NEW_TEMPLATE_NAME,
					OPEN_NEW_NOTE
				);
			}
			return `[[${NEW_TEMPLATE_NAME}]]`;
		});
	};

	const entities: EntitySuggestionItem[] = files.map((file) => ({
		suggestionText: file.basename,
		icon: "file-plus",
		action: () => actionFunction(file),
	}));

	console.log(
		`Entities: 📄 Template Entity Provider (${templateFolder}) added...`
	);
	return new EntityProvider(plugin, () => entities);
}

export function createInsertTemplateEntityProvider(
	plugin: Plugin,
	templateFolder: string | string[]
): EntityProvider {
	const templateFolders = Array.isArray(templateFolder)
		? templateFolder
		: [templateFolder];

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
		const templaterPlugin = (
			plugin.app as AppWithPlugins
		).plugins?.getPlugin("templater-obsidian") as TemplaterPlugin;
		if (
			!templaterPlugin ||
			!templaterPlugin.templater?.append_template_to_active_file
		) {
			console.error("Templater plugin not found!");
			return Promise.reject("Templater plugin not found!");
		}

		const promise =
			templaterPlugin.templater.append_template_to_active_file(file);
		return promise.then(() => "");
	};

	const entities: EntitySuggestionItem[] = files.map((file) => ({
		suggestionText: file.basename,
		icon: "stamp",
		action: () => actionFunction(file),
	}));

	console.log(
		`Entities: 📄 Template Entity Provider (${templateFolder}) added...`
	);
	return new EntityProvider(plugin, () => entities);
}

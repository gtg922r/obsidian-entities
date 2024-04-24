import { EntityProvider, EntitySuggestionItem } from "src/EntitiesSuggestor";
import { Plugin, TFile, TFolder } from "obsidian";
import { EntitiesModalInput } from "src/userComponents";
import {
	createNewNoteFromTemplate,
	insertTemplateUsingTemplater,
} from "src/entititiesUtilities";
import { TemplateProviderSettings } from "src/entities.types";

export class NoteFromTemplateEntityProvider extends EntityProvider {
    private files: TFile[];

    constructor(plugin: Plugin, settings: TemplateProviderSettings) {
        super({
            plugin,
            description: `📄 New File From Template Entity Provider (${settings.path})`,
        });
        this.files = this.getTemplateFiles(settings.path);
    }

    private getTemplateFiles(path: string | string[]): TFile[] {
        const templateFolders = Array.isArray(path) ? path : [path];
        const folders: TFolder[] = templateFolders
            .map((folder) => this.plugin.app.vault.getFolderByPath(folder))
            .filter((folder) => folder !== null) as TFolder[];
        return folders.flatMap(
            (folder) =>
                folder.children.filter(
                    (file: unknown) => file instanceof TFile
                ) as TFile[]
        );
    }

    getEntityList(): EntitySuggestionItem[] {
        return this.files.map((file) => ({
            suggestionText: file.basename,
            icon: "file-plus",
            action: () => this.actionFunction(file),
        }));
    }

    private actionFunction(file: TFile): Promise<string> {
        console.log(`Selected file: ${file.basename}`);
        const FOLDER_SETTING = "";
        const OPEN_NEW_NOTE = false;
        const modal = new EntitiesModalInput(this.plugin.app, {
            placeholder: "Enter new note name...",
            instructions: {
                insertString: "to create a new note",
                dismissString: "to dismiss",
            },
        });
        modal.open();
        return modal.getInput().then((NEW_TEMPLATE_NAME) => {
            createNewNoteFromTemplate(
                this.plugin,
                file,
                FOLDER_SETTING,
                NEW_TEMPLATE_NAME,
                OPEN_NEW_NOTE
            );
            return `[[${NEW_TEMPLATE_NAME}]]`;
        });
    }
}

export class InsertTemplateEntityProvider extends EntityProvider {
    private files: TFile[];

    constructor(plugin: Plugin, settings: TemplateProviderSettings) {
        super({
            plugin,
            description: `📝 Insert Template Entity Provider (${settings.path})`,
        });
        this.files = this.getTemplateFiles(settings.path);
    }

    private getTemplateFiles(path: string | string[]): TFile[] {
        const templateFolders = Array.isArray(path) ? path : [path];
        const folders: TFolder[] = templateFolders
            .map((folder) => this.plugin.app.vault.getFolderByPath(folder))
            .filter((folder) => folder !== null) as TFolder[];
        return folders.flatMap(
            (folder) =>
                folder.children.filter(
                    (file: unknown) => file instanceof TFile
                ) as TFile[]
        );
    }

    getEntityList(): EntitySuggestionItem[] {
        return this.files.map((file) => ({
            suggestionText: file.basename,
            icon: "stamp",
            action: () => this.actionFunction(file),
        }));
    }

    private actionFunction(file: TFile): Promise<string> {
        console.log(`Selected file: ${file.basename}`);
        return insertTemplateUsingTemplater(this.plugin, file).then(() => "");
    }
}

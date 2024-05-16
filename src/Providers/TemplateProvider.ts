import { EntitySuggestionItem } from "src/EntitiesSuggestor";
import { EntityProvider, EntityProviderUserSettings } from "./EntityProvider";
import { Plugin, TFile, TFolder } from "obsidian";
import { EntitiesModalInput } from "src/userComponents";
import {
	createNewNoteFromTemplate,
	insertTemplateUsingTemplater,
} from "src/entititiesUtilities";

const templateProviderTypeID = "template";

export interface TemplateProviderUserSettings extends EntityProviderUserSettings {
	providerTypeID: string;
	path: string | string[];
	actionType: "insert" | "create";
}

const defaultTemplateProviderUserSettings: TemplateProviderUserSettings = {
	providerTypeID: templateProviderTypeID,
	enabled: true,
	icon: "file-plus",
	path: "",
	entityCreationTemplates: [],
	actionType: "create",
};

export class TemplateEntityProvider extends EntityProvider<TemplateProviderUserSettings> {
	static readonly providerTypeID: string = templateProviderTypeID;
    private files: TFile[];

	static getDescription(settings: TemplateProviderUserSettings): string {
		return `📄 Template Entity Provider - ${settings.actionType} (${settings.path})`;
	}

	getDescription(): string {
		return TemplateEntityProvider.getDescription(this.settings);
	}
	getDefaultSettings(): TemplateProviderUserSettings {
		return defaultTemplateProviderUserSettings;
	}

    constructor(plugin: Plugin, settings: Partial<TemplateProviderUserSettings>) {
		super(plugin, settings);
        this.files = this.getTemplateFiles(this.settings.path);
    }

    private getTemplateFiles(path: string | string[]): TFile[] {
		// TODO - add support for multiple paths
		// TODO - add support for subfolders
		// TODO - add a recurring check for new files in the template folder (or callback)
        
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
            icon: this.settings.actionType === "create" ? "file-plus" : "stamp",
            action: () => this.actionFunction(file),
        }));
    }

	static buildSummarySetting(settings: TemplateProviderUserSettings, onShouldSave: (newSettings: TemplateProviderUserSettings) => void): void {
		console.log("TemplateEntityProvider.buildSummarySetting called");
	}

    private actionFunction(file: TFile): Promise<string> {
        if (this.settings.actionType === "create") {
            return this.createFileFromTemplate(file);
        } else {
            return this.insertTemplate(file);
        }
    }

    private createFileFromTemplate(file: TFile): Promise<string> {
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
                "", // Assuming FOLDER_SETTING is managed elsewhere or not needed
                NEW_TEMPLATE_NAME,
                false // Assuming OPEN_NEW_NOTE is managed elsewhere or not needed
            );
            return `[[${NEW_TEMPLATE_NAME}]]`;
        });
    }

    private insertTemplate(file: TFile): Promise<string> {
        return insertTemplateUsingTemplater(this.plugin, file).then(() => "");
    }
}


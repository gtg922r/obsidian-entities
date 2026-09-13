import { cloneSettings } from "../settingsData";
import { EntitySuggestionItem } from "src/suggestion.types";
import { EntityProvider, EntityProviderUserSettings } from "./EntityProvider";
import { EditorSuggestContext, Plugin, Setting, TFile, TFolder } from "obsidian";
import { insertTemplateUsingTemplater } from "src/entitiesUtilities";
import { createNewNoteFromTemplate, creationFailure, resolveDefaultCreationDestination } from "../entityCreation";
import { creationResultLink } from "../creationFeedback";
import { promptForCreationName } from "../creationPrompt";
import { buildIconPickerSetting, buildFolderPathSummarySetting } from "src/ui/providerSettingsComponents";
import { TriggerCharacter } from "src/entities.types";

const templateProviderTypeID = "template";

export interface TemplateProviderUserSettings extends EntityProviderUserSettings {
	providerTypeID: string;
	path: string;
	actionType: "insert" | "create";
	trigger: TriggerCharacter; // Add trigger to settings
}

const defaultTemplateProviderUserSettings: TemplateProviderUserSettings = {
	providerTypeID: templateProviderTypeID,
	enabled: true,
	icon: "file-plus",
	path: "",
	entityCreationTemplates: [],
	actionType: "create",
	trigger: TriggerCharacter.Slash, // Default to '/'
};

export class TemplateEntityProvider extends EntityProvider<TemplateProviderUserSettings> {
	get isQueryDependent(): boolean {
		return false;
	}

	static readonly providerTypeID: string = templateProviderTypeID;

	static getDescription(settings?: TemplateProviderUserSettings): string {
		if (settings) {
			return `📄 Template entity provider - ${settings.actionType} (${settings.path})`;
		} else {
			return `Template entity provider`;
		}
	}

	getDescription(): string {
		return TemplateEntityProvider.getDescription(this.settings);
	}
	static getDefaultSettings(): TemplateProviderUserSettings {
		return cloneSettings(defaultTemplateProviderUserSettings);
	}

	getDefaultSettings(): TemplateProviderUserSettings {
		return TemplateEntityProvider.getDefaultSettings();
	}

    private getTemplateFiles(path: string | string[]): TFile[] {
		// TODO - add support for multiple paths
		// TODO - add support for subfolders
        
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

	get triggers(): TriggerCharacter[] {
		return [this.settings.trigger]; // Use the trigger from settings
	}

    getEntityList(): EntitySuggestionItem[] {
        return this.getTemplateFiles(this.settings.path).map((file) => ({
            suggestionText: file.basename,
            icon: this.settings.actionType === "create" ? "file-plus" : "stamp",
            noteText: `${this.settings.actionType === "create" ? "Create from" : "Insert"} ${file.path}`,
            target: { kind: "action", id: JSON.stringify([this.settings.actionType, file.path]), callback: (_item, context) => this.actionFunction(file, context) },
        }));
    }

	static buildSummarySetting(
		settingContainer: Setting,
		settings: TemplateProviderUserSettings,
		onShouldSave: (newSettings: TemplateProviderUserSettings) => void,
		plugin: Plugin
	): void {
		buildFolderPathSummarySetting(settingContainer, settings, onShouldSave, plugin);
	}

	static buildSimpleSettings(
		settingContainer: HTMLElement,
		settings: TemplateProviderUserSettings,
		onShouldSave: (newSettings: TemplateProviderUserSettings) => void,
		plugin: Plugin
	): void {

		buildIconPickerSetting(settingContainer, "Icon", settings, "box-select", () => onShouldSave(settings), plugin.app);
			
		new Setting(settingContainer)
			.setName("Action type")
			.setDesc("Action to perform with the templates")
			.addDropdown((dropdown) => {
				dropdown.addOption("create", "Create a new note from template")
				dropdown.addOption("insert", "Insert the template into the current note")
				dropdown.onChange((value) => {
					settings.actionType = value as "create" | "insert";
					onShouldSave(settings);
				});
				dropdown.setValue(settings.actionType);
			});

		new Setting(settingContainer)
			.setName("Trigger character")
			.setDesc("Character to trigger the template suggestions")
			.addDropdown((dropdown) => {
				Object.values(TriggerCharacter).forEach((trigger) => {
					dropdown.addOption(trigger, trigger);
				});
				dropdown.onChange((value) => {
					settings.trigger = value as TriggerCharacter;
					onShouldSave(settings);
				});
				dropdown.setValue(settings.trigger);
			});

		const folderPathSetting = new Setting(settingContainer)
			.setName("Folder path")
			.setDesc("The path of the folder where templates are located");
		this.buildSummarySetting(
			folderPathSetting,
			settings,
			onShouldSave,
			plugin
		);			
	}

	private actionFunction(file: TFile, context: EditorSuggestContext | null): Promise<string | undefined> {
		return this.settings.actionType === "create" ? this.createFileFromTemplate(file, context) : this.insertTemplate(file);
	}

	private async createFileFromTemplate(file: TFile, context: EditorSuggestContext | null): Promise<string | undefined> {
		const sourcePath = context?.file?.path ?? "";
		try {
			// The host's default destination policy depends on the actual output extension.
			const destination = resolveDefaultCreationDestination(this.plugin.app, sourcePath, file.extension ? file.name : `${file.name}.md`);
			const prompt = await promptForCreationName(this, {
				placeholder: "Enter new note name...",
				instructions: { insertString: "to create a new note", dismissString: "to dismiss" },
			});
			const result = prompt.name === undefined || !prompt.isCurrent() ? { status: "cancelled" as const } : await createNewNoteFromTemplate(this.plugin.app, {
				engine: "templater", template: file, destination, name: prompt.name,
			});
			return creationResultLink(this.plugin.app, result, sourcePath);
		} catch (error) {
			return creationResultLink(this.plugin.app, creationFailure(error), sourcePath);
		}
	}

    private insertTemplate(file: TFile): Promise<string> {
        return insertTemplateUsingTemplater(this.plugin, file).then(() => "");
    }
}

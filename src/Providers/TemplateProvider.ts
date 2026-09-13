import { cloneSettings } from "../settingsData";
import { ActionContext, ActionResult, EntitySuggestionItem } from "src/suggestion.types";
import { EntityProvider, EntityProviderUserSettings } from "./EntityProvider";
import { Plugin, Setting, TFile, TFolder } from "obsidian";
import { createNewNoteFromTemplate, creationFailure, resolveDefaultCreationDestination } from "../entityCreation";
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
			return `📄 Template entity provider - ${settings.actionType === "insert" ? "Insertion unavailable in Entities" : "create"} (${settings.path})`;
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
            noteText: `${this.settings.actionType === "create" ? "Create from" : "Insertion unavailable in Entities:"} ${file.path}`,
            target: { kind: "action", id: JSON.stringify([this.settings.actionType, file.path]), callback: context => this.settings.actionType === "create" ? this.createFileFromTemplate(file, context) : ({
				status: "unavailable", message: `Insertion unavailable in Entities. Dismiss autocomplete, remove the trigger text, then run “Templater: Open insert template modal” and choose ${file.path}, or use your existing template hotkey.`,
			}) },
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
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- Product names and the exact native command title.
			.setDesc("Template insertion is temporarily unavailable in Entities. Use Templater: Open insert template modal or your existing template hotkey manually. Note creation remains available.")
			.addDropdown((dropdown) => {
				dropdown.addOption("create", "Create a new note from template")
				// eslint-disable-next-line obsidianmd/ui/sentence-case -- Entities is the plugin name.
				dropdown.addOption("insert", "Insertion unavailable in Entities")
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

	private async createFileFromTemplate(file: TFile, context: ActionContext): Promise<ActionResult> {
		try {
			if (!context.canStartWork()) return { status: "cancelled" };
			// Capture the default destination using the actual output extension before the prompt.
			const destination = resolveDefaultCreationDestination(this.plugin.app, context.source.path, file.extension ? file.name : `${file.name}.md`);
			const prompt = await promptForCreationName(this, {
				placeholder: "Enter new note name...",
				instructions: { insertString: "to create a new note", dismissString: "to dismiss" },
			});
			if (prompt.name === undefined || !prompt.isCurrent() || !context.canStartWork()) return { status: "cancelled" };
			return createNewNoteFromTemplate(this.plugin.app, { engine: "templater", template: file, destination, name: prompt.name });
		} catch (error) { return creationFailure(error); }
	}
}

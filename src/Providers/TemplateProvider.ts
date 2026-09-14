import { cloneSettings } from "../settingsData";
import { ActionContext, ActionResult, EntitySuggestionItem } from "src/suggestion.types";
import { EntityProvider, EntityProviderUserSettings } from "./EntityProvider";
import { TFile, TFolder } from "obsidian";
import { createNewNoteFromTemplate, creationFailure, resolveDefaultCreationDestination } from "../entityCreation";
import { promptForCreationName } from "../creationPrompt";
import type { ProviderSettingsContext } from "../ui/providerSettings";
import { FolderSuggest } from "../ui/file-suggest";
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

	static getSettingDefinitions(context: ProviderSettingsContext<TemplateProviderUserSettings>) {
		return [
			context.field("actionType", "Action type", "Template insertion is temporarily unavailable in Entities. Use Templater: Open insert template modal or your existing template hotkey manually. Note creation remains available.", (setting, field) => {
				// eslint-disable-next-line obsidianmd/ui/sentence-case -- Entities is the plugin name.
				setting.addDropdown(dropdown => dropdown.addOption("create", "Create a new note from template").addOption("insert", "Insertion unavailable in Entities")
					.setValue(field.value).onChange(value => { if (value === "create" || value === "insert") field.set(value); }));
			}),
			context.field("trigger", "Trigger character", "Character to trigger the template suggestions.", (setting, field) => {
				setting.addDropdown(dropdown => {
					for (const trigger of Object.values(TriggerCharacter)) dropdown.addOption(trigger, trigger);
					dropdown.setValue(field.value).onChange(value => { if (Object.values(TriggerCharacter).includes(value as TriggerCharacter)) field.set(value as TriggerCharacter); });
				});
			}),
			context.field("path", "Folder path", "Folder containing the source templates.", (setting, field) => {
				setting.addText(text => {
					text.setPlaceholder("Folder path").setValue(field.value).onChange(value => field.set(value));
					new FolderSuggest(context.plugin.app, text.inputEl, { additionalClasses: "entities-settings" });
					field.captureText(text.inputEl);
				});
				context.watch(field.scope, () => setting.setDesc(context.plugin.app.vault.getFolderByPath(context.value("path")) ? "Folder found" : "Folder not found. This text remains pending until it names an existing folder."));
			}, { validate: value => context.plugin.app.vault.getFolderByPath(value) ? undefined : "Invalid folder. This text is pending; the applied folder is unchanged." }),
		];
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

import { EntitySuggestionItem } from "src/EntitiesSuggestor";
import { EntityProvider, EntityProviderUserSettings } from "./EntityProvider";
import { ExtraButtonComponent, Plugin, Setting, TFile, TFolder } from "obsidian";
import { EntitiesModalInput, IconPickerModal } from "src/userComponents";
import {
	createNewNoteFromTemplate,
	insertTemplateUsingTemplater,
} from "src/entititiesUtilities";
import { FolderSuggest } from "src/ui/file-suggest";

const templateProviderTypeID = "template";

export interface TemplateProviderUserSettings extends EntityProviderUserSettings {
	providerTypeID: string;
	path: string;
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

	static getDescription(settings?: TemplateProviderUserSettings): string {
		if (settings) {
			return `📄 Template Entity Provider - ${settings.actionType} (${settings.path})`;
		} else {
			return `Template Entity Provider`;
		}
	}

	getDescription(): string {
		return TemplateEntityProvider.getDescription(this.settings);
	}
	static getDefaultSettings(): TemplateProviderUserSettings {
		return { ...defaultTemplateProviderUserSettings };
	}

	getDefaultSettings(): TemplateProviderUserSettings {
		return TemplateEntityProvider.getDefaultSettings();
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

	static buildSummarySetting(
		settingContainer: Setting,
		settings: TemplateProviderUserSettings,
		onShouldSave: (newSettings: TemplateProviderUserSettings) => void,
		plugin: Plugin
	): void {
		const folderExists = (folderPath: string) =>
			plugin.app.vault.getFolderByPath(folderPath) !== null;
		let folderExistsIcon: ExtraButtonComponent;
		const updateFolderExistsIcon = (path: string) => {
			if (folderExists(path) && folderExistsIcon) {
				folderExistsIcon.setIcon("folder-check");
				folderExistsIcon.setTooltip("Folder Found");
				folderExistsIcon.extraSettingsEl.style.color = "";
			} else if (folderExistsIcon) {
				folderExistsIcon.setIcon("folder-x");
				folderExistsIcon.setTooltip("Folder Not Found");
				folderExistsIcon.extraSettingsEl.style.color =
					"var(--text-error)";
			}
		};
		settingContainer.addExtraButton((button) => {
			folderExistsIcon = button;
			updateFolderExistsIcon(settings.path);
			button.setDisabled(true);
		});

		settingContainer.addText((text) => {
			text.setPlaceholder("Folder Path").setValue(settings.path);
			text.onChange((value) => {
				if (folderExists(value)) {
					updateFolderExistsIcon(value);
					settings.path = value;
					onShouldSave(settings);
				} else {
					updateFolderExistsIcon(value);
				}
			});

			new FolderSuggest(plugin.app, text.inputEl, {additionalClasses:"entities-settings"});
		});		
		
	}

	static buildSimpleSettings(
		settingContainer: HTMLElement,
		settings: TemplateProviderUserSettings,
		onShouldSave: (newSettings: TemplateProviderUserSettings) => void,
		plugin: Plugin
	): void {

		new Setting(settingContainer)
			.setName("Icon")
			.setDesc("Icon for the entities returned by this provider")
			.addButton((button) =>
				button
					.setIcon(settings.icon ?? "box-select")
					.setDisabled(false)
					.onClick(() => {
						const iconPickerModal = new IconPickerModal(plugin.app);
						iconPickerModal.open();
						iconPickerModal.getInput().then((iconName) => {
							settings.icon = iconName;
							onShouldSave(settings);
							button.setIcon(iconName);
						});
					})
			);
			
		new Setting(settingContainer)
			.setName("Action Type")
			.setDesc("Action to perform with the templates")
			.addDropdown((dropdown) => {
				dropdown.addOption("create", "Create a new note from template")
				dropdown.addOption("insert", "Insert the template into the current note")
				dropdown.onChange((value) => {
					settings.actionType = value as "create" | "insert";
					onShouldSave(settings);
				});
				dropdown.setValue(settings.actionType);
			})

		const folderPathSetting = new Setting(settingContainer)
			.setName("Folder Path")
			.setDesc("The path of the folder where Templates are located");
		this.buildSummarySetting(
			folderPathSetting,
			settings,
			onShouldSave,
			plugin
		);			
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


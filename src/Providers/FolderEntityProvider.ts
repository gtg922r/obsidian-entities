import { Plugin, Setting, TFile } from "obsidian";
import { FolderProviderSettings } from "src/entities.types";
import { EntityProvider, EntitySuggestionItem } from "src/EntitiesSuggestor";
import { FolderSuggest } from "src/ui/file-suggest";
import { IconPickerModal } from "src/userComponents";

export class FolderEntityProvider extends EntityProvider {
    constructor(plugin: Plugin, private settings: FolderProviderSettings) {
        super({
            plugin,
            description: `📂 Folder Entity Provider (${settings.path})`,
            entityCreationTemplates: settings.newEntityFromTemplates,
		});
		this.config = settings;
    }
	config: FolderProviderSettings;
	getEntityList(query: string): EntitySuggestionItem[] {
			const entityFolder = this.plugin.app.vault.getFolderByPath(
				this.config.path
			);
			const entities: TFile[] | undefined = entityFolder?.children.filter(
				(file: unknown) => file instanceof TFile
			) as TFile[] | undefined;

			const entitySuggestions =
				entities?.map((file) => ({
					suggestionText: file.basename,
					icon: this.icon ?? "folder-open-dot",
				})) ?? [];

			const suggestionFromAlias: (
				alias: string,
				file: TFile
			) => EntitySuggestionItem = (alias: string, file: TFile) => ({
				suggestionText: alias,
				icon: this.icon ?? "folder-open-dot",
				replacementText: `${file.basename}|${alias}`,
			});

			const aliasEntitiesSuggestions = entities?.flatMap((file) => {
				const aliases = this.plugin.app.metadataCache.getFileCache(file)
					?.frontmatter?.aliases as string | string[] | undefined;
				if (typeof aliases === "string")
					return [suggestionFromAlias(aliases, file)];
				return aliases
					? aliases.map((alias) => suggestionFromAlias(alias, file))
					: [];
			});

			return aliasEntitiesSuggestions
				? [...entitySuggestions, ...aliasEntitiesSuggestions]
				: entitySuggestions;
		}
}
export function getFolderProviderSettingsContent(
	contentEl: HTMLElement,
	settings: FolderProviderSettings
) {
	// Example setting for folder path
	contentEl.createEl('h2', { text: 'Folder Provider Settings' });

	new Setting(contentEl)
		.setName("Folder Path")
		.setDesc("The path of the folder to use as a provider")
		.addSearch((search) => {
			search
				.setPlaceholder("Folder Path")
				.setValue(settings.path)
				.onChange((value) => {
					settings.path = value;
				});
			new FolderSuggest(this.app, search.inputEl);
		});

	new Setting(contentEl)
		.setName("Icon")
		.setDesc("The icon to use for the provider")
		.addButton((button) =>
			button
				.setIcon(settings.icon ?? "box-select")
				.onClick(() => {
					const iconPickerModal = new IconPickerModal(this.app);
					iconPickerModal.open();
				})
		)		
		.addText((text) => {
			text
			.setPlaceholder("Icon Name")
			.setValue(settings.icon || "")
			.setDisabled(true);
		});

	// Example setting for template creation
	new Setting(contentEl)
		.setName("New Entity From Templates")
		.setDesc("Templates to use when creating a new entity")
		.addButton((button) =>
			button.setButtonText("Add Template").onClick(() => {
				// Handle adding a new template
			})
		);
}


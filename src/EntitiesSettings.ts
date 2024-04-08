/* eslint-disable no-mixed-spaces-and-tabs */
import {
	PluginSettingTab,
	Setting,
	App,
	DropdownComponent,
	TextComponent,
	Notice,
} from "obsidian";
import Entities from "./main";
import {
	DataviewProviderSettings,
	FolderProviderSettings,
	ProviderConfiguration,
	ProviderTemplateCreationSettings,
	TemplateProviderSettings,
} from "./entities.types";
import { EntitiesModalInput, openTemplateDetailsModal } from "./userComponents";

let saveTimeout: NodeJS.Timeout | undefined;

function updateProviderAtIndexAndSaveAndReload(
	plugin: Entities,
	providerConfig: ProviderConfiguration,
	index: number
) {
	if (saveTimeout !== undefined) {
		clearTimeout(saveTimeout);
	}

	saveTimeout = setTimeout(() => {
		plugin.settings.providers[index] = providerConfig;
		plugin.saveSettings().then(() => {
			plugin.loadEntityProviders(); // Reload providers after setting change
			new Notice("✅ Entities Settings Providers Updated");
		});
		saveTimeout = undefined;
	}, 1000);
}

export class EntitiesSettingTab extends PluginSettingTab {
	plugin: Entities;

	constructor(app: App, plugin: Entities) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		let dropDownEl: DropdownComponent;
		let textEl: TextComponent;

		containerEl.empty();

		// Add provider UI
		new Setting(containerEl)
			.setName("Add Provider")
			.setDesc("Type and add a new entity provider")
			.addDropdown((dropdown) => {
				dropdown.addOption("folder", "Folder");
				dropdown.addOption("dataview", "Dataview");
				dropdown.addOption("noteFromTemplate", "Note from Template");
				dropdown.addOption("insertTemplate", "Insert Template");
				dropDownEl = dropdown;
			})
			.addText((text) => {
				textEl = text;
				text.setPlaceholder("Path or Query");
			})
			.addButton((button) =>
				button.setButtonText("+").onClick(() => {
					const type = (dropDownEl as DropdownComponent).getValue();
					const value = textEl.getValue();
					let settings;
					if (["folder", "noteFromTemplate", "insertTemplate"].includes(type)) {
						settings = { path: value };
					} else if (type === "dataview") {
						settings = { query: value };
					}
					if (!settings) {
						console.error("Invalid settings");
						return;
					}
					const newProvider = {
						type,
						settings: settings,
					} as ProviderConfiguration;
					this.plugin.settings.providers.push(newProvider);
					this.plugin.saveSettings();
					this.plugin.loadEntityProviders(); // Reload providers after adding
					this.display(); // Refresh the settings UI
				})
			);

		// Providers configuration UI
		this.plugin.settings.providers.forEach((providerConfig, index) => {
			const setting = new Setting(containerEl)
				.setName(
					`${
						providerConfig.type === "folder"
							? "Folder"
							: providerConfig.type === "dataview"
							? "Dataview (Query)"
							: providerConfig.type === "noteFromTemplate"
							? "Note from Template"
							: "Insert Template"
					} Provider`
				)
				.setDesc(`Provider #${index + 1}`)
				.addButton((button) =>
					button
						.setIcon(providerConfig.settings.icon ?? "box-select")
						.onClick(() => {
							const modal = new EntitiesModalInput(this.app, {
								placeholder: "Enter icon name...",
								instructions: {
									insertString: "Enter to confirm",
									dismissString: "ESC to cancel",
								},
							});
							modal.open();
							modal.getInput().then((iconName) => {
								if (iconName) {
									providerConfig.settings.icon = iconName;
									updateProviderAtIndexAndSaveAndReload(
										this.plugin,
										providerConfig,
										index
									);
									this.display(); // Refresh the settings UI
								}
							});
						})
				)
				.addText((text) =>
					text
						.setValue(
							providerConfig.type === "dataview"
								? (
										providerConfig.settings as DataviewProviderSettings
								  ).query
								: (
										providerConfig.settings as
											| FolderProviderSettings
											| TemplateProviderSettings
								  ).path
						)
						.setPlaceholder("Path or Query")
						.onChange((value) => {
							if (providerConfig.type === "folder") {
								providerConfig.settings.path = value;
							} else if (providerConfig.type === "dataview") {
								providerConfig.settings.query = value;
							} else if (
								providerConfig.type === "noteFromTemplate" ||
								providerConfig.type === "insertTemplate"
							) {
								providerConfig.settings.path = value;
							}
							updateProviderAtIndexAndSaveAndReload(
								this.plugin,
								providerConfig,
								index
							);
						})
				)
				.addButton((button) =>
					button
						.setIcon("file-plus")
						.setDisabled(
							providerConfig.type !== "dataview" &&
								providerConfig.type !== "folder"
						)
						.onClick(async () => {
							// Open a modal or another UI component to input template details
							// For simplicity, assuming a modal is used and returns an object with template details
							const initialSettings =
								(
									providerConfig.settings as ProviderTemplateCreationSettings
								).newEntityFromTemplates ?? [];
							const templateDetails =
								await openTemplateDetailsModal(
									initialSettings[0]
								);
							if (templateDetails) {
								// Assuming `settings` is the current settings object for the provider
								(
									providerConfig.settings as ProviderTemplateCreationSettings
								).newEntityFromTemplates = [templateDetails];
								// Save settings and refresh UI
								updateProviderAtIndexAndSaveAndReload(
									this.plugin,
									providerConfig,
									index
								);
								this.display(); // Refresh the settings UI
							}
						})
				)
				.addButton((button) =>
					button.setIcon("trash").onClick(async () => {
						this.plugin.settings.providers.splice(index, 1);
						await this.plugin.saveSettings();
						this.plugin.loadEntityProviders(); // Reload providers after removal
						this.display(); // Refresh the settings UI
					})
				);

			// Optionally, adjust the layout of the setting to display it in a single row
			setting.settingEl.addClass("flex-container"); // Ensure you define this class in your CSS to align items in a row
		});

		// Add button to manually reload providers
		new Setting(containerEl)
			.setName("Reload Providers")
			.setDesc("Manually reload all entity providers")
			.addButton((button) => {
				button.setButtonText("Reload").onClick(() => {
					console.log("Reloading entity providers...");
					this.plugin.loadEntityProviders();
				});
			});
	}
}

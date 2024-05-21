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
	openTemplateDetailsModal,
	IconPickerModal,
	ProviderSettingsModal,
} from "./userComponents";
import { EntityProviderUserSettings } from "./Providers/EntityProvider";

let saveTimeout: NodeJS.Timeout | undefined;

function updateProviderAtIndexAndSaveAndReload(
	settingsTab: EntitiesSettingTab,
	providerConfig: EntityProviderUserSettings,
	index: number,
	shouldWaitToSave = true
) {
	if (saveTimeout !== undefined) {
		clearTimeout(saveTimeout);
	}

	saveTimeout = setTimeout(() => {
		settingsTab.plugin.settings.providerSettings[index] = providerConfig;
		settingsTab.plugin.saveSettings().then(() => {
			settingsTab.plugin.loadEntityProviders(); // Reload providers after setting change
			new Notice("✅ Entities Settings Providers Updated");
		});
		saveTimeout = undefined;
		settingsTab.display();
	}, shouldWaitToSave ? 1000 : 0);
}

export class EntitiesSettingTab extends PluginSettingTab {
	plugin: Entities;

	constructor(app: App, plugin: Entities) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		// let dropDownEl: DropdownComponent;
		// let textEl: TextComponent;

		containerEl.empty();
		console.log("running display and getting icons");

		// // Add provider UI
		// new Setting(containerEl)
		// 	.setName("Add Provider")
		// 	.setDesc("Type and add a new entity provider")
		// 	.addDropdown((dropdown) => {
		// 		dropdown.addOption("folder", "Folder");
		// 		dropdown.addOption("dataview", "Dataview");
		// 		dropdown.addOption("noteFromTemplate", "Note from Template");
		// 		dropdown.addOption("insertTemplate", "Insert Template");
		// 		dropDownEl = dropdown;
		// 	})
		// 	.addText((text) => {
		// 		textEl = text;
		// 		text.setPlaceholder("Path or Query");
		// 		new FolderSuggest(this.app, text.inputEl);
		// 	})
		// 	.addButton((button) =>
		// 		button.setButtonText("+").onClick(() => {
		// 			const type = (dropDownEl as DropdownComponent).getValue();
		// 			const value = textEl.getValue();
		// 			let settings;
		// 			if (
		// 				[
		// 					"folder",
		// 					"noteFromTemplate",
		// 					"insertTemplate",
		// 				].includes(type)
		// 			) {
		// 				settings = { path: value };
		// 			} else if (type === "dataview") {
		// 				settings = { query: value };
		// 			}
		// 			if (!settings) {
		// 				console.error("Invalid settings");
		// 				return;
		// 			}
		// 			const newProvider = {
		// 				type,
		// 				settings: settings,
		// 			} as ProviderConfiguration;
		// 			this.plugin.settings.providers.push(newProvider);
		// 			this.plugin.saveSettings();
		// 			this.plugin.loadEntityProviders(); // Reload providers after adding
		// 			this.display(); // Refresh the settings UI
		// 		})
		// 	);

		// // Providers configuration UI
		// this.plugin.settings.providers.forEach((providerConfig, index) => {
		// 	const setting = new Setting(containerEl)
		// 		.setName(
		// 			`${
		// 				providerConfig.type === "folder"
		// 					? "Folder"
		// 					: providerConfig.type === "dataview"
		// 					? "Dataview (Query)"
		// 					: providerConfig.type === "noteFromTemplate"
		// 					? "Note from Template"
		// 					: "Insert Template"
		// 			} Provider`
		// 		)
		// 		.setDesc(`Provider #${index + 1}`)
		// 		.addButton((button) =>
		// 			button
		// 				.setIcon(providerConfig.settings.icon ?? "box-select")
		// 				.onClick(() => {
		// 					const iconPickerModal = new IconPickerModal(
		// 						this.app
		// 					);
		// 					iconPickerModal.open();
		// 					iconPickerModal.getInput().then((iconName) => {
		// 						if (iconName) {
		// 							providerConfig.settings.icon = iconName;
		// 							updateProviderAtIndexAndSaveAndReload(
		// 								this.plugin,
		// 								providerConfig,
		// 								index
		// 							);
		// 							this.display(); // Refresh the settings UI
		// 						}
		// 					});
		// 				})
		// 		)
		// 		.addText((text) => {
		// 			text.setValue(
		// 				providerConfig.type === "dataview"
		// 					? (
		// 							providerConfig.settings as DataviewProviderSettings
		// 					  ).query
		// 					: (
		// 							providerConfig.settings as
		// 								| FolderProviderConfig
		// 								| TemplateProviderSettings
		// 					  ).path
		// 			);
		// 			text.setPlaceholder("Path or Query");
		// 			text.onChange((value) => {
		// 				if (providerConfig.type === "folder") {
		// 					providerConfig.settings.path = value;
		// 				} else if (providerConfig.type === "dataview") {
		// 					providerConfig.settings.query = value;
		// 				} else if (
		// 					providerConfig.type === "noteFromTemplate" ||
		// 					providerConfig.type === "insertTemplate"
		// 				) {
		// 					providerConfig.settings.path = value;
		// 				}
		// 				updateProviderAtIndexAndSaveAndReload(
		// 					this.plugin,
		// 					providerConfig,
		// 					index
		// 				);
		// 			});
		// 			if (
		// 				providerConfig.type === "folder" ||
		// 				providerConfig.type === "noteFromTemplate" ||
		// 				providerConfig.type === "insertTemplate"
		// 			) {
		// 				new FolderSuggest(this.app, text.inputEl);
		// 			}
		// 		})
		// 		.addButton((button) =>
		// 			button
		// 				.setIcon("file-plus")
		// 				.setDisabled(
		// 					providerConfig.type !== "dataview" &&
		// 						providerConfig.type !== "folder"
		// 				)
		// 				.onClick(async () => {
		// 					// Open a modal or another UI component to input template details
		// 					// For simplicity, assuming a modal is used and returns an object with template details
		// 					const initialSettings =
		// 						(
		// 							providerConfig.settings as ProviderTemplateCreationSettings
		// 						).newEntityFromTemplates ?? [];
		// 					const templateDetails =
		// 						await openTemplateDetailsModal(
		// 							initialSettings[0]
		// 						);
		// 					if (templateDetails) {
		// 						// Assuming `settings` is the current settings object for the provider
		// 						(
		// 							providerConfig.settings as ProviderTemplateCreationSettings
		// 						).newEntityFromTemplates = [templateDetails];
		// 						// Save settings and refresh UI
		// 						updateProviderAtIndexAndSaveAndReload(
		// 							this.plugin,
		// 							providerConfig,
		// 							index
		// 						);
		// 						this.display(); // Refresh the settings UI
		// 					}
		// 				})
		// 		)
		// 		.addButton((button) =>
		// 			button
		// 				.setIcon("settings")
		// 				.onClick(() => {
		// 					if (providerConfig.type === "folder") {
		// 						const modal = new ProviderSettingsModal(
		// 							this.app,
		// 							providerConfig.settings,
		// 							FolderEntityProvider.getProviderSettingsContent
		// 						);
		// 						modal.open();
		// 					}
		// 				})
		// 		)
		// 		.addButton((button) =>
		// 			button.setIcon("trash").onClick(async () => {
		// 				this.plugin.settings.providers.splice(index, 1);
		// 				await this.plugin.saveSettings();
		// 				this.plugin.loadEntityProviders(); // Reload providers after removal
		// 				this.display(); // Refresh the settings UI
		// 			})
		// 		);
		// });

		// Add button to manually reload providers
		// new Setting(containerEl)
		// 	.setName("Reload Providers")
		// 	.setDesc("Manually reload all entity providers")
		// 	.addButton((button) => {
		// 		button.setButtonText("Reload").onClick(() => {
		// 			console.log("Reloading entity providers...");
		// 			this.plugin.loadEntityProviders();
		// 		});
		// 	});

		new Setting(containerEl)
			.setName("Entity Providers")
			.setDesc("Settings for each active Entity provider")
			.setHeading();

		new Setting(containerEl)
			.setName("Add New Provider")
			.setDesc("Open New Provider Settings")
			.addDropdown((dropdown) => {
				dropdown.addOption("folder", "Folder");
				dropdown.addOption("dataview", "Dataview");
				dropdown.addOption("noteFromTemplate", "Note from Template");
				dropdown.addOption("insertTemplate", "Insert Template");
				dropdown.onChange((value) => {
					console.log("Dropdown Changed", value);
				});
			})
			.addButton((button) =>
				button.setIcon("plus").onClick(() => {
					console.log("Extra Button Clicked");
				})
			);

		this.plugin.settings.providerSettings.forEach(
			(providerSettings, index) => {
				const providerType = this.plugin.providerRegistry
					.getProviderClasses()
					.get(providerSettings.providerTypeID);
				if (!providerType) {
					console.error(
						`Provider type "${providerSettings.providerTypeID}" not found.`
					);
					return;
				}
				const settingContainer = new Setting(containerEl);

				settingContainer
					.setName(`Provider #${index + 1}`)
					.setDesc(`${providerType.getDescription(providerSettings)}`)
					// .addExtraButton(button => button.setIcon('folder').setDisabled(false))

				providerType.buildSummarySetting(
					settingContainer,
					providerSettings,
					(newSettings) => {
						providerSettings = newSettings;
						updateProviderAtIndexAndSaveAndReload(
							this,
							providerSettings,
							index
						);
					},
					this.plugin
				);
				settingContainer
					.addButton((button) =>
					button
						.setIcon(providerSettings.icon ?? "box-select")
						.setDisabled(false)
						.onClick(() => {
							const iconPickerModal = new IconPickerModal(
								this.app
							);
							iconPickerModal.open();
							iconPickerModal.getInput().then((iconName) => {
								if (iconName) {
									providerSettings.icon = iconName;
									updateProviderAtIndexAndSaveAndReload(
										this,
										providerSettings,
										index,
										false
									);
								}
							});
						}))	
					.addButton((button) =>
						button.setIcon("settings").onClick(() => {})
					)
					.addButton((button) =>
						button.setIcon("trash").onClick(() => {})
					);
			}
		);

		new Setting(containerEl)
			.setName("Entities Plugin Settings")
			.setDesc("Settings for the Entities Plugin")
			.setHeading();

		new Setting(containerEl)
			.setName("Reload Providers")
			.setDesc("(Debugging) Manually reload all entity providers")
			.addExtraButton((button) =>
				button
					.setIcon("bug")
					.setDisabled(false)
					.setTooltip("Debugging Only")
			)
			.addButton((button) => {
				button.setButtonText("Reload").onClick(() => {
					console.log("Reloading entity providers...");
					this.plugin.loadEntityProviders();
				});
			});
	}
}

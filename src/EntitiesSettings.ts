/* eslint-disable no-mixed-spaces-and-tabs */
import {
	PluginSettingTab,
	Setting,
	App,
	Modal,
	Notice,
} from "obsidian";
import Entities from "./main";
import { IconPickerModal } from "./userComponents";
import { EntityProviderUserSettings } from "./Providers/EntityProvider";
import { RegisterableEntityProvider } from "./Providers/ProviderRegistry";

let saveTimeout: NodeJS.Timeout | undefined;

function updateProviderAtIndexAndSaveAndReload(
	settingsTab: EntitiesSettingTab,
	providerConfig: EntityProviderUserSettings,
	index: number,
	shouldWaitToSave = true,
	shouldRefreshUI = true
) {
	if (saveTimeout !== undefined) {
		clearTimeout(saveTimeout);
	}

	saveTimeout = setTimeout(
		() => {
			settingsTab.plugin.settings.providerSettings[index] =
				providerConfig;
			settingsTab.plugin.saveSettings().then(() => {
				settingsTab.plugin.loadEntityProviders(); // Reload providers after setting change
				new Notice("✅ Entities Settings Providers Updated");
			});
			saveTimeout = undefined;
			if (shouldRefreshUI) {
				settingsTab.display();
			}
		},
		shouldWaitToSave ? 1000 : 0
	);
}

export class EntitiesSettingTab extends PluginSettingTab {
	plugin: Entities;

	constructor(app: App, plugin: Entities) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

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
				// const providerIcon = settingContainer.settingEl.createEl('div', { cls: 'setting-item-provider-icon' });
				// settingContainer.settingEl.prepend(providerIcon);
				// if (providerSettings.providerTypeID === "dataview") {
				// 	setIcon(providerIcon, "search-code");
				// } else if (providerSettings.providerTypeID === "folder") {
				// 	setIcon(providerIcon, "folder");
				// } else if (providerSettings.providerTypeID === "noteFromTemplate") {
				// 	setIcon(providerIcon, "note-template");
				// } else if (providerSettings.providerTypeID === "insertTemplate") {
				// 	setIcon(providerIcon, "note-template");
				// } else if (providerSettings.providerTypeID === "nlDates") {
				// 	setIcon(providerIcon, "calendar");
				// } else {
				// 	setIcon(providerIcon, "package");
				// }

				settingContainer
					.setName(`Provider #${index + 1}`)
					.setDesc(
						`${providerType.getDescription(providerSettings)}`
					);

				// .setName(
				// 	`${providerType.getDescription(providerSettings)}`
				// );

				providerType.buildSummarySetting(
					settingContainer,
					providerSettings,
					(newSettings) => {
						providerSettings = newSettings;
						updateProviderAtIndexAndSaveAndReload(
							this,
							providerSettings,
							index,
							true,
							false
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
							})
					)
					.addButton((button) =>
						button.setIcon("settings").onClick(() => {
							console.log("Settings Button Clicked");
							const providerType = this.plugin.providerRegistry
								.getProviderClasses()
								.get(providerSettings.providerTypeID);
							if (!providerType) {
								new Notice(
									`Provider type "${providerSettings.providerTypeID}" not found.`
								);
								return;
							}
							const modal = new ProviderSettingsModal(
								this.app,
								providerType,
								providerSettings,
								this.plugin,
								(newSettings) => {
									providerSettings = newSettings;
									updateProviderAtIndexAndSaveAndReload(
										this,
										providerSettings,
										index,
										true,
										true
									);
								},
								() => {
									this.display();
								}
							);
							modal.open();
						})
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

export class ProviderSettingsModal extends Modal {
	private provider: RegisterableEntityProvider;
	private providerSettings: EntityProviderUserSettings;
	private plugin: Entities;
	private saveCallback: (newSettings: EntityProviderUserSettings) => void;
	private closeCallback?: () => void;
	private advancedSettingsOpen = false;

	constructor(
		app: App,
		provider: RegisterableEntityProvider,
		providerSettings: EntityProviderUserSettings,
		plugin: Entities,
		saveCallback: (newSettings: EntityProviderUserSettings) => void,
		closeCallback?: () => void
	) {
		super(app);
		this.provider = provider;
		this.providerSettings = providerSettings;
		this.plugin = plugin;
		this.saveCallback = saveCallback;
	}

	onOpen() {
		this.display();
	}

	onClose() {
		this.closeCallback?.();
	}

	display() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.parentElement?.toggleClass("entities-wide-modal", true);

		this.provider.buildSimpleSettings?.(
			contentEl,
			this.providerSettings,
			(newSettings) => {
				console.log("Saving new settings", newSettings);
				this.saveCallback(newSettings);
			},
			this.plugin
		);

		new Setting(contentEl)
			.setHeading()
			.setName("Advanced Settings")
			.setDesc(
				"Settings that are more advanced and may require more care"
			)
			.addButton((button) => {
				if (this.advancedSettingsOpen) {
					button.setButtonText("Hide");
				} else {
					button.setButtonText("Show");
				}
				button.onClick(() => {
					this.advancedSettingsOpen = !this.advancedSettingsOpen;
					this.display();
				});
			});

		if (this.advancedSettingsOpen) {
			this.provider.buildAdvancedSettings?.(
				contentEl,
				this.providerSettings,
				(newSettings) => {
					console.log("Saving new settings", newSettings);
				},
				this.plugin
			);
		}
	}
}

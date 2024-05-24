/* eslint-disable no-mixed-spaces-and-tabs */
import {
	PluginSettingTab,
	Setting,
	App,
	Modal,
	DropdownComponent,
	ButtonComponent,
} from "obsidian";
import Entities from "./main";
import { EntitiesNotice, IconPickerModal } from "./userComponents";
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
				console.log("✅ Settings saved and providers reloaded");
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

		let newProviderDropdown: DropdownComponent;
		new Setting(containerEl)
			.setName("Add New Provider")
			.setDesc("Open New Provider Settings")
			.addDropdown((dropdown) => {
				newProviderDropdown = dropdown;
				const providerTypes =
					this.plugin.providerRegistry.getProviderClasses();
				providerTypes.forEach((providerType, providerTypeID) => {
					dropdown.addOption(
						providerTypeID,
						providerType.getDescription()
					);
				});
			})
			.addButton((button) =>
				button.setIcon("plus").onClick(() => {
					const providerTypeID = newProviderDropdown.getValue();
					if (!providerTypeID) {
						new EntitiesNotice("Please select a provider type.", "alert-triangle");
						return;
					}
					const providerType = this.plugin.providerRegistry
						.getProviderClasses()
						.get(providerTypeID);
					if (!providerType) {
						console.error(
							`Provider type "${providerTypeID}" not found.`
						);
						return;
					}
					const providerSettings = providerType.getDefaultSettings();
					const index =
						this.plugin.settings.providerSettings.push(
							providerSettings
						) - 1;
					this.plugin.saveSettings().then(() => {
						this.plugin.loadEntityProviders();
						this.display();

						if (
							providerType.buildSimpleSettings ||
							providerType.buildAdvancedSettings
						) {
							// Open the ProviderSettingsModal for the new provider
							const modal = new ProviderSettingsModal(
								this.app,
								providerType,
								providerSettings,
								this.plugin,
								(newSettings) => {
									updateProviderAtIndexAndSaveAndReload(
										this,
										newSettings,
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
						}
					});
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
					.addButton((button) => {
						button.setIcon("settings");
						const providerType = this.plugin.providerRegistry
							.getProviderClasses()
							.get(providerSettings.providerTypeID);

						if (!providerType) {
							new EntitiesNotice(
								`Provider type "${providerSettings.providerTypeID}" not found.`,
								"x-octagon"
							);
							return;
						}
						if (
							!providerType.buildSimpleSettings &&
							!providerType.buildAdvancedSettings
						) {
							button.setDisabled(true);
						}
						button.onClick(() => {
							console.log("Settings Button Clicked");
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
						});
					})
					.addButton((button) =>
						button.setIcon("trash").onClick(() => {
							this.plugin.settings.providerSettings.splice(
								index,
								1
							);
							this.plugin.saveSettings().then(() => {
								this.plugin.loadEntityProviders();
								this.display();
								new EntitiesNotice("Provider deleted successfully", "trash-2");
							});
						})
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
	buttonContainerEl: HTMLElement;

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

		this.modalEl.addClass("entities-wide-modal");

		this.buttonContainerEl = this.modalEl.createDiv({
			cls: "modal-button-container",
		});
		new ButtonComponent(this.buttonContainerEl)
			.setButtonText("Close")
			.setCta()
			.onClick(() => {
				this.close();
			});
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

		this.titleEl.setText(`${this.provider.getDescription()} Settings`);

		if (this.provider.buildSimpleSettings) {
			this.provider.buildSimpleSettings(
				contentEl,
				this.providerSettings,
				(newSettings) => {
					console.log("Saving new settings", newSettings);
					this.saveCallback(newSettings);
				},
				this.plugin
			);
		} else {
			new Setting(contentEl)
				.setName(`Settings: ${this.provider.getDescription()}`)
				.setDesc("No simple settings available for this provider.")
				.setHeading();
		}

		if (this.provider.buildAdvancedSettings) {
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

		// new Setting(contentEl).addButton((button) =>
		// 	button
		// 		.setButtonText("Close")
		// 		.setCta()
		// 		.onClick(() => {
		// 			this.close();
		// 		})
		// );
	}
}

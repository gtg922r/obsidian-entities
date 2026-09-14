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
import { cloneSettings } from "./settingsData";
import { InputSuggestScope } from "./ui/inputSuggestLifecycle";

function updateProviderAndReload(
	settingsTab: EntitiesSettingTab,
	providerConfig: Partial<EntityProviderUserSettings>,
	providerInstanceId: string,
	shouldRefreshUI = true
): boolean {
	if (!settingsTab.plugin.settingsStore.updateProvider(providerInstanceId, providerConfig)) return false;
	settingsTab.plugin.loadEntityProviders();
	if (shouldRefreshUI) settingsTab.refreshIfDisplayed();
	return true;
}

/** Save only fields changed by this draft so late UI callbacks keep other edits. */
function providerSaveCallback(
	settingsTab: EntitiesSettingTab,
	providerInstanceId: string,
	initial: EntityProviderUserSettings,
	shouldRefreshUI = true
): (settings: EntityProviderUserSettings) => boolean {
	let previous = cloneSettings(initial) as unknown as Record<string, unknown>;
	let conflicted = false;
	return settings => {
		if (conflicted) return false;
		const current = settingsTab.plugin.settingsStore.settings.providerSettings.find(item => item.providerInstanceId === providerInstanceId);
		if (!current || settingsTab.plugin.settingsStore.isReadOnly) return false;
		const canonical = current as unknown as Record<string, unknown>;
		const next = settings as unknown as Record<string, unknown>;
		const changes: Record<string, unknown> = {};
		for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
			if (JSON.stringify(previous[key]) === JSON.stringify(next[key])) continue;
			if (JSON.stringify(canonical[key]) !== JSON.stringify(previous[key]) && JSON.stringify(canonical[key]) !== JSON.stringify(next[key])) {
				conflicted = true;
				new EntitiesNotice("This provider changed in another settings view. Your last edit was not applied. Settings have reloaded; reopen the provider and try again.", "alert-triangle", 10000);
				settingsTab.refreshIfDisplayed();
				return false;
			}
			changes[key] = cloneSettings(next[key]);
		}
		previous = cloneSettings(next);
		return Object.keys(changes).length === 0 || updateProviderAndReload(settingsTab, changes, providerInstanceId, shouldRefreshUI);
	};
}

export class EntitiesSettingTab extends PluginSettingTab {
	plugin: Entities;
	private saveErrorSetting?: Setting;
	private renderScope?: InputSuggestScope;
	private displayed = false;

	constructor(app: App, plugin: Entities) {
		super(app, plugin);
		this.plugin = plugin;
	}

	hide(): void {
		this.displayed = false;
		this.renderScope?.dispose();
		void this.plugin.saveSettings();
	}

	/** A modal may finish after the settings tab has been hidden. */
	refreshIfDisplayed(): void {
		if (this.displayed && this.renderScope?.active) this.display();
	}

	/** Remove only the recovered warning, preserving focused provider inputs. */
	clearSaveError(): void {
		this.saveErrorSetting?.settingEl.remove();
		this.saveErrorSetting = undefined;
	}

	display(): void {
		this.renderScope?.dispose();
		if (this.plugin.inputSuggestions && !this.plugin.inputSuggestions.active) return;
		const { containerEl } = this;
		const view = this.renderScope = new InputSuggestScope(containerEl, this.plugin.inputSuggestions);
		this.displayed = true;
		containerEl.empty();
		this.saveErrorSetting = undefined;

		const store = this.plugin.settingsStore;
		if (store.loadError) {
			new Setting(containerEl)
				.setName("Settings could not be loaded")
				.setDesc(`${store.loadError.message} Saved data has not been changed. Fix the saved file or restore a backup, then retry.`)
				.addButton(button => button.setButtonText("Retry load").onClick(view.guard(async () => {
					await this.plugin.loadSettings();
					if (view.active) this.display();
				})));
			return;
		}
		if (store.isReadOnly) return;
		if (store.saveError) {
			this.saveErrorSetting = new Setting(containerEl)
				.setName("Settings have not been saved")
				.setDesc(`${store.saveError.message} Changes are still in memory.`)
				.addButton(button => button.setButtonText("Retry save").onClick(view.guard(async () => {
					await this.plugin.saveSettings();
					if (view.active) this.display();
				})));
		}

		new Setting(containerEl)
			.setName("Entity providers")
			.setDesc("Settings for each active entity provider")
			.setHeading();

		let newProviderDropdown: DropdownComponent;
		new Setting(containerEl)
			.setName("Add new provider")
			.setDesc("Open new provider settings")
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
				button.setIcon("plus").onClick(view.guard(() => {
					const providerTypeID = newProviderDropdown.getValue();
					if (!providerTypeID) {
						new EntitiesNotice(
							"Please select a provider type.",
							"alert-triangle"
						);
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
					const providerSettings = store.addProvider(providerType.getDefaultSettings());
					if (!providerSettings) return;
					this.plugin.loadEntityProviders();
					this.display();
					if (providerType.buildSimpleSettings || providerType.buildAdvancedSettings) {
						new ProviderSettingsModal(
							this.app, providerType, providerSettings, this.plugin,
							providerSaveCallback(this, providerSettings.providerInstanceId, providerSettings),
							() => this.refreshIfDisplayed()
						).open();
					}
				}))
			);

		this.plugin.settings.providerSettings.forEach(
			(providerSettings, index) => {
				const { providerInstanceId } = providerSettings;
				const providerType = this.plugin.providerRegistry
					.getProviderClasses()
					.get(providerSettings.providerTypeID);
				if (!providerType) {
					new Setting(containerEl)
						.setName(`Provider #${index + 1}`)
						.setDesc(`Unavailable provider type: ${providerSettings.providerTypeID}. Its settings are preserved.`);
					return;
				}
				const settingContainer = new Setting(containerEl);

				settingContainer
					.setName(`Provider #${index + 1}`)
					.setDesc(
						`${providerType.getDescription(providerSettings)}`
					);

				providerType.buildSummarySetting(
					settingContainer,
					providerSettings,
					view.guard(providerSaveCallback(this, providerInstanceId, providerSettings, false)),
					this.plugin
				);
				settingContainer
					.addButton((button) =>
						button
							.setIcon(providerSettings.icon ?? "box-select")
							.setDisabled(false)
							.onClick(view.guard(() => {
								const current = store.settings.providerSettings.find(item => item.providerInstanceId === providerInstanceId);
								if (!current) return;
								const saveIcon = view.guard(providerSaveCallback(this, providerInstanceId, current));
								const iconPickerModal = new IconPickerModal(
									this.app
								);
								iconPickerModal.open();
								iconPickerModal.getInput().then((iconName) => {
									if (iconName) {
										saveIcon({ ...current, icon: iconName });
									}
								});
							}))
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
						button.onClick(view.guard(() => {
							const current = store.settings.providerSettings.find(item => item.providerInstanceId === providerInstanceId);
							if (!current) return;
							const modal = new ProviderSettingsModal(
								this.app,
								providerType,
								current,
								this.plugin,
								providerSaveCallback(this, providerInstanceId, current),
								() => {
									this.refreshIfDisplayed();
								}
							);
							modal.open();
						}));
					})
					.addButton((button) =>
						button.setIcon("trash").onClick(view.guard(() => {
							if (!store.deleteProvider(providerInstanceId)) return;
							this.plugin.loadEntityProviders();
							this.display();
							new EntitiesNotice("Provider removed", "trash-2");
						}))
					);
			}
		);

		new Setting(containerEl)
			.setName("Reload providers")
			.setDesc("(Debugging) manually reload all entity providers")
			.addExtraButton((button) =>
				button
					.setIcon("bug")
					.setDisabled(false)
					.setTooltip("Debugging only")
			)
			.addButton((button) => {
				button.setButtonText("Reload").onClick(view.guard(() => {
					this.plugin.loadEntityProviders();
				}));
			});
	}
}

export class ProviderSettingsModal extends Modal {
	private provider: RegisterableEntityProvider;
	private providerSettings: EntityProviderUserSettings;
	private plugin: Entities;
	private saveCallback: (newSettings: EntityProviderUserSettings) => boolean | void;
	private closeCallback?: () => void;
	private advancedSettingsOpen = false;
	private renderScope?: InputSuggestScope;
	private releaseOwner?: () => void;
	buttonContainerEl: HTMLElement;

	constructor(
		app: App,
		provider: RegisterableEntityProvider,
		providerSettings: EntityProviderUserSettings,
		plugin: Entities,
		saveCallback: (newSettings: EntityProviderUserSettings) => boolean | void,
		closeCallback?: () => void
	) {
		super(app);
		this.provider = provider;
		this.providerSettings = cloneSettings(providerSettings);
		this.plugin = plugin;
		this.saveCallback = saveCallback;
		this.closeCallback = closeCallback;

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
		if (this.plugin.inputSuggestions && !this.plugin.inputSuggestions.active) { this.close(); return; }
		this.display();
	}

	onClose() {
		this.releaseOwner?.();
		this.releaseOwner = undefined;
		this.renderScope?.dispose();
		void this.plugin.saveSettings();
		this.closeCallback?.();
	}

	display() {
		this.renderScope?.dispose();
		if (this.plugin.inputSuggestions && !this.plugin.inputSuggestions.active) return;
		// Detached controls may still mutate their captured draft before a guarded save.
		this.providerSettings = cloneSettings(this.providerSettings);
		const { contentEl } = this;
		const view = this.renderScope = new InputSuggestScope(contentEl, this.plugin.inputSuggestions);
		this.releaseOwner = this.plugin.inputSuggestions?.own(() => this.close());
		view.own(() => { this.releaseOwner?.(); this.releaseOwner = undefined; });
		contentEl.empty();

		this.titleEl.setText(`${this.provider.getDescription()} settings`);

		if (this.provider.buildSimpleSettings) {
			this.provider.buildSimpleSettings(
				contentEl,
				this.providerSettings,
				view.guard((newSettings) => {
					this.providerSettings = newSettings;
					if (this.saveCallback(newSettings) === false) this.close();
				}),
				this.plugin
			);
		} else {
			new Setting(contentEl)
				.setName("General")
				.setDesc("Configure provider refresh and advanced behavior")
				.setHeading();
		}

		if (this.provider.buildAdvancedSettings) {
			new Setting(contentEl)
				.setHeading()
				.setName("Advanced settings")
				.setDesc(
					"Settings that are more advanced and may require more care"
				)
				.addButton((button) => {
					if (this.advancedSettingsOpen) {
						button.setButtonText("Hide");
					} else {
						button.setButtonText("Show");
					}
					button.onClick(view.guard(() => {
						this.advancedSettingsOpen = !this.advancedSettingsOpen;
						this.display();
					}));
				});

			if (this.advancedSettingsOpen) {
				this.provider.buildAdvancedSettings?.(
					contentEl,
					this.providerSettings,
					view.guard((newSettings) => {
						this.providerSettings = newSettings;
						if (this.saveCallback(newSettings) === false) this.close();
					}),
					this.plugin
				);
			}
		}
	}
}

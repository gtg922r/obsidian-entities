import { PluginSettingTab, Setting, App, DropdownComponent, TextComponent } from "obsidian";
import Entities from "./main";
import { DataviewProviderSettings, FolderProviderSettings, ProviderConfiguration, TemplateProviderSettings } from "./entities.types";

export class EntitiesSettingTab extends PluginSettingTab {
	plugin: Entities;

	constructor(app: App, plugin: Entities) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		let dropDownEl: DropdownComponent;
		let textEl:TextComponent;

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
					if (type in ["folder", "noteFromTemplate", "insertTemplate"]) {
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
				.addText((text) =>
					text
						.setValue(
							providerConfig.type === "dataview"
								? (providerConfig.settings as DataviewProviderSettings).query
								: (providerConfig.settings as FolderProviderSettings | TemplateProviderSettings).path
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
							// Save settings logic here
						})
				)
				.addButton((button) =>
					button.setButtonText("x").onClick(async () => {
						this.plugin.settings.providers.splice(index, 1);
						await this.plugin.saveSettings();
						this.display(); // Refresh the settings UI
					})
				);

			// Optionally, adjust the layout of the setting to display it in a single row
			setting.settingEl.addClass("flex-container"); // Ensure you define this class in your CSS to align items in a row
		});
	}
}

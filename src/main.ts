import { Plugin } from "obsidian";
import { EntitiesSettingTab } from "./EntitiesSettings";
import { EntitiesSettings, DEFAULT_SETTINGS } from "./entities.types";
import { EntitiesSuggestor } from "./EntitiesSuggestor";

export default class Entities extends Plugin {
	settings: EntitiesSettings;

	async onload() {
		await this.loadSettings();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new EntitiesSettingTab(this.app, this));

		this.registerEditorSuggest(new EntitiesSuggestor(this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

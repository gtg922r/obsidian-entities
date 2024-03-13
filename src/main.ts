import { Plugin } from "obsidian";
import { EntitiesSettingTab } from "./EntitiesSettings";
import {
	EntitiesSettings,
	DEFAULT_SETTINGS,
} from "./entities.types";
import { EntitiesSuggestor, EntityProvider } from "./EntitiesSuggestor";
import { createFolderEntityProvider } from "./Providers/FolderEntityProvider";
import { createDataviewQueryEntityProvider } from "./Providers/DataviewEntityProvider";
import { createNLDatesEntityProvider } from "./Providers/DateEntityProvider";

export default class Entities extends Plugin {
	settings: EntitiesSettings;

	async onload() {
		await this.loadSettings();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new EntitiesSettingTab(this.app, this));

		const folderProvider = createFolderEntityProvider(this, "People");
		const queryProvider = createDataviewQueryEntityProvider(
			this,
			"#project"
		);
		const nldatesProvider = createNLDatesEntityProvider(this);

		this.registerEditorSuggest(
			new EntitiesSuggestor(
				this,
				[folderProvider, queryProvider, nldatesProvider].filter(
					(provider) => provider !== undefined
				) as EntityProvider[]
			)
		);
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

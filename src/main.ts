import { Plugin, TFile } from "obsidian";
import { EntitiesSettingTab } from "./EntitiesSettings";
import { EntitiesSettings, DEFAULT_SETTINGS } from "./entities.types";
import { EntitiesSuggestor, EntityProvider } from "./EntitiesSuggestor";

export default class Entities extends Plugin {
	settings: EntitiesSettings;

	async onload() {
		await this.loadSettings();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new EntitiesSettingTab(this.app, this));


		const folderProvider = new EntityProvider((query: string) => {
			const entityFolder = this.app.vault.getFolderByPath("People");
			const entities: TFile[] | undefined = entityFolder?.children.filter(
				(file) => file instanceof TFile
			) as TFile[] | undefined;

			return entities?.map((file) => ({
				suggestionText: file.basename,
				icon: "user-circle", // Assuming 'p' stands for a specific icon type
				// noteText can be added here if available
			})) ?? [];
		});

		this.registerEditorSuggest(new EntitiesSuggestor(this, [folderProvider]));
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

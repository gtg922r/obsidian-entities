import { Plugin, TFile } from "obsidian";
import { EntitiesSettingTab } from "./EntitiesSettings";
import { EntitiesSettings, DEFAULT_SETTINGS } from "./entities.types";
import {
	EntitiesSuggestor,
	EntityProvider,
	EntitySuggestionItem,
} from "./EntitiesSuggestor";

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

			return (
				entities?.map((file) => ({
					suggestionText: file.basename,
					icon: "user-circle", // Assuming 'p' stands for a specific icon type
					// noteText can be added here if available
				})) ?? []
			);
		});

		const dataview = this.app.plugins.getPlugin("dataview");
		if (dataview) {
			console.log("✅ Dataview API Found");
		} else {
			console.log("❌ Dataview API Not Found");
		}
		const queryProvider = new EntityProvider((query: string) => {
			// This is where you would query the dataview plugin for entities
			const dv = this.app.plugins.getPlugin("dataview")?.api;
			const projects = dv.pages("#project");
			const projectEntities: EntitySuggestionItem[] = projects.map(
				(project: { file: { name: string } }) => ({
					suggestionText: project?.file?.name,
					icon: "briefcase",
				})
			).array() as EntitySuggestionItem[];
			const projectEntitiesFiltered = projectEntities.filter((project) =>
				project.suggestionText.toLowerCase().includes(query.toLowerCase())
			);
			return projectEntitiesFiltered;
		});

		this.registerEditorSuggest(
			new EntitiesSuggestor(this, [folderProvider, queryProvider])
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

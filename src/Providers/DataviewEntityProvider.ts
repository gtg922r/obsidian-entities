import { App, Plugin } from "obsidian";
import { getAPI, DataviewApi } from "obsidian-dataview";
import { DataviewProviderSettings } from "src/entities.types";
import { EntityProvider, EntitySuggestionItem } from "src/EntitiesSuggestor";

export class DataviewEntityProvider extends EntityProvider {
	config: DataviewProviderSettings;
	dv: DataviewApi | undefined;

	constructor(plugin: Plugin, private settings: DataviewProviderSettings) {
		super({
			plugin,
			description: `🧠 Dataview Entity Provider (${settings.query})`,
			entityCreationTemplates: settings.newEntityFromTemplates,
		});
		this.config = settings;
		this.initialize();
	}

	async initialize() {
		this.dv = await DataviewEntityProvider.getDataviewApiWithRetry(
			500,
			2,
			this.plugin.app
		);
		if (!this.dv) {
			console.log("❌ Dataview API Not Found");
		}
	}

	getEntityList(query: string): EntitySuggestionItem[] {
		const projects = this.dv?.pages(this.config.query);

		const projectEntitiesWithAliases = projects?.flatMap(
			(project: { file: { name: string; aliases: string[] } }) => {
				const baseEntity: EntitySuggestionItem = {
					suggestionText: project.file.name,
					icon: this.settings.icon ?? "box",
				};

				const projectEntities = [
					baseEntity,
					...project.file.aliases.map((alias: string) => ({
						suggestionText: alias,
						icon: this.settings.icon ?? "box",
						replacementText: `${project.file.name}|${alias}`,
					})),
				];

				return projectEntities;
			}
		);

		return projectEntitiesWithAliases.array();
	}

	static getDataviewApiWithRetry = (
		retryDelay: number,
		maxAttempts: number,
		app: App
	): Promise<DataviewApi | undefined> => {
		return new Promise((resolve) => {
			let attempts = 0;

			const attemptFetching = () => {
				attempts++;
				const dv: DataviewApi | undefined = getAPI(app);
				if (dv || attempts >= maxAttempts) {
					resolve(dv);
				} else {
					console.log(
						`Dataview API not found, retrying in ${retryDelay}ms...`
					);
					setTimeout(attemptFetching, retryDelay);
				}
			};

			attemptFetching();
		});
	};
}

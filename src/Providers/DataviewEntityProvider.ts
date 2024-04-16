import { Plugin } from "obsidian";
import { getAPI, DataviewApi } from "obsidian-dataview";
import { DataviewProviderSettings } from "src/entities.types";
import { EntityProvider, EntitySuggestionItem } from "src/EntitiesSuggestor";

export async function createDataviewQueryEntityProvider(
	plugin: Plugin,
	settings: DataviewProviderSettings
): Promise<EntityProvider | undefined> {
	const getDataviewApiWithRetry = (
		retryDelay: number,
		maxAttempts: number
	): Promise<DataviewApi | undefined> => {
		return new Promise((resolve) => {
			let attempts = 0;

			const attemptFetching = () => {
				attempts++;
				const dv: DataviewApi | undefined = getAPI(plugin.app);
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

	const dv: DataviewApi | undefined = await getDataviewApiWithRetry(500, 2);
	if (!dv) {
		console.log("❌ Dataview API Not Found");
		return undefined;
	}

	return new EntityProvider({
		plugin,
		description: `🧠 Dataview Entity Provider (${settings.query})`,
		entityCreationTemplates: settings.newEntityFromTemplates,
		getEntityList: (query: string) => {
			const projects = dv.pages(settings.query);

			const projectEntitiesWithAliases =
				projects?.flatMap(
					(project: {
						file: { name: string; aliases: string[] };
					}) => {
						const baseEntity: EntitySuggestionItem = {
							suggestionText: project.file.name,
							icon: settings.icon ?? "box",
						};

						const projectEntities = [
							baseEntity,
							...project.file.aliases.map((alias: string) => ({
								suggestionText: alias,
								icon: settings.icon ?? "box",
								replacementText: `${project.file.name}|${alias}`,
							})),
						];

						return projectEntities;
					}
				);

			return projectEntitiesWithAliases.array();
		},
	});
}

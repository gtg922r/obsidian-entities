import { Plugin } from "obsidian";
import { getAPI, DataviewApi } from "obsidian-dataview";
import { EntityProvider, EntitySuggestionItem } from "src/EntitiesSuggestor";

export function createDataviewQueryEntityProvider(plugin: Plugin, dataviewQuery:string): EntityProvider | undefined {

	const dv: DataviewApi = getAPI(this.app);
	if (!dv) {		
		console.log("❌ Dataview API Not Found");
		return undefined;
	}
	console.log(`Entities: 🧠 Dataview Entity Provider (${dataviewQuery}) added...`)
    return new EntityProvider(plugin, (query: string) => {
        const dv: DataviewApi = getAPI(plugin.app);
        const projects = dv?.pages(dataviewQuery);
        const projectEntities: EntitySuggestionItem[] = projects?.map(
            (project: { file: { name: string } }) => ({
                suggestionText: project?.file?.name,
                icon: "book-marked",
            })
        ).array() as EntitySuggestionItem[];
        // const projectEntitiesFiltered = projectEntities.filter((project) =>
        //     project.suggestionText.toLowerCase().includes(query.toLowerCase())
        // );
        return projectEntities;
    });
}

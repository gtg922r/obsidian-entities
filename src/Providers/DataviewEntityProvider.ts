import { Plugin } from "obsidian";
import { getAPI, DataviewApi } from "obsidian-dataview";
import { EntityProvider, EntitySuggestionItem } from "src/EntitiesSuggestor";

export async function createDataviewQueryEntityProvider(plugin: Plugin, dataviewQuery: string): Promise<EntityProvider | undefined> {
    const getDataviewApiWithRetry = (retryDelay: number, maxAttempts: number): Promise<DataviewApi | undefined> => {
        return new Promise((resolve) => {
            let attempts = 0;

            const attemptFetching = () => {
                attempts++;
                const dv: DataviewApi | undefined = getAPI(plugin.app);
                if (dv || attempts >= maxAttempts) {
                    resolve(dv);
                } else {
					console.log(`Dataview API not found, retrying in ${retryDelay}ms...`);
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

    console.log(`Entities: 🧠 Dataview Entity Provider (${dataviewQuery}) created...`);
    return new EntityProvider(plugin, (query: string) => {
        const projects = dv.pages(dataviewQuery);
        const projectEntities: EntitySuggestionItem[] = projects?.map(
            (project: { file: { name: string } }) => ({
                suggestionText: project?.file?.name,
                icon: "book-marked",
            })
        ).array() as EntitySuggestionItem[];
        return projectEntities;
    });
}

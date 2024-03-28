import { Plugin, TFile } from "obsidian";
import { EntityProvider } from "src/EntitiesSuggestor";

export function createFolderEntityProvider(plugin: Plugin, folderPath: string): EntityProvider {
	console.log(`Entities: 📂 Folder Entity Provider (${folderPath}) added...`)
    return new EntityProvider({
        plugin, 
        getEntityList: (query: string) => {
            const entityFolder = plugin.app.vault.getFolderByPath(folderPath);
            const entities: TFile[] | undefined = entityFolder?.children.filter(
                (file: unknown) => file instanceof TFile
            ) as TFile[] | undefined;

            return (
                entities?.map((file) => ({
                    suggestionText: file.basename,
                    icon: "user-circle",
                })) ?? []
            );
        }
    });
}


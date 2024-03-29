import { Plugin, TFile } from "obsidian";
import { FolderProviderSettings } from "src/entities.types";
import { EntityProvider } from "src/EntitiesSuggestor";

export function createFolderEntityProvider(
	plugin: Plugin,
	providerSettings: FolderProviderSettings
): EntityProvider {
	return new EntityProvider({
		plugin,
		description: `📂 Folder Entity Provider (${providerSettings.path})`,
		getEntityList: (query: string) => {
			const entityFolder = plugin.app.vault.getFolderByPath(
				providerSettings.path
			);
			const entities: TFile[] | undefined = entityFolder?.children.filter(
				(file: unknown) => file instanceof TFile
			) as TFile[] | undefined;

			return (
				entities?.map((file) => ({
					suggestionText: file.basename,
					icon: providerSettings.icon ?? "folder-open-dot",
				})) ?? []
			);
		},
		entityCreationTemplates: providerSettings.newEntityFromTemplates,
	});
}

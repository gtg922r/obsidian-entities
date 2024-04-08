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

			const aliasEntities = entities?.flatMap((file) => {
				const aliases = plugin.app.metadataCache.getFileCache(file)?.frontmatter?.aliases as string | string[] | undefined;
				if (typeof aliases === "string") return [{ ...file, basename: aliases }];
				return aliases ? aliases.map((alias) => ({ ...file, basename: alias })) : [];
			});
			entities?.push(...aliasEntities as TFile[]);

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

import { Plugin, TFile } from "obsidian";
import { FolderProviderSettings } from "src/entities.types";
import { EntityProvider, EntitySuggestionItem } from "src/EntitiesSuggestor";

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

			const entitySuggestions =
				entities?.map((file) => ({
					suggestionText: file.basename,
					icon: providerSettings.icon ?? "folder-open-dot",
				})) ?? [];

			const suggestionFromAlias: (
				alias: string,
				file: TFile
			) => EntitySuggestionItem = (alias: string, file: TFile) => ({
				suggestionText: alias,
				icon: providerSettings.icon ?? "folder-open-dot",
				replacementText: `${file.basename}|${alias}`,
			});

			const aliasEntitiesSuggestions = entities?.flatMap((file) => {
				const aliases = plugin.app.metadataCache.getFileCache(file)
					?.frontmatter?.aliases as string | string[] | undefined;
				if (typeof aliases === "string")
					return [suggestionFromAlias(aliases, file)];
				return aliases
					? aliases.map((alias) => suggestionFromAlias(alias, file))
					: [];
			});

			return aliasEntitiesSuggestions
				? [...entitySuggestions, ...aliasEntitiesSuggestions]
				: entitySuggestions;
		},
		entityCreationTemplates: providerSettings.newEntityFromTemplates,
	});
}

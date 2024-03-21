import { App, Plugin } from "obsidian";

export type ProviderConfiguration = { icon?: string } & (
	| {
			type: "folder";
			settings: FolderProviderSettings;
      }
	| {
			type: "dataview";
			settings: DataviewProviderSettings;
      }
	| {
			type: "noteFromTemplate";
			settings: TemplateProviderSettings;
      }
	| {
			type: "insertTemplate";
			settings: TemplateProviderSettings;
      }
);

export interface FolderProviderSettings {
	path: string;
}

export interface DataviewProviderSettings {
	query: string;
}

export interface TemplateProviderSettings {
	path: string;
}

export interface EntitiesSettings {
	providers: ProviderConfiguration[];
}

export const DEFAULT_SETTINGS: EntitiesSettings = {
	providers: [
		{ type: "folder", icon: "user-circle", settings: { path: "People" } },
		{
			type: "dataview",
			icon: "book-marked",
			settings: { query: "#project" },
		},
		{
			type: "noteFromTemplate",
			icon: "file-plus",
			settings: { path: "Templates" },
		},
		{
			type: "insertTemplate",
			icon: "file-plus",
			settings: { path: "Templates" },
		},
	],
};

export interface AppWithPlugins extends App {
	plugins: undefined | {
				getPlugin(pluginName: string): Plugin | undefined;
	};
}

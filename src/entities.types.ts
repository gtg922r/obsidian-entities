import { App, Plugin, TFile } from "obsidian";

export type createWithTemplateSettings = {
	engine: "disabled" | "core" | "templater";
	path: string;
};

export type ProviderConfiguration = { icon?: string } & (
	| {
			type: "folder";
			settings: FolderProviderSettings & ProviderTemplateCreationSettings;
	  }
	| {
			type: "dataview";
			settings: DataviewProviderSettings & ProviderTemplateCreationSettings;
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

export interface ProviderTemplateCreationSettings {
	createWithTemplate?: createWithTemplateSettings;
}

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

export interface TemplaterPlugin {
	templater?: {
		create_new_note_from_template?: (
			file: TFile | string,
			folderSetting: string,
			newTemplateName: string,
			openNewNote: boolean
		) => void;
		append_template_to_active_file?: (
			template_file: TFile
		) => Promise<void>;
	};
}

export const DEFAULT_SETTINGS: EntitiesSettings = {
	providers: [
		{
			type: "folder",
			icon: "user-circle",
			settings: {
				path: "People",
				createWithTemplate: {
					engine: "templater",
					path: "Templater/New Person.md",
				},
			},
		},
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
	plugins:
		| undefined
		| {
				getPlugin(pluginName: string): Plugin | undefined;
		  };
}

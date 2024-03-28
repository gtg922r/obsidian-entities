import { App, Plugin, TFile } from "obsidian";

export type entityFromTemplateSettings = {
	engine: "disabled" | "core" | "templater";
	templatePath: string;
	entityName: string;
};

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

export interface ProviderTemplateCreationSettings {
	newEntityFromTemplates?: entityFromTemplateSettings[];
} 

export interface FolderProviderSettings extends ProviderTemplateCreationSettings {
	path: string;
}

export interface DataviewProviderSettings extends ProviderTemplateCreationSettings {
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
				newEntityFromTemplates: [{
					engine: "templater",
					templatePath: "Templater/New Person.md",
					entityName: "Person",
				}],
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

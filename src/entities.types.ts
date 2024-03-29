import { App, Plugin, TFile } from "obsidian";

export type entityFromTemplateSettings = {
	engine: "disabled" | "core" | "templater";
	templatePath: string;
	entityName: string;
};

export type ProviderConfiguration = (
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

export interface CommonProviderSettings {
	icon?: string;
}

export interface FolderProviderSettings extends ProviderTemplateCreationSettings, CommonProviderSettings {
	path: string;
}

export interface DataviewProviderSettings extends ProviderTemplateCreationSettings, CommonProviderSettings {
	query: string;
}

export interface TemplateProviderSettings extends CommonProviderSettings {
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
	providers: [],
};

export interface AppWithPlugins extends App {
	plugins:
		| undefined
		| {
				getPlugin(pluginName: string): Plugin | undefined;
          };
}

import { App, Plugin, TFile } from "obsidian";
import { EntityProviderUserSettings } from "./Providers/EntityProvider";

export enum TriggerCharacter {
	At = "@", 		// `@` for Entities
	Colon = ":",    // `:` for Symbols
	Slash = "/",    // `/` for Commands
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DerivedFrom<T, Arguments extends unknown[] = any[]> = {
	new (...args: Arguments): T;
};
type PropertyKeys<T> = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[K in keyof T]: T[K] extends (...args: any[]) => any ? never : K;
  }[keyof T];
type MethodKeys<T> = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];
type Members<T> = Pick<T, PropertyKeys<T> | MethodKeys<T>>;

// DerivedClass type combining Methods and DerivedFrom
export type DerivedClassWithConstructorArgs<
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	T extends abstract new (...args: any) => any,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	Arguments extends unknown[] = any[]
> = Members<T> & DerivedFrom<InstanceType<T>, Arguments>;

export type entityFromTemplateSettings = {
	engine: "disabled" | "core" | "templater";
	templatePath: string;
	entityName: string;
	folderPath?: string; // Optional folder to create the new note in
};

export interface EntityFilter {
	type: "include" | "exclude";
	property: string;
	value: string;
}

export interface ProviderTemplateCreationSettings {
	newEntityFromTemplates?: entityFromTemplateSettings[];
} 

export interface EntitiesSettings {
	providerSettings: EntityProviderUserSettings[];
}
export interface TemplaterPlugin {
	templater?: {
		create_new_note_from_template?: (
			file: TFile | string,
			folderSetting: string,
			newTemplateName: string,
			openNewNote: boolean
		) => Promise<TFile | undefined>;
		append_template_to_active_file?: (
			template_file: TFile
		) => Promise<void>;
	};
}

export const DEFAULT_SETTINGS: EntitiesSettings = {
	providerSettings: [],
};

export interface AppWithPlugins extends App {
	plugins:
		| undefined
		| {
				getPlugin(pluginName: string): Plugin | undefined;
          };
}

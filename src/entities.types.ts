import { App, Plugin, TFile, TFolder, moment } from "obsidian";
import { ConfiguredProviderSettings } from "./Providers/EntityProvider";

export enum TriggerCharacter {
	At = "@", 		// `@` for Entities
	Colon = ":",    // `:` for Symbols
	Slash = "/",    // `/` for Commands
}

type DerivedFrom<T, Arguments extends unknown[] = any[]> = {
	new (...args: Arguments): T;
};
type PropertyKeys<T> = {
	[K in keyof T]: T[K] extends (...args: any[]) => any ? never : K;
  }[keyof T];
type MethodKeys<T> = {
	[K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];
type Members<T> = Pick<T, PropertyKeys<T> | MethodKeys<T>>;

// DerivedClass type combining Methods and DerivedFrom
export type DerivedClassWithConstructorArgs<
	T extends abstract new (...args: any) => any,
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
	schemaVersion: 1;
	providerSettings: ConfiguredProviderSettings[];
}
export interface TemplaterPlugin {
	templater?: {
		create_new_note_from_template?: (
			file: TFile | string,
			folderSetting: TFolder | string,
			newTemplateName: string,
			openNewNote: boolean
		) => Promise<TFile | undefined>;
	};
}

export type PeriodicNotesGranularity =
	| "day"
	| "week"
	| "month"
	| "quarter"
	| "year";

export interface PeriodicNotesConfig {
	enabled: boolean;
	openAtStartup: boolean;
	format: string;
	folder: string;
	templatePath?: string;
}

export interface PeriodicNotesCalendarSetManager {
	getActiveGranularities(): PeriodicNotesGranularity[];
	getActiveConfig(granularity: PeriodicNotesGranularity): PeriodicNotesConfig;
	getFormat(granularity: PeriodicNotesGranularity): string;
}

export interface PeriodicNotesPlugin extends Plugin {
	calendarSetManager?: PeriodicNotesCalendarSetManager;
	createPeriodicNote?: (
		granularity: PeriodicNotesGranularity,
		date: moment.Moment
	) => Promise<TFile | undefined>;
	getPeriodicNote?: (
		granularity: PeriodicNotesGranularity,
		date: moment.Moment
	) => TFile | null;
}

export const DEFAULT_SETTINGS: EntitiesSettings = {
	schemaVersion: 1,
	providerSettings: [],
};

export interface AppWithPlugins extends App {
	plugins:
		| undefined
		| {
					getPlugin(pluginName: string): Plugin | undefined;
					plugins?: Record<string, unknown>;
	          };
}

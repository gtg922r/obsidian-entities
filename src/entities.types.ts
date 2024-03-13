import { App, Plugin } from "obsidian";

export interface EntitiesSettings {
	mySetting: string;
}

export const DEFAULT_SETTINGS: EntitiesSettings = {
	mySetting: 'default'
}

export interface AppWithPlugins extends App {
    plugins: undefined | {
        getPlugin(pluginName: string): Plugin | undefined;
    };
}

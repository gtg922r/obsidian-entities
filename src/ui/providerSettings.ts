import type { Plugin, Setting, SettingDefinitionRender } from "obsidian";
import type { EntityProviderUserSettings } from "../Providers/EntityProvider";
import type { InputSuggestScope } from "./inputSuggestLifecycle";

/** A single rendered field bound to a captured scalar or whole-collection session. */
export interface ProviderField<Value> {
	readonly value: Value;
	readonly scope: InputSuggestScope;
	readonly pending: boolean;
	readonly active: boolean;
	set(value: Value): void;
	captureText(input: HTMLInputElement, property?: { read(value: Value): unknown; write(value: Value, text: unknown): Value }): void;
	beginEdit(): { apply(value: Value): void; cancel(): void };
	save(): void;
	reload(): void;
	edit(change: (value: Value) => Value, structural?: boolean): void;
}

/** Providers declare real native rows; only rendering allocates an edit session. */
export interface ProviderSettingsContext<Settings extends EntityProviderUserSettings> {
	readonly plugin: Plugin;
	settings(): Settings;
	row(name: string, desc: string, render: (setting: Setting, scope: InputSuggestScope) => void): SettingDefinitionRender;
	watch(scope: InputSuggestScope, refresh: () => void): void;
	value<Key extends keyof Settings>(key: Key): Settings[Key];
	field<Key extends keyof Settings>(key: Key, name: string, desc: string,
		render: (setting: Setting, field: ProviderField<Settings[Key]>) => void,
		options?: { manual?: boolean; validate?: (value: Settings[Key]) => string | undefined }): SettingDefinitionRender;
}

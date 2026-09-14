import { cloneSettings } from "../settingsData";
import {
	App,
	getAllTags,
	Plugin,
	Setting,
	TAbstractFile,
	TFile,
	TFolder,
} from "obsidian";
import { EntitySuggestionItem } from "src/suggestion.types";
import { EntityProvider, EntityProviderUserSettings } from "./EntityProvider";
import { TextInputSuggest, TextInputSuggestOptions } from "src/ui/suggest";
import { AppWithPlugins, EntityFilter } from "src/entities.types";
import { buildIconPickerSetting, buildTemplateCreationSetting } from "src/ui/providerSettingsComponents";
import { fileAliasSuggestions } from "./fileAliases";
import { FileSourceResult, filterSourceFiles } from "./fileSources";
import { buildFileAliasSettings, buildFileFilterSettings, buildFileSourceSetting } from "src/ui/fileProviderSettings";

const dataviewProviderTypeID = "dataview";

interface DataviewApi {
	pages(query: string): Iterable<unknown>;
}

interface DataviewPlugin {
	api?: DataviewApi;
}

export interface DataviewProviderUserSettings
	extends EntityProviderUserSettings {
	providerTypeID: string;
	query: string;
	propertyToCreateEntitiesFor?: string;
	shouldCreateEntitiesForAliases?: boolean | undefined;
	entityFilters?: EntityFilter[];
}

const defaultDataviewProviderUserSettings: DataviewProviderUserSettings = {
	providerTypeID: dataviewProviderTypeID,
	enabled: true,
	icon: "box",
	query: "",
	entityCreationTemplates: [],
	shouldCreateEntitiesForAliases: false,
	propertyToCreateEntitiesFor: undefined,
	entityFilters: [],
};

export class DataviewEntityProvider extends EntityProvider<DataviewProviderUserSettings> {
	get isQueryDependent(): boolean {
		return false;
	}

	static readonly providerTypeID: string = dataviewProviderTypeID;

	static getDescription(settings?: DataviewProviderUserSettings): string {
		if (settings) {
			return `🧠 Dataview entity provider (${settings.query})`;
		} else {
			return `Dataview entity provider`;
		}
	}

	getDescription(): string {
		return DataviewEntityProvider.getDescription(this.settings);
	}
	static getDefaultSettings(): DataviewProviderUserSettings {
		return cloneSettings(defaultDataviewProviderUserSettings);
	}

	getDefaultSettings(): DataviewProviderUserSettings {
		return DataviewEntityProvider.getDefaultSettings();
	}

	private static evaluateSource(settings: DataviewProviderUserSettings, plugin: Plugin): FileSourceResult {
		try {
			const dv = this.getDataviewApi(plugin.app);
			if (!dv) return { status: "unavailable", message: "Dataview unavailable — no file suggestions" };
			const pages = dv.pages(settings.query);
			if (!pages || typeof pages[Symbol.iterator] !== "function") {
				return { status: "error", message: "Invalid Dataview page collection — no file suggestions" };
			}
			const files = new Set<TFile>();
			for (const page of Array.from(pages)) {
				if (!page || typeof page !== "object") continue;
				const path = (page as { file?: { path?: unknown } }).file?.path;
				if (typeof path !== "string") continue;
				const file = plugin.app.vault.getAbstractFileByPath(path);
				if (file instanceof TFile) files.add(file);
			}
			return filterSourceFiles(Array.from(files), settings.entityFilters, plugin.app);
		} catch {
			return { status: "error", message: "Invalid Dataview source — no file suggestions" };
		}
	}

	getEntityList(query: string): EntitySuggestionItem[] {
		const result = DataviewEntityProvider.evaluateSource(this.settings, this.plugin);
		if (result.status !== "ready") return [];
		const icon = this.settings.icon ?? "box";
		return result.files.flatMap(file => [
			{ suggestionText: file.basename, target: { kind: "file" as const, file }, icon },
			...fileAliasSuggestions(file, this.plugin.app, this.settings, icon),
		]);
	}

	private static buildSourceSetting(
		row: Setting, settings: DataviewProviderUserSettings, save: (settings: DataviewProviderUserSettings) => void, plugin: Plugin
	): () => void {
		return buildFileSourceSetting(row, {
			label: "Dataview source", placeholder: "Dataview source", value: settings.query,
			onChange: value => { settings.query = value; save(settings); },
			evaluate: () => this.evaluateSource(settings, plugin),
			suggest: input => { new DataviewSourceSuggest(plugin.app, input, { shouldCloseIfNoSuggestions: true }); },
		});
	}

	static buildSummarySetting(
		settingContainer: Setting, settings: DataviewProviderUserSettings,
		onShouldSave: (newSettings: DataviewProviderUserSettings) => void, plugin: Plugin
	): void {
		this.buildSourceSetting(settingContainer, settings, onShouldSave, plugin);
	}

	static buildSimpleSettings(
		settingContainer: HTMLElement, settings: DataviewProviderUserSettings,
		onShouldSave: (newSettings: DataviewProviderUserSettings) => void, plugin: Plugin
	): void {
		buildIconPickerSetting(settingContainer, "Icon", settings, "box-select", () => onShouldSave(settings), plugin.app);
		const source = new Setting(settingContainer).setName("Dataview source")
			.setDesc("A source expression such as #person or a quoted folder; leave empty for all indexed pages. Alias and filter controls use the file’s frontmatter.");
		const updateSource = this.buildSourceSetting(source, settings, onShouldSave, plugin);
		buildFileAliasSettings(settingContainer, settings, false, onShouldSave, plugin.app);
		buildTemplateCreationSetting(settingContainer, settings, onShouldSave, plugin.app);
		buildFileFilterSettings(settingContainer, settings, onShouldSave, plugin.app, updateSource);
	}

	private static getDataviewApi(app: App): DataviewApi | undefined {
		const appWithPlugins = app as AppWithPlugins;
		const dataviewPlugin =
			(appWithPlugins.plugins?.getPlugin?.("dataview") as
				| DataviewPlugin
				| undefined) ??
			(appWithPlugins.plugins?.plugins?.dataview as
				| DataviewPlugin
				| undefined);
		const api = dataviewPlugin?.api;

		return api && typeof api.pages === "function" ? api : undefined;
	}
}

export class DataviewSourceSuggest extends TextInputSuggest<string> {
	private suggestions: Set<string> = new Set();

	constructor(app: App, inputEl: HTMLInputElement, options?: Partial<TextInputSuggestOptions>) {
		super(app, inputEl, options);
		this.initialize();
	}

	private initialize() {
		const abstractFiles = this.app.vault.getAllLoadedFiles();

		abstractFiles.forEach((fileOrFolder: TAbstractFile) => {
			if (fileOrFolder instanceof TFolder) {
				this.suggestions.add(fileOrFolder.path);
			} else if (fileOrFolder instanceof TFile) {
				const metadata = this.app.metadataCache.getFileCache(fileOrFolder);
				if (metadata) {
					getAllTags(metadata)?.forEach((tag) => {
						this.suggestions.add(tag);
					});
				}
			}
		});
	}

	getSuggestions(inputStr: string): string[] {
		const lowerCaseInputStr = inputStr.toLowerCase();
		return Array.from(this.suggestions).filter(suggestion =>
			suggestion.toLowerCase().includes(lowerCaseInputStr)
		);
	}

	renderSuggestion(query: string, el: HTMLElement): void {
		el.setText(query);
	}

	selectSuggestion(query: string): void {
		const inputStr = this.inputEl.value;
		const tagMatch = inputStr.match(/#\S*$/);
		const folderMatch = inputStr.match(/"\S*$/);
		const searchStr = tagMatch
			? tagMatch[0]
			: folderMatch
			? folderMatch[0].slice(1)
			: inputStr;

		const replaceStr = tagMatch
			? query
			: folderMatch
			? query + '"'
			: inputStr;

		// Replace only the current search term
		this.inputEl.value = inputStr.replace(searchStr, replaceStr);
		this.inputEl.trigger("input");
		this.close();
	}
}

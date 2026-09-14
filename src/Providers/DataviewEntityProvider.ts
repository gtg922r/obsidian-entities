import type { ProviderSettingsContext } from "../ui/providerSettings";
import { cloneSettings } from "../settingsData";
import {
	App,
	getAllTags,
	Plugin,
	TFile,
	TFolder,
} from "obsidian";
import { EntitySuggestionItem } from "src/suggestion.types";
import { EntityProvider, EntityProviderUserSettings } from "./EntityProvider";
import { TextInputSuggest } from "src/ui/suggest";
import { AppWithPlugins, EntityFilter } from "src/entities.types";
import { templateCreationSettings } from "src/ui/providerSettingsComponents";
import { fileAliasSuggestions } from "./fileAliases";
import { FileSourceResult, filterSourceFiles } from "./fileSources";
import { fileAliasSettings, fileFilterSettings, buildFileSourceSetting } from "src/ui/fileProviderSettings";

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

	static getSettingDefinitions(context: ProviderSettingsContext<DataviewProviderUserSettings>) {
		return [
			context.field("query", "Dataview source", "A source expression such as #person or a quoted folder; empty selects all indexed pages. Aliases and filters use file frontmatter.", (setting, field) => {
				const { update, input } = buildFileSourceSetting(setting, {
					label: "Dataview source", placeholder: "Dataview source", value: field.value,
					onChange: value => field.set(value), evaluate: () => this.evaluateSource(context.settings(), context.plugin),
					suggest: input => { new DataviewSourceSuggest(context.plugin.app, input, { additionalClasses: "entities-settings" }); },
				});
				field.captureText(input);
				context.watch(field.scope, update);
			}),
			...fileAliasSettings(context, false), ...templateCreationSettings(context), ...fileFilterSettings(context),
		];
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

/** Complete only the trailing folder/tag term of a Dataview source expression. */
export class DataviewSourceSuggest extends TextInputSuggest<string> {
	protected getCatalog(): string[] {
		const suggestions = new Set<string>();
		for (const file of this.app.vault.getAllLoadedFiles()) {
			if (file instanceof TFolder) {
				suggestions.add(`"${file.path}"`);
			} else if (file instanceof TFile) {
				const metadata = this.app.metadataCache.getFileCache(file);
				if (metadata) getAllTags(metadata)?.forEach(tag => suggestions.add(tag));
			}
		}
		return Array.from(suggestions);
	}

	protected filterCatalog(catalog: string[], query: string): string[] {
		const term = sourceTerm(query);
		if (!term) return [];
		return catalog.filter(item => (!term.kind || item.startsWith(term.kind)) && item.toLowerCase().includes(term.text.toLowerCase()));
	}

	renderSuggestion(query: string, el: HTMLElement): void {
		el.setText(query);
	}

	selectSuggestion(query: string): void {
		const input = this.inputEl.value;
		const term = sourceTerm(input);
		if (term) this.commitValue(input.slice(0, term.start) + query);
	}
}

// Recognize a trailing term only; this is not a Dataview expression parser.
function sourceTerm(input: string): { kind?: '"' | "#"; text: string; start: number } | undefined {
	const folder = /"[^"]*$/.exec(input);
	if (folder && (input.match(/"/g)?.length ?? 0) % 2 === 1) {
		return { kind: '"', text: folder[0], start: folder.index };
	}
	const tag = /#[^\s"()]*$/.exec(input);
	if (tag) return { kind: "#", text: tag[0], start: tag.index };
	if (input.trim() === "") return { text: "", start: input.length };
	return undefined;
}

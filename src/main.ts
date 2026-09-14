import { Events, Notice, Plugin } from "obsidian";
import { EntitiesSettingTab } from "./EntitiesSettings";
import { EntitiesSettings } from "./entities.types";
import { EditorBindings } from "./editorBindings";
import { EntitiesSuggestor } from "./EntitiesSuggestor";
import ProviderRegistry from "./Providers/ProviderRegistry";
import {
	FolderEntityProvider
} from "./Providers/FolderEntityProvider";
import {
	DataviewEntityProvider
} from "./Providers/DataviewEntityProvider";
import { TemplateEntityProvider } from "./Providers/TemplateProvider";
import { DateEntityProvider } from "./Providers/DateEntityProvider";
import { MetadataMenuProvider } from "./Providers/MetadataMenuProvider";
import { HelperEntityProvider } from "./Providers/HelperActionsProvider";
import { CharacterProvider } from "./Providers/CharacterProvider";

import { SettingsStore } from "./SettingsStore";
import { createProviderInstanceId } from "./settingsData";
import { claimSettingsHandoff } from "./settingsHandoff";
import { SettingsStorage } from "./SettingsStorage";
import { InputSuggestScope, runInputCleanups } from "./ui/inputSuggestLifecycle";

export default class Entities extends Plugin {
	inputSuggestions = new InputSuggestScope();
	settingsStore!: SettingsStore;
	private settingsTab?: EntitiesSettingTab;
	private unloaded = false;
	private waitForPreviousSettings: () => Promise<void> = async () => {};
	private settingsStorage!: SettingsStorage;

	get settings(): EntitiesSettings {
		return this.settingsStore.settings;
	}
	suggestor!: EntitiesSuggestor;
	providerRegistry!: ProviderRegistry;

	async onload() {
		this.unloaded = false;
		if (!this.inputSuggestions.active) this.inputSuggestions = new InputSuggestScope();
		this.providerRegistry = ProviderRegistry.initializeRegistry(this);
		this.registerEntityProviders();
		this.settingsStorage = new SettingsStorage(this.app, this.manifest);
		this.settingsStore = new SettingsStore(
			settings => this.settingsStorage.write(settings),
			original => this.settingsStorage.backup(original),
			type => this.providerRegistry.getProviderClasses().get(type)?.getDefaultSettings(),
			error => {
				new Notice(`Entities settings: ${error.message} Open settings to retry.`, 10000);
				this.settingsTab?.refreshIfDisplayed();
			},
			createProviderInstanceId,
			() => this.settingsTab?.clearSaveError()
		);
		this.waitForPreviousSettings = claimSettingsHandoff(this.app, this.manifest.id, this.settingsStore);
		const store = this.settingsStore;
		await this.loadSettings();
		if (this.unloaded || store.isClosed || this.settingsStore !== store) return;
		this.settingsTab = new EntitiesSettingTab(this.app, this);
		this.addSettingTab(this.settingsTab);
		const bindings = new EditorBindings(this.app);
		bindings.register(this);
		this.suggestor = new EntitiesSuggestor(this, this.providerRegistry, bindings);
		this.registerEditorSuggest(this.suggestor);
		const suggestor = this.suggestor;
		this.register(() => suggestor.dispose());
		const invalidateData = () => {
			if (!this.unloaded && this.suggestor === suggestor) suggestor.invalidateData();
		};
		this.registerEvent(this.app.vault.on("create", invalidateData));
		this.registerEvent(this.app.vault.on("rename", invalidateData));
		this.registerEvent(this.app.vault.on("delete", invalidateData));
		this.registerEvent(this.app.metadataCache.on("changed", invalidateData));
		this.registerEvent(this.app.metadataCache.on("deleted", invalidateData));
		this.registerEvent(this.app.metadataCache.on("resolved", invalidateData));
		// These integration events are emitted on MetadataCache, outside Obsidian's typed overloads.
		for (const event of [
			"dataview:metadata-change", "dataview:index-ready", "dataview:api-ready",
			"metadata-menu:indexed", "metadata-menu:fileclass-indexed", "metadata-menu:fields-changed",
		]) {
			this.registerEvent((this.app.metadataCache as Events).on(event, invalidateData));
		}
		this.app.workspace.onLayoutReady(invalidateData);
	}

	onunload() {
		this.unloaded = true;
		// Obsidian does not await this hook. Start draining immediately and report failures.
		runInputCleanups(
			() => { void this.settingsStore?.close(); },
			() => this.inputSuggestions.dispose(),
			() => this.suggestor?.dispose(),
			() => this.providerRegistry?.resetProviders()
		);
	}

	registerEntityProviders() {
		this.providerRegistry
			.registerProviderType(FolderEntityProvider)
			.registerProviderType(DataviewEntityProvider)
			.registerProviderType(TemplateEntityProvider)
			.registerProviderType(DateEntityProvider)
			.registerProviderType(MetadataMenuProvider)
			.registerProviderType(HelperEntityProvider)
			.registerProviderType(CharacterProvider);
	}

	loadEntityProviders() {
		if (this.unloaded) return;
		this.providerRegistry.instantiateProvidersFromSettings(
			this.settings.providerSettings
		);
	}

	async loadSettings(): Promise<boolean> {
		const store = this.settingsStore;
		const loaded = await store.load(async () => {
			await this.waitForPreviousSettings();
			return this.unloaded || store.isClosed ? undefined : this.settingsStorage.read();
		});
		if (loaded && !this.unloaded && !store.isClosed && this.settingsStore === store) this.loadEntityProviders();
		return loaded;
	}

	/** Flush pending edits; the store reports errors and retains changes for retry. */
	saveSettings(): Promise<boolean> {
		return this.settingsStore.flush();
	}
}

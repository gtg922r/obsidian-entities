import { Notice, Plugin } from "obsidian";
import { EntitiesSettingTab } from "./EntitiesSettings";
import { EntitiesSettings } from "./entities.types";
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

export default class Entities extends Plugin {
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
		this.providerRegistry = ProviderRegistry.initializeRegistry(this);
		this.registerEntityProviders();
		this.settingsStorage = new SettingsStorage(this.app, this.manifest);
		this.settingsStore = new SettingsStore(
			settings => this.settingsStorage.write(settings),
			original => this.settingsStorage.backup(original),
			type => this.providerRegistry.getProviderClasses().get(type)?.getDefaultSettings(),
			error => {
				new Notice(`Entities settings: ${error.message} Open settings to retry.`, 10000);
				this.settingsTab?.display();
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
		this.suggestor = new EntitiesSuggestor(this, this.providerRegistry);
		this.registerEditorSuggest(this.suggestor);
	}

	onunload() {
		this.unloaded = true;
		// Obsidian does not await this hook. Start draining immediately and report failures.
		void this.settingsStore?.close();
		this.providerRegistry?.resetProviders();
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
		this.providerRegistry.resetProviders();
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

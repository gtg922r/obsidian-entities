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

export default class Entities extends Plugin {
	settingsStore!: SettingsStore;
	private settingsTab?: EntitiesSettingTab;

	get settings(): EntitiesSettings {
		return this.settingsStore.settings;
	}
	suggestor!: EntitiesSuggestor;
	providerRegistry!: ProviderRegistry;

	async onload() {
		this.providerRegistry = ProviderRegistry.initializeRegistry(this);
		this.registerEntityProviders();
		this.settingsStore = new SettingsStore(
			settings => this.saveData(settings),
			original => this.backupSettings(original),
			type => this.providerRegistry.getProviderClasses().get(type)?.getDefaultSettings(),
			error => {
				new Notice(`Entities settings: ${error.message} Open settings to retry.`, 10000);
				this.settingsTab?.display();
			}
		);
		await this.loadSettings();
		this.settingsTab = new EntitiesSettingTab(this.app, this);
		this.addSettingTab(this.settingsTab);
		this.suggestor = new EntitiesSuggestor(this, this.providerRegistry);
		this.registerEditorSuggest(this.suggestor);
	}

	onunload() {
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
		const loaded = await this.settingsStore.load(() => this.loadData());
		if (loaded) this.loadEntityProviders();
		return loaded;
	}

	/** Flush pending edits; the store reports errors and retains changes for retry. */
	saveSettings(): Promise<boolean> {
		return this.settingsStore.flush();
	}

	/** Keep the original JSON document beside plugin data before its first migration write. */
	private async backupSettings(original: unknown): Promise<void> {
		const dir = this.manifest.dir;
		const pluginRoot = `${this.app.vault.configDir}/plugins/`;
		if (!dir || !dir.startsWith(pluginRoot) || dir.startsWith("/") || /[:\\]/.test(dir) ||
			dir.split("/").some(part => !part || part === "." || part === "..") ||
			dir.slice(pluginRoot.length).includes("/")) {
			throw new Error("Cannot locate a vault-relative plugin directory to back up settings.");
		}
		const adapter = this.app.vault.adapter;
		const path = `${dir}/data.before-settings-v1-${createProviderInstanceId()}.json`;
		if (await adapter.exists(path)) throw new Error("Settings backup already exists. Retry loading settings.");
		await adapter.write(path, JSON.stringify(original, null, "\t"));
	}
}

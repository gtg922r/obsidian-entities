import { Plugin, Setting } from "obsidian";
import { EntityProvider, EntityProviderID, EntityProviderUserSettings, ConfiguredProviderSettings, ProviderInstanceIdentity } from "./EntityProvider";
import { DerivedClassWithConstructorArgs } from "src/entities.types";
import { TriggerCharacter } from "src/entities.types";

interface ProviderRegistryClassMethods<T extends EntityProviderUserSettings> {
	getDescription(settings?: T): string;
	getDefaultSettings(): T;
	buildSummarySetting(
		settingContainer: Setting,
		settings: T,
		onShouldSave: (newSettings: T) => void,
		plugin: Plugin
	): void;
	buildSimpleSettings?(
		containerElement: HTMLElement,
		settings: T,
		onShouldSave: (newSettings: T) => void,
		plugin: Plugin
	): void;
	buildAdvancedSettings?(
		containerElement: HTMLElement,
		settings: T,
		onShouldSave: (newSettings: T) => void,
		plugin: Plugin
	): void;
}

export type RegisterableEntityProvider = DerivedClassWithConstructorArgs<
	EntityProviderID & typeof EntityProvider,
	[Plugin, ConfiguredProviderSettings]
> & ProviderRegistryClassMethods<EntityProviderUserSettings>;


/** Owns the current provider snapshot and its monotonically increasing revision. */
class ProviderRegistry {
	private static instance: ProviderRegistry;
	private plugin!: Plugin;
	private providerClasses: Map<string, RegisterableEntityProvider> = new Map();
	private providers: EntityProvider<EntityProviderUserSettings>[] = [];

	private currentRevision = 0;
	private changeListeners = new Set<() => void>();
	private eligibilityFailures = new WeakSet<EntityProvider<EntityProviderUserSettings>>();

	private constructor() {}

	get revision(): number {
		return this.currentRevision;
	}

	/** Observe atomic replacement; the owner must register the returned cleanup. */
	onChange(listener: () => void): () => void {
		this.changeListeners.add(listener);
		return () => this.changeListeners.delete(listener);
	}

	private replaceProviders(providers: EntityProvider<EntityProviderUserSettings>[]): void {
		this.providers = providers;
		this.currentRevision++;
		for (const listener of this.changeListeners) listener();
	}

	static initializeRegistry(plugin: Plugin): ProviderRegistry {
		const registry = ProviderRegistry.getInstance();
		registry.plugin = plugin;
		registry.providerClasses.clear();
		registry.resetProviders();
		return registry;
	}

	static getInstance(): ProviderRegistry {
		if (!ProviderRegistry.instance) {
			ProviderRegistry.instance = new ProviderRegistry();
		}
		return ProviderRegistry.instance;
	}

	registerProviderType(
		providerClass: RegisterableEntityProvider
	): ProviderRegistry {
		this.providerClasses.set(
			providerClass.providerTypeID,
			providerClass
			// TODO: ProviderClass<EntityProviderUserSettings> also seemed to be working
		);
		return this;
	}

	instantiateProvider<T extends EntityProviderUserSettings>(
		settings: T & ProviderInstanceIdentity
	): ProviderRegistry {
		const provider = this.constructProvider(settings);
		if (provider) this.replaceProviders([...this.providers, provider]);
		return this;
	}

	private constructProvider(settings: ConfiguredProviderSettings): EntityProvider<EntityProviderUserSettings> | undefined {
		const providerClass = this.providerClasses.get(settings.providerTypeID);
		if (!providerClass) return undefined; // Preserve unavailable rows in the settings store.
		try {
			return new providerClass(this.plugin, settings);
		} catch (error) {
			console.error(`Entities: provider ${settings.providerInstanceId} construction failed.`, error);
			return undefined;
		}
	}

	resetProviders(): void {
		this.replaceProviders([]);
	}

	/** Construct each configured row independently, then publish one complete snapshot. */
	instantiateProvidersFromSettings(settingsList: ConfiguredProviderSettings[]): void {
		if (!this.plugin) {
			throw new Error("ProviderRegistry needs to be initialized before loading providers.");
		}
		const providers = settingsList.flatMap(settings => {
			const provider = this.constructProvider(settings);
			return provider ? [provider] : [];
		});
		this.replaceProviders(providers);
	}

	getProviders(): readonly EntityProvider<EntityProviderUserSettings>[] {
		return this.providers;
	}

	getProviderClasses(): Map<string, RegisterableEntityProvider> {
		return this.providerClasses;
	}

	getProvidersForTrigger(trigger: TriggerCharacter): EntityProvider<EntityProviderUserSettings>[] {
		return this.providers.filter(provider => {
			try {
				return provider.isEnabled && provider.triggers.includes(trigger);
			} catch (error) {
				if (!this.eligibilityFailures.has(provider)) {
					this.eligibilityFailures.add(provider);
					console.error(`Entities: provider ${provider.providerInstanceId} eligibility failed.`, error);
				}
				return false;
			}
		});
	}
}

export default ProviderRegistry;

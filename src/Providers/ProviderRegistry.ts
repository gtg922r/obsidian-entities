import { Plugin, Setting } from "obsidian";
import { EntityProvider, EntityProviderID, EntityProviderUserSettings } from "./EntityProvider";
import { DerivedClassWithConstructorArgs } from "src/entities.types";


interface ProviderRegistryClassMethods<T extends EntityProviderUserSettings> {
	getDescription(settings: T): string;
	buildSummarySetting(
		settingContainer: Setting,
		settings: T,
		onShouldSave: (newSettings: T) => void
	): void;
	buildSimpleSettings?(
		settings: T,
		onShouldSave: (newSettings: T) => void
	): void;
	buildAdvancedSettings?(
		settings: T,
		onShouldSave: (newSettings: T) => void
	): void;
}

export type RegisterableEntityProvider = DerivedClassWithConstructorArgs<
	EntityProviderID & typeof EntityProvider,
	[Plugin, EntityProviderUserSettings]
> & ProviderRegistryClassMethods<EntityProviderUserSettings>;


// Class to handle provider registration and instantiation using Singleton pattern
class ProviderRegistry {
	private static instance: ProviderRegistry;
	private plugin: Plugin;
	private providerClasses: Map<string, RegisterableEntityProvider> = new Map();
	private providers: EntityProvider<EntityProviderUserSettings>[] = [];

	private constructor() {}

	static initializeRegistry(plugin: Plugin): ProviderRegistry {
		const registry = ProviderRegistry.getInstance();
		registry.plugin = plugin;
		registry.providerClasses.clear();
		registry.providers = [];
		console.log(`Entities:\t✨ Provider Registry initialized.`);
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
		console.log(`Entities:\t └── "${providerClass.providerTypeID}" Provider Type Registered.`);
		return this;
	}

	instantiateProvider<T extends EntityProviderUserSettings>(
		settings: T
	): ProviderRegistry {
		const providerClass = this.providerClasses.get(settings.providerTypeID);
		if (providerClass) {
			const providerInstance = new providerClass(
				this.plugin,
				settings
			)
			console.log(
				`Entities:\t └── ${providerClass.getDescription(
					settings
				)} added...`
			);
			this.providers.push(providerInstance);
			return this;
		} else {
			console.error(`Entities:\tProvider type "${settings.providerTypeID}" not found.`);
			return this;
		}
	}

	resetProviders(): void {
		this.providers = [];
	}

	instantiateProvidersFromSettings(
		settingsList: EntityProviderUserSettings[]
	): void {
		if (!this.plugin) {
			throw new Error(
				"ProviderRegistry needs to be initialized before loading providers."
			);
		}
		console.log(`Entities:\t🔄 Loading entity providers...`);

		settingsList.forEach((settings) => {
			this.instantiateProvider(settings);
		});
	}

	getProviders(): EntityProvider<EntityProviderUserSettings>[] {
		return this.providers;
	}

	getProviderClasses(): Map<string, RegisterableEntityProvider> {
		return this.providerClasses;
	}
}

export default ProviderRegistry;

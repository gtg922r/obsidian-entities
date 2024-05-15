import { Plugin } from "obsidian";
import { EntityProvider, EntityProviderID, EntityProviderUserSettings } from "./EntityProvider";
import { DerivedClassWithConstructorArgs } from "src/entities.types";

export type RegisterableEntityProvider = DerivedClassWithConstructorArgs<
	EntityProviderID & typeof EntityProvider,
	[Plugin, EntityProviderUserSettings]
>;


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
	): void {
		this.providerClasses.set(
			providerClass.providerTypeID,
			providerClass
			// TODO: ProviderClass<EntityProviderUserSettings> also seemed to be working
		);
		console.log(`Entities: \tProvider type "${providerClass.providerTypeID}" registered.`);
	}

	instantiateProvider<T extends EntityProviderUserSettings>(
		settings: T
	): EntityProvider<T> | null {
		const providerClass = this.providerClasses.get(settings.providerTypeID);
		if (providerClass) {
			const providerInstance = new providerClass(
				this.plugin,
				settings
			) as EntityProvider<T>;
			console.log(
				`Entities: \tProvider "${providerClass.getDescription(
					settings
				)}" instantiated.`
			);
			this.providers.push(providerInstance);
			return providerInstance;
		}
		return null;
	}

	loadProvidersFromSettings(
		settingsList: EntityProviderUserSettings[]
	): void {
		if (!this.plugin) {
			throw new Error(
				"ProviderRegistry needs to be initialized before loading providers."
			);
		}
		this.providers = settingsList
			.map((settings) => this.instantiateProvider(settings))
			.filter(
				(
					provider
				): provider is EntityProvider<EntityProviderUserSettings> =>
					provider !== null
			);
	}

	getProviders(): EntityProvider<EntityProviderUserSettings>[] {
		return this.providers;
	}
}

export default ProviderRegistry;

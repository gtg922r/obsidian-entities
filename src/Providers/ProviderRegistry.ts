import { Plugin } from "obsidian";
import { EntityProvider, EntityProviderUserSettings } from "./EntityProvider";

// Define type alias for constructor signature
type ProviderConstructor<T extends EntityProviderUserSettings> = new (
	plugin: Plugin,
	settings: T
) => EntityProvider<T>;

// Class to handle provider registration and instantiation using Singleton pattern
class ProviderRegistry {
	private static instance: ProviderRegistry;
	private plugin: Plugin;
	private providerClasses: Map<
		string,
		typeof EntityProvider & ProviderConstructor<EntityProviderUserSettings>
	> = new Map();
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
	// TODO: WHAT TO DO ABOUT THE PLUGIN ARGUMENT FOR ENTITYPROVIER?
	registerProviderType<T extends EntityProviderUserSettings>(
		providerType: string,
		providerClass: typeof EntityProvider<T> & ProviderConstructor<T>
	): void {
		this.providerClasses.set(
			providerType,
			providerClass as typeof EntityProvider & ProviderConstructor<T>
		);
		// TODO: ensure reload registry from settings in case someone is registering new providers after the initial load, and the settings object was assuming the existence of those
		// probably should add a callback for loading providers unless any other plugins want to add providers early
	}

	instantiateProvider<T extends EntityProviderUserSettings>(
		settings: T
	): EntityProvider<T> | null {
		const providerClass = this.providerClasses.get(
			settings.providerType
		) as ProviderConstructor<T> | undefined;
		if (providerClass) {
			return new providerClass(this.plugin, settings);
		}
		return null;
	}

	loadProvidersFromSettings(
		settingsList: EntityProviderUserSettings[]
	): void {
		if (!this.plugin) {
			throw new Error("ProviderRegistry needs to be initialized before loading providers.");
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

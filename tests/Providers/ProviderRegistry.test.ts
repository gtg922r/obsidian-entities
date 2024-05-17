import ProviderRegistry from "../../src/Providers/ProviderRegistry";
import {
	EntityProvider,
	EntityProviderUserSettings,
} from "../../src/Providers/EntityProvider";
import { App, Plugin } from "obsidian";

// Mocking the necessary Obsidian interfaces and classes inline
jest.mock("obsidian", () => {
	return {
		Plugin: class {
			app: jest.MockedObject<App>;
			constructor(app: App) {
				this.app = app;
			}
		},
	};
});

// Creating a mock for the Entities plugin
const mockPlugin = {
	app: {}, // Mock the app object as needed
} as unknown as Plugin;

// Mock EntityProvider for testing
const mockProviderTypeID = "Mock Entity Provider";
interface MockEntityProviderUserSettings extends EntityProviderUserSettings {
	providerTypeID: typeof mockProviderTypeID;
	mockSetting: string | undefined;
}

class MockEntityProvider extends EntityProvider<MockEntityProviderUserSettings> {
	constructor(plugin: Plugin, settings: MockEntityProviderUserSettings) {
		super(mockPlugin, settings);
	}
	
	static readonly providerTypeID = mockProviderTypeID;
	static getDescription(settings: MockEntityProviderUserSettings): string {
		return `Mock Entity Provider (${settings.mockSetting})`;
	}
	static buildSummarySetting(settings: MockEntityProviderUserSettings, onShouldSave: (newSettings: MockEntityProviderUserSettings) => void): void {
		console.log("MockEntityProvider.buildSummarySetting called");
	}


	getDefaultSettings(): MockEntityProviderUserSettings {
		return {
			providerTypeID: mockProviderTypeID,
			enabled: true,
			icon: "mock-icon",
			mockSetting: "mock-setting",
		};
	}
	getEntityList(query: string) {
		return [];
	}
}

describe("ProviderRegistry tests", () => {
	let registry: ProviderRegistry;

	beforeEach(() => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(ProviderRegistry as any).instance = null;
		ProviderRegistry.initializeRegistry(mockPlugin);
		registry = ProviderRegistry.getInstance();
	});

	test("getInstance should return a singleton instance", () => {
		const instance1 = ProviderRegistry.getInstance();
		const instance2 = ProviderRegistry.getInstance();
		expect(instance1).toBe(instance2);
	});

	test("registerProviderType should register a provider class", () => {
		registry.registerProviderType(MockEntityProvider);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const providerClass = (registry as any).providerClasses.get(mockProviderTypeID);
		expect(providerClass).toBe(MockEntityProvider);
	});

	test("instantiateProvider should create an instance of a registered provider", () => {
		registry.registerProviderType(MockEntityProvider);
		const settings: MockEntityProviderUserSettings = {
			providerTypeID: mockProviderTypeID,
			enabled: true,
			icon: "mock-icon",
			mockSetting: "mock-setting",
		};
		registry.instantiateProvider<MockEntityProviderUserSettings>(settings);
		const providers = registry.getProviders();
		expect(providers.length).toBe(1);
		expect(providers[0]).toBeInstanceOf(MockEntityProvider);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((providers[0] as any).settings).toEqual(settings);
	});

	test("instantiateProvider should not add an unregistered provider", () => {
		const settings: EntityProviderUserSettings = {
			providerTypeID: "unregistered",
			enabled: true,
			icon: "mock-icon",
		};
		registry.instantiateProvider(settings);
		const providers = registry.getProviders();
		expect(providers.length).toBe(0);
	});

	test("loadProvidersFromSettings should instantiate providers from settings", () => {
		registry.registerProviderType(MockEntityProvider);
		const settingsList: EntityProviderUserSettings[] = [
			{ providerTypeID: mockProviderTypeID, enabled: true, icon: "mock-icon" },
		];
		registry.instantiateProvidersFromSettings(settingsList);
		const providers = registry.getProviders();
		expect(providers.length).toBe(1);
		expect(providers[0]).toBeInstanceOf(MockEntityProvider);
	});

	test("getProviders should return the list of instantiated providers", () => {
		registry.registerProviderType(MockEntityProvider);
		const settingsList: EntityProviderUserSettings[] = [
			{ providerTypeID: mockProviderTypeID, enabled: true, icon: "mock-icon" },
		];
		registry.instantiateProvidersFromSettings(settingsList);
		const providers = registry.getProviders();
		expect(providers.length).toBe(1);
		expect(providers[0]).toBeInstanceOf(MockEntityProvider);
	});
});

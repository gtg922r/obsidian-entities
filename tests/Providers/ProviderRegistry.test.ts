import ProviderRegistry from "../../src/Providers/ProviderRegistry";
import {
	EntityProvider,
	EntityProviderUserSettings,
	ConfiguredProviderSettings,
} from "../../src/Providers/EntityProvider";
import { TriggerCharacter } from "../../src/entities.types";
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
	mockSetting?: string;
}

class MockEntityProvider extends EntityProvider<MockEntityProviderUserSettings> {
	constructor(plugin: Plugin, settings: ConfiguredProviderSettings) {
		super(mockPlugin, settings as MockEntityProviderUserSettings & ConfiguredProviderSettings);
	}
	
	static readonly providerTypeID = mockProviderTypeID;
	static getDescription(settings: MockEntityProviderUserSettings): string {
		return `Mock Entity Provider (${settings.mockSetting})`;
	}
	getDescription(): string {
		return MockEntityProvider.getDescription(this.settings);
	}
	static buildSummarySetting(
		settingContainer: unknown,
		settings: MockEntityProviderUserSettings,
		onShouldSave: (newSettings: MockEntityProviderUserSettings) => void,
		plugin: Plugin
	): void {
		console.log("MockEntityProvider.buildSummarySetting called");
	}

	static getDefaultSettings(): MockEntityProviderUserSettings {
		return {
			providerTypeID: mockProviderTypeID,
			enabled: true,
			icon: "mock-icon",
			mockSetting: "mock-setting",
		};
	}

	getDefaultSettings(): MockEntityProviderUserSettings {
		return MockEntityProvider.getDefaultSettings();
	}

	getEntityList(query: string) {
		return [];
	}
}

describe("ProviderRegistry tests", () => {
	let registry: ProviderRegistry;

	beforeEach(() => {
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
		const providerClass = (registry as any).providerClasses.get(mockProviderTypeID);
		expect(providerClass).toBe(MockEntityProvider);
	});

	test("instantiateProvider should create an instance of a registered provider", () => {
		registry.registerProviderType(MockEntityProvider);
		const settings: MockEntityProviderUserSettings & ConfiguredProviderSettings = {
			providerInstanceId: "test-instance",
			providerTypeID: mockProviderTypeID,
			enabled: true,
			icon: "mock-icon",
			mockSetting: "mock-setting",
		};
		registry.instantiateProvider<MockEntityProviderUserSettings>(settings);
		const providers = registry.getProviders();
		expect(providers.length).toBe(1);
		expect(providers[0]).toBeInstanceOf(MockEntityProvider);
		expect((providers[0] as any).settings).toEqual(settings);
	});

	test("instantiateProvider should not add an unregistered provider", () => {
		const settings: ConfiguredProviderSettings = {
			providerInstanceId: "test-instance",
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
		const settingsList: ConfiguredProviderSettings[] = [
			{ providerInstanceId: "test-instance", providerTypeID: mockProviderTypeID, enabled: true, icon: "mock-icon" },
		];
		registry.instantiateProvidersFromSettings(settingsList);
		const providers = registry.getProviders();
		expect(providers.length).toBe(1);
		expect(providers[0]).toBeInstanceOf(MockEntityProvider);
	});

	test("getProviders should return the list of instantiated providers", () => {
		registry.registerProviderType(MockEntityProvider);
		const settingsList: ConfiguredProviderSettings[] = [
			{ providerInstanceId: "test-instance", providerTypeID: mockProviderTypeID, enabled: true, icon: "mock-icon" },
		];
		registry.instantiateProvidersFromSettings(settingsList);
		const providers = registry.getProviders();
		expect(providers.length).toBe(1);
		expect(providers[0]).toBeInstanceOf(MockEntityProvider);
	});

	test("getProvidersForTrigger should exclude disabled providers", () => {
		registry.registerProviderType(MockEntityProvider);
		const enabledSettings: MockEntityProviderUserSettings & ConfiguredProviderSettings = {
			providerInstanceId: "enabled-instance",
			providerTypeID: mockProviderTypeID,
			enabled: true,
			icon: "mock-icon",
			mockSetting: "enabled",
		};
		const disabledSettings: MockEntityProviderUserSettings & ConfiguredProviderSettings = {
			providerInstanceId: "disabled-instance",
			providerTypeID: mockProviderTypeID,
			enabled: false,
			icon: "mock-icon",
			mockSetting: "disabled",
		};
		registry.instantiateProvider(enabledSettings);
		registry.instantiateProvider(disabledSettings);

		const providers = registry.getProvidersForTrigger(TriggerCharacter.At);
		expect(providers.length).toBe(1);
	});
});

jest.mock("../../src/userComponents", () => ({ EntitiesNotice: jest.fn() }));

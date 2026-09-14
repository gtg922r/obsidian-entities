import type { App, DataAdapter, FileStats, PluginManifest } from "obsidian";
import type { EntitiesSettings } from "../src/entities.types";
import { encodeSettings, parseSettingsSnapshot, SettingsStorage } from "../src/SettingsStorage";
import { createProviderInstanceId } from "../src/settingsData";

jest.mock("../src/settingsData", () => ({ createProviderInstanceId: jest.fn() }));

const directory = "vault-config/plugins/entities";
const dataPath = `${directory}/data.json`;
const file: FileStats = { type: "file", ctime: 0, mtime: 0, size: 1 };
const folder: FileStats = { ...file, type: "folder" };
const raw = "{\n  \"schemaVersion\": 1, \"providerSettings\": [], \"unknown\": [null, \"é\"]\n}\n";

function setup(dir: string | undefined = directory) {
	const adapter = {
		stat: jest.fn<ReturnType<DataAdapter["stat"]>, Parameters<DataAdapter["stat"]>>().mockResolvedValue(file),
		read: jest.fn<ReturnType<DataAdapter["read"]>, Parameters<DataAdapter["read"]>>().mockResolvedValue(raw),
		write: jest.fn<ReturnType<DataAdapter["write"]>, Parameters<DataAdapter["write"]>>().mockResolvedValue(undefined),
	};
	const app = { vault: { configDir: "vault-config", adapter } } as unknown as App;
	const storage = new SettingsStorage(app, { dir } as PluginManifest);
	return { storage, adapter };
}

beforeEach(() => {
	jest.mocked(createProviderInstanceId).mockReset().mockReturnValue("snapshot-id");
});

describe("settings snapshot representation", () => {
	test("encoding uses tabs and retains unknown JSON data", () => {
		const value = { known: [], unknown: { nested: [false, null, "é"] } };
		expect(encodeSettings(value)).toBe(JSON.stringify(value, null, "\t"));
		expect(encodeSettings(value)).toContain("\n\t\"unknown\"");
		expect(parseSettingsSnapshot({ kind: "file", raw: encodeSettings(value) })).toEqual(value);
	});

	test("missing, null, and empty objects stay distinct", () => {
		expect(parseSettingsSnapshot({ kind: "missing" })).toBeUndefined();
		expect(parseSettingsSnapshot({ kind: "file", raw: "null" })).toBeNull();
		expect(parseSettingsSnapshot({ kind: "file", raw: "{}" })).toEqual({});
	});

	test.each(["", "{private-content", "{\"secret\": private-content}"])("invalid JSON produces only a content-free error", invalid => {
		expect(() => parseSettingsSnapshot({ kind: "file", raw: invalid }))
			.toThrow(new Error("Saved settings contain invalid JSON. Restore or repair the file, then retry."));
	});

	test.each([undefined, Symbol("private-content"), () => {}])("encoding rejects values without a JSON representation", value => {
		expect(() => encodeSettings(value)).toThrow("Settings cannot be encoded as JSON.");
	});
});

describe("strict settings reads", () => {
	test("captures exact content without parsing or normalizing it", async () => {
		const { storage, adapter } = setup();
		expect(await storage.readSnapshot()).toEqual({ kind: "file", raw });
		expect(adapter.stat).toHaveBeenCalledWith(dataPath);
		expect(adapter.read).toHaveBeenCalledWith(dataPath);
		adapter.read.mockResolvedValue("{invalid");
		expect(await storage.readSnapshot()).toEqual({ kind: "file", raw: "{invalid" });
	});

	test("only a null stat reports absence, without reading", async () => {
		const { storage, adapter } = setup();
		adapter.stat.mockResolvedValue(null);
		expect(await storage.readSnapshot()).toEqual({ kind: "missing" });
		expect(await storage.read()).toBeUndefined();
		expect(adapter.read).not.toHaveBeenCalled();
	});

	test.each([folder, undefined as unknown as FileStats])("non-file or ambiguous stat fails without reading", async stat => {
		const { storage, adapter } = setup();
		adapter.stat.mockResolvedValue(stat);
		await expect(storage.readSnapshot()).rejects.toThrow("The settings path is not a readable file.");
		expect(adapter.read).not.toHaveBeenCalled();
	});

	test("propagates stat rejection without treating it as absence", async () => {
		const { storage, adapter } = setup();
		const error = new Error("stat failed");
		adapter.stat.mockRejectedValue(error);
		await expect(storage.readSnapshot()).rejects.toBe(error);
		expect(adapter.read).not.toHaveBeenCalled();
	});

	test("propagates a read failure after a successful stat", async () => {
		const { storage, adapter } = setup();
		const error = new Error("read failed");
		adapter.read.mockRejectedValue(error);
		await expect(storage.readSnapshot()).rejects.toBe(error);
	});

	test.each([undefined, null, 42])("refuses an unexpected non-text read result", async result => {
		const { storage, adapter } = setup();
		adapter.read.mockResolvedValue(result as unknown as string);
		await expect(storage.readSnapshot()).rejects.toThrow("The settings file could not be read as text.");
	});

	test("legacy read parses the same strict snapshot and preserves parse failures", async () => {
		const { storage, adapter } = setup();
		expect(await storage.read()).toEqual(JSON.parse(raw));
		adapter.read.mockResolvedValue("null");
		expect(await storage.read()).toBeNull();
		adapter.read.mockResolvedValue("private-content");
		await expect(storage.read()).rejects.toThrow("Saved settings contain invalid JSON. Restore or repair the file, then retry.");
	});
});

describe("strict settings writes and backups", () => {
	test("writes the exact snapshot and propagates write rejection", async () => {
		const { storage, adapter } = setup();
		await storage.writeSnapshot(raw);
		expect(adapter.write).toHaveBeenCalledWith(dataPath, raw);
		const error = new Error("write failed");
		adapter.write.mockRejectedValue(error);
		await expect(storage.writeSnapshot(raw)).rejects.toBe(error);
	});

	test.each([
		["migration", "data.before-settings-v1"],
		["external-recovery", "data.before-external-reconcile"],
	] as const)("%s backup preserves exact raw content at its separate path", async (reason, prefix) => {
		const { storage, adapter } = setup();
		adapter.stat.mockResolvedValue(null);
		await storage.backupSnapshot(raw, reason);
		const path = `${directory}/${prefix}-snapshot-id.json`;
		expect(adapter.stat).toHaveBeenCalledWith(path);
		expect(adapter.write).toHaveBeenCalledWith(path, raw);
	});

	test("each backup gets a fresh unique candidate path", async () => {
		const { storage, adapter } = setup();
		adapter.stat.mockResolvedValue(null);
		jest.mocked(createProviderInstanceId).mockReturnValueOnce("first").mockReturnValueOnce("second");
		await storage.backupSnapshot(raw, "external-recovery");
		await storage.backupSnapshot(raw, "external-recovery");
		expect(adapter.write.mock.calls.map(([path]) => path)).toEqual([
			`${directory}/data.before-external-reconcile-first.json`,
			`${directory}/data.before-external-reconcile-second.json`,
		]);
	});

	test.each([file, folder, undefined as unknown as FileStats])("an occupied or ambiguous backup path prevents writing", async stat => {
		const { storage, adapter } = setup();
		adapter.stat.mockResolvedValue(stat);
		await expect(storage.backupSnapshot(raw, "external-recovery"))
			.rejects.toThrow("Settings backup already exists. Retry loading settings.");
		expect(adapter.write).not.toHaveBeenCalled();
	});

	test("backup stat failures propagate without writing", async () => {
		const { storage, adapter } = setup();
		const error = new Error("backup stat failed");
		adapter.stat.mockRejectedValue(error);
		await expect(storage.backupSnapshot(raw, "migration")).rejects.toBe(error);
		expect(adapter.write).not.toHaveBeenCalled();
	});

	test("backup write failures propagate after strict collision checking", async () => {
		const { storage, adapter } = setup();
		const error = new Error("backup write failed");
		adapter.stat.mockResolvedValue(null);
		adapter.write.mockRejectedValue(error);
		await expect(storage.backupSnapshot(raw, "external-recovery")).rejects.toBe(error);
	});

	test("legacy write and backup delegate using the shared encoding", async () => {
		const { storage, adapter } = setup();
		const settings: EntitiesSettings = { schemaVersion: 1, providerSettings: [] };
		await storage.write(settings);
		expect(adapter.write).toHaveBeenCalledWith(dataPath, encodeSettings(settings));
		adapter.stat.mockResolvedValue(null);
		const original = { providerSettings: [], unknown: "keep" };
		await storage.backup(original);
		expect(adapter.write).toHaveBeenCalledWith(`${directory}/data.before-settings-v1-snapshot-id.json`, encodeSettings(original));
	});
});

test.each(["", "/vault-config/plugins/entities", "vault-config/plugins/../entities", "vault-config/plugins/entities/child",
	"vault-config/plugins//entities", "vault-config/plugins/.", "vault-config/plugins/ent:ities", "vault-config/plugins/ent\\ities", "other/plugins/entities"])(
	"invalid plugin directory %j is rejected before adapter IO", async dir => {
		const { storage, adapter } = setup(dir);
		await expect(storage.readSnapshot()).rejects.toThrow("Cannot locate a vault-relative plugin directory for settings.");
		await expect(storage.writeSnapshot(raw)).rejects.toThrow("Cannot locate a vault-relative plugin directory for settings.");
		await expect(storage.backupSnapshot(raw, "migration")).rejects.toThrow("Cannot locate a vault-relative plugin directory for settings.");
		expect(adapter.stat).not.toHaveBeenCalled();
		expect(adapter.read).not.toHaveBeenCalled();
		expect(adapter.write).not.toHaveBeenCalled();
	}
);

import type { App, PluginManifest } from "obsidian";
import type { EntitiesSettings } from "./entities.types";
import { createProviderInstanceId } from "./settingsData";

/** Settings IO must propagate adapter failures instead of treating them as success. */
export class SettingsStorage {
	constructor(private readonly app: App, private readonly manifest: PluginManifest) {}

	private directory(): string {
		const dir = this.manifest.dir;
		const pluginRoot = `${this.app.vault.configDir}/plugins/`;
		if (!dir || !dir.startsWith(pluginRoot) || dir.startsWith("/") || /[:\\]/.test(dir) ||
			dir.split("/").some(part => !part || part === "." || part === "..") ||
			dir.slice(pluginRoot.length).includes("/")) {
			throw new Error("Cannot locate a vault-relative plugin directory for settings.");
		}
		return dir;
	}

	/** Only an absent file means first install; JSON null and read/parse errors are not absence. */
	async read(): Promise<unknown> {
		const path = `${this.directory()}/data.json`;
		const adapter = this.app.vault.adapter;
		// exists() also returns false on permission/IO failures in host adapters.
		const stat = await adapter.stat(path);
		if (stat === null) return undefined;
		if (!stat || stat.type !== "file") throw new Error("The settings path is not a readable file.");
		const raw = await adapter.read(path);
		try {
			return JSON.parse(raw) as unknown;
		} catch {
			// JSON.parse messages may quote private contents. Keep the error content-free.
			throw new Error("Saved settings contain invalid JSON. Restore or repair the file, then retry.");
		}
	}

	async write(settings: EntitiesSettings): Promise<void> {
		await this.app.vault.adapter.write(`${this.directory()}/data.json`, JSON.stringify(settings, null, "\t"));
	}

	/** Preserve original JSON values before the first migration or repair write. */
	async backup(original: unknown): Promise<void> {
		const path = `${this.directory()}/data.before-settings-v1-${createProviderInstanceId()}.json`;
		const adapter = this.app.vault.adapter;
		if (await adapter.stat(path) !== null) throw new Error("Settings backup already exists. Retry loading settings.");
		await adapter.write(path, JSON.stringify(original, null, "\t"));
	}
}

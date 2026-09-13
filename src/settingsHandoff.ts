import type { SettingsStore } from "./SettingsStore";

interface PersistenceHandoff {
	drain(): Promise<boolean>;
}

const holderKey = Symbol.for("gtg922r.obsidian-entities.settings-handoff.v1");
type HandoffHolder = WeakMap<object, Map<string, PersistenceHandoff>>;

/**
 * Wait for the previous plugin instance before reading disk. The window holder
 * survives module reload; weak app ownership isolates vaults without retaining them.
 */
export function claimSettingsHandoff(app: object, pluginId: string, store: SettingsStore): () => Promise<void> {
	const host = window as unknown as { [key: symbol]: HandoffHolder | undefined };
	const holder = host[holderKey] ?? (host[holderKey] = new WeakMap());
	let plugins = holder.get(app);
	if (!plugins) {
		plugins = new Map();
		holder.set(app, plugins);
	}
	let predecessor = plugins.get(pluginId);
	const waitForPredecessor = async (): Promise<void> => {
		if (predecessor && !await predecessor.drain()) {
			throw new Error("The previous plugin instance could not save its settings. Retry loading to finish that save before reading settings.");
		}
		predecessor = undefined;
	};
	plugins.set(pluginId, {
		drain: async () => {
			// Close immediately even if this instance is still waiting to read settings.
			const ownDrain = store.close();
			try {
				await waitForPredecessor();
				await ownDrain;
				return !store.hasPendingSave;
			} catch {
				return false;
			}
		},
	});
	return waitForPredecessor;
}

import { Plugin } from "obsidian";
import type { EntityProvider, EntityProviderUserSettings } from "./Providers/EntityProvider";
import ProviderRegistry from "./Providers/ProviderRegistry";
import { EntitiesModalInput, EntitiesModalInputOptions } from "./userComponents";

interface PromptLifetime {
	active: boolean;
	prompts: Set<EntitiesModalInput>;
}

const lifetimes = new WeakMap<Plugin, PromptLifetime>();

/** Revalidate at the caller's engine boundary, including the final promise continuation. */
export interface CreationNamePromptResult {
	name: string | undefined;
	isCurrent: () => boolean;
}

function lifetimeFor(plugin: Plugin): PromptLifetime {
	let lifetime = lifetimes.get(plugin);
	if (!lifetime) {
		lifetime = { active: true, prompts: new Set() };
		lifetimes.set(plugin, lifetime);
		const owned = lifetime;
		plugin.register(() => {
			owned.active = false;
			for (const prompt of owned.prompts) prompt.close();
			owned.prompts.clear();
		});
	}
	return lifetime;
}

/** Settle owned prompts on unload/reconfiguration and refuse engine work after a stale prompt. */
export async function promptForCreationName(provider: EntityProvider<EntityProviderUserSettings>, options: EntitiesModalInputOptions): Promise<CreationNamePromptResult> {
	const lifetime = lifetimeFor(provider.plugin);
	const registry = ProviderRegistry.getInstance();
	const revision = registry.revision;
	const isCurrent = () => lifetime.active && registry.revision === revision && registry.getProviders().includes(provider);
	if (!isCurrent()) return { name: undefined, isCurrent };
	const modal = new EntitiesModalInput(provider.plugin.app, options);
	lifetime.prompts.add(modal);
	const unsubscribe = registry.onChange(() => modal.close());
	try {
		modal.open();
		const name = await modal.getInput();
		return { name, isCurrent };
	} finally {
		unsubscribe();
		lifetime.prompts.delete(modal);
		modal.close();
	}
}

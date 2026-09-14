import { App, DropdownComponent, PluginSettingTab, Setting, SettingDefinitionItem, SettingDefinitionRender } from "obsidian";
import type Entities from "./main";
import type { EntityProviderUserSettings } from "./Providers/EntityProvider";
import { SettingsFieldDraft } from "./settingsDraft";
import { cloneSettings } from "./settingsData";
import { EntitiesNotice } from "./userComponents";
import { InputSuggestScope, runInputCleanups } from "./ui/inputSuggestLifecycle";
import { NativeSettingsLifetime } from "./ui/nativeSettingsLifetime";
import type { ProviderSettingsContext } from "./ui/providerSettings";
import { iconSetting } from "./ui/providerSettingsComponents";

/** One native searchable tree with tab-lifetime drafts and individually owned renders. */
export class EntitiesSettingTab extends PluginSettingTab {
	private lifetime: NativeSettingsLifetime;
	private drafts = new Map<string, Map<string, SettingsFieldDraft<unknown>>>();
	private rows = new WeakMap<Setting, SettingsFieldDraft<unknown>>();
	private renders = new Map<SettingsFieldDraft<unknown>, Map<InputSuggestScope, () => void>>();
	private labels = new Map<string, string>();
	private labelSequence = 0;
	private storageRows = new Set<() => void>();
	private disposed = false;
	private watchers = new Map<string, Set<() => void>>();

	constructor(app: App, readonly plugin: Entities) {
		super(app, plugin);
		this.lifetime = new NativeSettingsLifetime(() => this.containerEl, plugin.inputSuggestions, () => super.update());
		plugin.inputSuggestions.own(plugin.providerRegistry.onChange?.(() => {
			for (const id of this.drafts.keys()) if (!this.canonical(id)) this.retire(id);
		}) ?? (() => {}));
		plugin.inputSuggestions.own(() => {
			this.disposed = true;
			for (const fields of this.drafts.values()) for (const draft of fields.values()) draft.retire();
			this.drafts.clear();
			this.renders.clear();
			this.storageRows.clear();
			this.watchers.clear();
		});
	}

	/** Native key callbacks carry no render identity and must never enter default persistence. */
	getControlValue(_key: string): unknown { return undefined; }
	setControlValue(_key: string, _value: unknown): void {
		try { new EntitiesNotice("This settings control is unavailable. Reopen the settings page; no change was applied.", "alert-triangle"); }
		catch { console.warn("Entities: unexpected native settings control; no change applied."); }
	}

	update(): void { this.lifetime?.update(); }

	hide(): void {
		runInputCleanups(() => this.lifetime.hide(), () => super.hide(), () => { void this.plugin.saveSettings(); });
	}

	/** Storage notifications update in place, preserving focused inputs and pending composition. */
	refreshIfDisplayed(): void { for (const update of this.storageRows) update(); }
	clearSaveError(): void { this.refreshIfDisplayed(); }

	private canonical(id: string): EntityProviderUserSettings | undefined {
		return this.plugin.settingsStore.settings.providerSettings.find(provider => provider.providerInstanceId === id);
	}

	private retire(id: string): void {
		for (const draft of this.drafts.get(id)?.values() ?? []) {
			draft.retire();
			this.retireRenders(draft);
		}
		this.drafts.delete(id);
	}

	private retireRenders(draft: SettingsFieldDraft<unknown>): void {
		runInputCleanups(...[...this.renders.get(draft)?.keys() ?? []].map(scope => () => scope.dispose()));
	}

	private context(id: string): ProviderSettingsContext<EntityProviderUserSettings> {
		const settings = () => {
			const value = this.canonical(id) as unknown as Record<string, unknown>;
			for (const [key, draft] of this.drafts.get(id) ?? []) if (draft.dirty) value[key] = draft.value;
			return value as unknown as EntityProviderUserSettings;
		};
		return {
			plugin: this.plugin, settings, row: (name, desc, render) => this.row(name, desc, render),
			watch: (scope, refresh) => {
				let watchers = this.watchers.get(id);
				if (!watchers) this.watchers.set(id, watchers = new Set());
				const guarded = scope.guard(refresh);
				watchers.add(guarded);
				scope.own(() => { watchers.delete(guarded); if (!watchers.size) this.watchers.delete(id); });
				guarded();
			},
			value: key => {
				const detached = this.drafts.get(id)?.get(key);
				return cloneSettings(detached?.dirty ? detached.value : this.canonical(id)?.[key]) as never;
			},
			field: (key, name, desc, render, options) => ({ name, desc, render: setting => {
				if (this.disposed || !this.canonical(id)) return;
				let fields = this.drafts.get(id);
				if (!fields) this.drafts.set(id, fields = new Map());
				let draft = this.rows.get(setting);
				if (!draft || draft.providerId !== id || draft.key !== key || !draft.active) draft = fields.get(key);
				if (!draft) fields.set(key, draft = new SettingsFieldDraft(this.plugin.settingsStore, id, key));
				draft.refresh();
				this.rows.set(setting, draft);
				const captured = draft;
				const status = setting.controlEl.createDiv({ cls: "entities-draft-status" });
				let reload: HTMLElement | undefined;
				let validation: string | undefined;
				const describe = () => {
					if (status) status.textContent = validation ?? (captured.result === "conflict"
						? `Changed in another view. This draft was not applied. ${options?.manual ? "Use Discard recipe changes to discard it." : "Reload this field to discard it."}`
						: captured.result === "unavailable" ? "Change not applied: this provider is unavailable."
							: captured.dirty ? "Pending edit." : "");
					if (reload) reload.hidden = !captured.dirty && captured.result !== "conflict";
				};
				const apply = () => {
					if (this.lifetime.composing) { this.lifetime.whenSettled(scope, apply); return; }
					validation = options?.validate?.(captured.value as never);
					const result = validation ? "unchanged" : captured.apply();
					if (result === "accepted") this.plugin.loadEntityProviders();
					for (const update of this.renders.get(captured)?.values() ?? []) update();
					for (const refresh of this.watchers.get(id) ?? []) refresh();
					this.refreshDomState();
				};
				let captureText: ((start: boolean) => void) | undefined;
				const ownership = this.lifetime.render(setting.settingEl, phase => {
					if (phase !== "input") captureText?.(phase === "start");
					if ((phase === "commit" || phase === "input") && !options?.manual) apply();
				});
				const { scope } = ownership;
				let renders = this.renders.get(captured);
				if (!renders) this.renders.set(captured, renders = new Map());
				renders.set(scope, describe);
				scope.own(() => {
					captureText = undefined;
					renders.delete(scope);
					if (!renders.size) this.renders.delete(captured);
				});
				const edit = scope.guard((change: (value: unknown) => unknown, structural = false) => {
					const stage = () => {
						if (!captured.active) return;
						captured.stage(change(captured.value));
						if (!options?.manual) this.lifetime.whenSettled(scope, apply);
						else {
							for (const update of this.renders.get(captured)?.values() ?? []) update();
							for (const refresh of this.watchers.get(id) ?? []) refresh();
						}
						if (structural) { this.retireRenders(captured); this.update(); }
					};
					// Capture the composing leaf before a structural change can shift its local index.
					if (structural) this.lifetime.whenSettled(scope, stage);
					else stage();
				});
				render(setting, {
					value: captured.value as never, scope, get pending() { return captured.dirty; }, get active() { return scope.active && captured.active; },
					beginEdit: () => {
						if (!scope.active || !captured.active) return { apply: () => {}, cancel: () => {} };
						const child = captured.fork();
						let settled = false;
						const release = scope.own(() => child.retire());
						return {
							cancel: () => { settled = true; release(); child.retire(); },
							apply: scope.guard(value => {
								if (settled || !captured.active) return;
								settled = true;
								child.stage(value);
								const result = child.apply();
								release();
								// Publish this operation for future renders; old callbacks still own their retired session.
								fields.set(key, child);
								captured.retire(); this.retireRenders(captured);
								if (result === "accepted") this.plugin.loadEntityProviders();
								this.update();
							}),
						};
					},
					save: () => this.lifetime.whenSettled(scope, apply),
					captureText: (input, property) => {
						let originalText: string;
						let originalValue: unknown;
						captureText = start => {
							if (start) {
								originalText = input.value;
								originalValue = property ? property.read(captured.value as never) : captured.value;
							} else {
								const text = input.value === originalText ? originalValue : input.value;
								captured.stage(property ? property.write(captured.value as never, text) : text);
							}
						};
					},
					reload: () => { if (scope.active) { captured.reload(); this.retireRenders(captured); this.update(); } },
					set: value => { edit(() => value); },
					edit: (change, structural) => { edit(value => change(value as never), structural); },
				});
				setting.controlEl.append(status);
				status.setAttribute("role", "status");
				if (!options?.manual) setting.addButton(button => {
					reload = button.buttonEl;
					button.setButtonText("Reload field").onClick(scope.guard(() => {
						captured.reload();
						this.retireRenders(captured);
						this.update();
					}));
				});
				describe();
				return () => scope.dispose();
			} }),
		};
	}

	private row(name: string, desc: string, render: (setting: Setting, scope: InputSuggestScope) => void): SettingDefinitionRender {
		return { name, desc, render: setting => {
			if (this.disposed) return;
			const { scope } = this.lifetime.render(setting.settingEl, () => {});
			render(setting, scope);
			return () => scope.dispose();
		} };
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const store = this.plugin.settingsStore;
		if (store.loadError) return [this.row("Settings could not be loaded", "Saved data has not been changed.", (setting, scope) => {
			setting.setDesc(`${store.loadError?.message} Fix the saved file or restore a backup, then retry.`)
				.addButton(button => button.setButtonText("Retry load").onClick(scope.guard(async () => {
					await this.plugin.loadSettings();
					if (scope.active) this.update();
				})));
		})];
		if (store.isReadOnly || this.disposed) return [{ name: "Settings unavailable", desc: "Settings cannot be edited in this session." }];
		const providers = store.settings.providerSettings;
		for (const id of this.drafts.keys()) if (!providers.some(provider => provider.providerInstanceId === id)) this.retire(id);
		const classes = this.plugin.providerRegistry.getProviderClasses();
		return [
			this.row("Settings storage", "Applied changes save automatically. Pending recipe changes require Apply recipe changes.", (setting, scope) => {
				let retry: HTMLElement;
				const update = () => {
					setting.setDesc(store.saveError ? `${store.saveError.message} Changes are still in memory; retry saving.` : "Applied changes save automatically. Pending recipe changes require Apply recipe changes.");
					retry.hidden = !store.saveError;
				};
				setting.addButton(button => {
					retry = button.buttonEl;
					button.setButtonText("Retry save").onClick(scope.guard(async () => { await this.plugin.saveSettings(); if (scope.active) update(); }));
				});
				this.storageRows.add(update);
				scope.own(() => this.storageRows.delete(update));
				update();
			}),
			this.row("Add new provider", "Choose a provider type.", (setting, scope) => {
				let dropdown: DropdownComponent;
				setting.addDropdown(component => {
					dropdown = component;
					for (const [id, type] of classes) component.addOption(id, type.getDescription());
				}).addButton(button => button.setButtonText("Add provider").onClick(scope.guard(() => {
					const type = classes.get(dropdown.getValue());
					if (type && store.addProvider(type.getDefaultSettings())) { this.plugin.loadEntityProviders(); this.update(); }
				})));
			}),
			...providers.map(provider => {
				const id = provider.providerInstanceId;
				const type = classes.get(provider.providerTypeID);
				let name = this.labels.get(id);
				if (!name) this.labels.set(id, name = `${({ folder: "Folder", dataview: "Dataview", template: "Templates", nlDates: "Dates", "metadata-menu": "Metadata Menu", helper: "Helpers", characterProvider: "Characters" } as Record<string, string>)[provider.providerTypeID] ?? type?.getDescription() ?? "Unavailable provider"} ${++this.labelSequence}`);
				const context = this.context(id);
				return {
					type: "page" as const, name,
					desc: type?.getDescription(provider) ?? `Unavailable provider type: ${provider.providerTypeID}. Its settings are preserved.`,
					items: type ? [
						...(["helper", "characterProvider", "template"].includes(provider.providerTypeID) ? [] : [iconSetting(context, "icon", "Icon", "Icon for the entities returned by this provider.", provider.icon || "box-select")]),
						...type?.getSettingDefinitions?.(context) ?? [],
						this.row("Remove provider", "Remove this configured provider.", (setting, scope) => {
							setting.addButton(button => button.setButtonText("Remove provider").onClick(scope.guard(() => {
								if (!store.deleteProvider(id)) return;
								this.retire(id); this.plugin.loadEntityProviders(); this.update();
							})));
						}),
					] : [{ name: "Provider unavailable", desc: "Its settings are preserved." }],
				};
			}),
			this.row("Reload providers", "Manually reload providers for troubleshooting.", (setting, scope) => {
				setting.addButton(button => button.setButtonText("Reload").onClick(scope.guard(() => this.plugin.loadEntityProviders())));
			}),
		];
	}
}

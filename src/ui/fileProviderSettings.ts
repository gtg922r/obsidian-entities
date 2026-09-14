import { ExtraButtonComponent, Setting, SettingDefinitionItem } from "obsidian";
import { EntityFilter } from "../entities.types";
import { classifyFilter, compileFilters } from "../Providers/EntityFilters";
import { aliasSelectorError, FileAliasSettings } from "../Providers/fileAliases";
import { FileSourceResult } from "../Providers/fileSources";
import { FrontmatterKeySuggest } from "./FrontmatterKeySuggest";
import { setValidationStatus } from "./validationStatus";
import { inputSuggestScope } from "./inputSuggestLifecycle";
import type { ProviderSettingsContext } from "./providerSettings";
import type { EntityProviderUserSettings } from "../Providers/EntityProvider";

/** Build synchronous source feedback; persistence feedback remains owned by SettingsStore. */
export function buildFileSourceSetting(
	setting: Setting,
	options: {
		label: string;
		placeholder: string;
		value: string;
		onChange: (value: string) => void;
		evaluate: () => FileSourceResult;
		suggest: (input: HTMLInputElement) => void;
	}
): { update: () => void; input: HTMLInputElement } {
	let input!: HTMLInputElement;
	let status: ExtraButtonComponent;
	const update = () => {
		const result = options.evaluate();
		if (result.status !== "ready") {
			setValidationStatus(status, "alert-triangle", result.message, "error");
		} else {
			setValidationStatus(status, "search-check",
				`${options.label} valid (${result.files.length} qualifying file${result.files.length === 1 ? "" : "s"} of ${result.total} source file${result.total === 1 ? "" : "s"})`,
				result.files.length ? "neutral" : "warning");
		}
	};
	setting.addExtraButton(button => { status = button; button.setDisabled(true); });
	setting.addText(text => {
		input = text.inputEl;
		text.setPlaceholder(options.placeholder).setValue(options.value).onChange(inputSuggestScope(setting.settingEl)!.guard(value => {
			if (!text.inputEl.isConnected) return;
			options.onChange(value);
		}));
		options.suggest(text.inputEl);
	});
	return { update, input };
}

/** Native aliases and an optional exact frontmatter key remain independent scalar fields. */
export function fileAliasSettings<T extends EntityProviderUserSettings & FileAliasSettings>(context: ProviderSettingsContext<T>, nativeDefault: boolean): SettingDefinitionItem[] {
	return [
		context.field("shouldCreateEntitiesForAliases", "Suggest native aliases", "Also find and link existing files by their Obsidian aliases.", (setting, field) => {
			setting.addToggle(toggle => toggle.setValue(field.value ?? nativeDefault).onChange(value => field.set(value as T["shouldCreateEntitiesForAliases"])));
		}),
		context.field("propertyToCreateEntitiesFor", "Frontmatter alias property", "Optional exact frontmatter key. Empty turns off custom aliases.", (setting, field) => {
			setting.addText(text => {
				text.setPlaceholder("Property name").setValue(typeof field.value === "string" ? field.value : "").onChange(value => field.set(value as T["propertyToCreateEntitiesFor"]));
				new FrontmatterKeySuggest(context.plugin.app, text.inputEl);
				field.captureText(text.inputEl);
			});
			context.watch(field.scope, () => setting.setDesc(aliasSelectorError(context.value("propertyToCreateEntitiesFor")) ?? "Optional exact frontmatter key, such as ldap. Its text or list of text values adds aliases linking to the same file. Empty turns this off."));
		}),
	];
}

/** Each searchable filter field edits the same captured whole-collection session. */
export function fileFilterSettings<T extends EntityProviderUserSettings & { entityFilters?: EntityFilter[] }>(context: ProviderSettingsContext<T>): SettingDefinitionItem[] {
	const filters = context.value("entityFilters");
	if (filters !== undefined && (!Array.isArray(filters) || filters.some(filter => {
		const result = classifyFilter(filter);
		return result.status === "invalid" && result.malformed;
	}))) return [{ name: "Entity filters unavailable", desc: compileFilters(filters).error ?? "Invalid filter configuration" }];
	return [
		{ type: "group", heading: "Entity filters", items: [context.field("entityFilters", "Add filter", "All active filters must pass. Include matches any supported value; exclude matches none.", (setting, field) => {
			setting.addButton(button => button.setButtonText("Add filter").onClick(() => field.edit(list => [...list ?? [], { type: "include", property: "", value: "" }] as T["entityFilters"], true)));
		})] },
		...filters?.map((_, index) => {
			const label = `Filter ${index + 1}`;
			const update = (list: EntityFilter[] | undefined, changes: Partial<EntityFilter>) => list?.map((filter, position) => position === index ? { ...filter, ...changes } : filter) as T["entityFilters"];
			return { type: "group" as const, heading: label, items: [
				context.field("entityFilters", `${label} matching`, "Include or exclude matching frontmatter values.", (setting, field) => {
					setting.addDropdown(dropdown => dropdown.addOption("include", "Include if").addOption("exclude", "Exclude if").setValue(field.value![index].type)
						.onChange(value => { if (value === "include" || value === "exclude") field.edit(list => update(list, { type: value })); }));
				}),
				context.field("entityFilters", `${label} property`, "Exact frontmatter property name.", (setting, field) => {
					setting.addText(text => {
						text.setPlaceholder("Property name").setValue(field.value![index].property).onChange(value => field.edit(list => update(list, { property: value })));
						new FrontmatterKeySuggest(context.plugin.app, text.inputEl);
						field.captureText(text.inputEl, { read: list => list?.[index].property, write: (list, value) => update(list, { property: value as string }) });
					});
				}),
				context.field("entityFilters", `${label} pattern`, "Case-insensitive regular expression. Empty filters are inactive.", (setting, field) => {
					setting.addText(text => {
						text.setPlaceholder("Property value/regex").setValue(field.value![index].value).onChange(value => field.edit(list => update(list, { value })));
						field.captureText(text.inputEl, { read: list => list?.[index].value, write: (list, value) => update(list, { value: value as string }) });
					});
					context.watch(field.scope, () => {
						const result = classifyFilter(context.value("entityFilters")?.[index]);
						setting.setDesc(result.status === "active" ? "Active filter — case-insensitive regex" : result.message);
					});
				}),
				context.field("entityFilters", `Remove filter ${index + 1}`, "Remove this filter.", (setting, field) => {
					setting.addButton(button => button.setButtonText("Remove filter").onClick(() => field.edit(list => list?.filter((_, position) => position !== index) as T["entityFilters"], true)));
				}),
			] };
		}) ?? [],
	];
}

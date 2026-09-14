import { App, ExtraButtonComponent, Setting } from "obsidian";
import { EntityFilter } from "../entities.types";
import { classifyFilter, compileFilters } from "../Providers/EntityFilters";
import { aliasSelectorError, FileAliasSettings } from "../Providers/fileAliases";
import { FileSourceResult } from "../Providers/fileSources";
import { FrontmatterKeySuggest } from "./FrontmatterKeySuggest";
import { setValidationStatus } from "./validationStatus";

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
): () => void {
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
		text.setPlaceholder(options.placeholder).setValue(options.value).onChange(value => {
			if (!text.inputEl.isConnected) return;
			options.onChange(value);
			if (text.inputEl.isConnected) update();
		});
		options.suggest(text.inputEl);
	});
	update();
	return update;
}

/** Native aliases and one exact frontmatter key are independent of each other. */
export function buildFileAliasSettings<T extends FileAliasSettings>(
	container: HTMLElement, settings: T, nativeDefault: boolean, save: (settings: T) => void, app: App
): void {
	new Setting(container)
		.setName("Suggest native aliases")
		.setDesc("Also find and link existing files by their Obsidian aliases.")
		.addToggle(toggle => toggle.setValue(settings.shouldCreateEntitiesForAliases ?? nativeDefault).onChange(value => {
			settings.shouldCreateEntitiesForAliases = value;
			save(settings);
		}));
	const property = new Setting(container).setName("Frontmatter alias property");
	const describe = () => property.setDesc(aliasSelectorError(settings.propertyToCreateEntitiesFor)
		?? "Optional exact frontmatter key, such as ldap. Its text or list of text values adds aliases linking to the same file. Empty turns this off.");
	describe();
	property.addText(text => {
		text.setPlaceholder("Property name").setValue(typeof settings.propertyToCreateEntitiesFor === "string" ? settings.propertyToCreateEntitiesFor : "");
		text.onChange(value => { settings.propertyToCreateEntitiesFor = value; save(settings); describe(); });
		new FrontmatterKeySuggest(app, text.inputEl, { shouldCloseIfNoSuggestions: true });
	});
}

/** Edit the whole filter array through the existing R1 draft callback; detached controls cannot resubmit it. */
export function buildFileFilterSettings<T extends { entityFilters?: EntityFilter[] }>(
	container: HTMLElement, settings: T, save: (settings: T) => void, app: App, onUpdated: () => void
): void {
	let generation = 0;
	const heading = new Setting(container).setName("Entity filters").setHeading()
		.setDesc("All active filters must pass. Include matches any supported frontmatter value; exclude matches none. Matching is case-insensitive.");
	const rows = container.createDiv();
	const commit = (structural: boolean) => {
		save(settings);
		// R1 closes a conflicted modal. Never rebuild its rejected draft or update its status.
		if (!rows.isConnected) return;
		if (structural) rebuild();
		onUpdated();
	};
	const rebuild = () => {
		generation++;
		rows.empty();
		const filters = settings.entityFilters;
		if (filters !== undefined && (!Array.isArray(filters) || filters.some(filter => {
			const result = classifyFilter(filter);
			return result.status === "invalid" && result.malformed;
		}))) {
			new Setting(rows).setDesc(compileFilters(filters).error ?? "Invalid filter configuration");
			return;
		}
		filters?.forEach((filter, index) => {
			const rowGeneration = generation;
			const row = new Setting(rows);
			const current = () => rowGeneration === generation && row.settingEl.isConnected;
			let status: ExtraButtonComponent;
			const describe = () => {
				const result = classifyFilter(filter);
				const message = result.status === "active" ? "Active filter — case-insensitive regex" : result.message;
				row.setDesc(message);
				setValidationStatus(status, result.status === "active" ? "checkmark" : "alert-triangle", message,
					result.status === "invalid" ? "error" : result.status === "inactive" ? "muted" : "neutral");
			};
			const edit = (change: () => void) => {
				if (!current()) return;
				change();
				commit(false);
				if (current()) describe();
			};
			row.addExtraButton(button => { status = button; button.setDisabled(true); });
			row.addDropdown(dropdown => {
				dropdown.addOption("include", "Include if").addOption("exclude", "Exclude if").setValue(filter.type)
					.onChange(value => edit(() => { if (value === "include" || value === "exclude") filter.type = value; }));
			});
			row.addText(text => {
				text.setPlaceholder("Property name").setValue(filter.property).onChange(value => edit(() => { filter.property = value; }));
				new FrontmatterKeySuggest(app, text.inputEl, { shouldCloseIfNoSuggestions: true });
			});
			row.addText(text => text.setPlaceholder("Property value/regex").setValue(filter.value).onChange(value => edit(() => { filter.value = value; })));
			row.addButton(button => button.setIcon("trash").onClick(() => {
				if (!current()) return;
				settings.entityFilters = settings.entityFilters!.filter((_, i) => i !== index);
				commit(true);
			}));
			describe();
		});
	};
	heading.addButton(button => button.setButtonText("Add filter").onClick(() => {
		if (!rows.isConnected || (settings.entityFilters !== undefined && !Array.isArray(settings.entityFilters))) return;
		settings.entityFilters = [...settings.entityFilters ?? [], { type: "include", property: "", value: "" }];
		commit(true);
	}));
	rebuild();
}

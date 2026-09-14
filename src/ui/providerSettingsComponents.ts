import { SettingDefinitionItem, SettingDefinitionRender, TFile } from "obsidian";
import type { EntityProviderUserSettings } from "../Providers/EntityProvider";
import type { entityFromTemplateSettings } from "../entities.types";
import { IconPickerModal } from "../userComponents";
import { getTemplaterCreationEngine } from "../entityCreation";
import { FileSuggest, FolderSuggest } from "./file-suggest";
import type { ProviderSettingsContext } from "./providerSettings";

/** All icon entry points share the originating render's opening and settlement lifetime. */
export function iconSetting<T extends EntityProviderUserSettings>(
	context: ProviderSettingsContext<T>, key: keyof T, name: string, desc: string, fallback: string
): SettingDefinitionRender {
	return context.field(key, name, desc, (setting, field) => {
		setting.addButton(button => button.setIcon(typeof field.value === "string" ? field.value : fallback)
			.onClick(field.scope.guard(async () => {
				if (!field.active) return;
				const edit = field.beginEdit();
				const picker = new IconPickerModal(context.plugin.app, field.scope);
				picker.open();
				const icon = await picker.getInput();
				if (!field.active || icon === undefined) { edit.cancel(); return; }
				edit.apply(icon as T[keyof T]);
			})));
	});
}

const emptyRecipe = (): entityFromTemplateSettings => ({ engine: "disabled", templatePath: "", folderPath: "", entityName: "" });

/** Every existing recipe is visible; edits retain the captured whole array and unknown properties. */
export function templateCreationSettings<T extends EntityProviderUserSettings>(context: ProviderSettingsContext<T>): SettingDefinitionItem[] {
	const configured = context.value("entityCreationTemplates") ?? [];
	const count = Math.max(1, configured.length);
	const recipe = (index: number) => context.value("entityCreationTemplates")?.[index] ?? emptyRecipe();
	return [...Array.from({ length: count }, (_, index) => {
		const label = `Recipe ${index + 1}`;
		const update = (list: entityFromTemplateSettings[] | undefined, changes: Partial<entityFromTemplateSettings>) => {
			const next = [...list ?? []];
			next[index] = { ...next[index] ?? emptyRecipe(), ...changes };
			return next;
		};
		const status = () => {
			const value = recipe(index);
			if (value.engine === "disabled") return "Disabled. Other configured recipes are unaffected.";
			if (value.engine !== "templater") return "Unsupported engine; this recipe is preserved.";
			if (!getTemplaterCreationEngine(context.plugin.app)) return "Templater creation unavailable; this recipe is preserved.";
			if (!(context.plugin.app.vault.getAbstractFileByPath(value.templatePath) instanceof TFile)) return "Template file unavailable; this recipe is preserved.";
			return "Templater recipe. Creation checks the engine and destination again when used.";
		};
		return {
			type: "group" as const, heading: `Creation recipe ${index + 1}`,
			items: [
				context.field("entityCreationTemplates", `${label} engine`, "Choose the creation engine for this recipe.", (setting, field) => {
					const value = field.value?.[index] ?? emptyRecipe();
					setting.addDropdown(dropdown => {
						if (value.engine !== "disabled" && value.engine !== "templater") dropdown.addOption(value.engine, value.engine === "core" ? "Core (unsupported; recipe preserved)" : `${value.engine} (unsupported; preserved)`);
						dropdown.addOption("disabled", "Disabled").addOption("templater", "Templater").setValue(value.engine)
							.onChange(engine => field.edit(list => update(list, { engine: engine as entityFromTemplateSettings["engine"] }) as T["entityCreationTemplates"]));
					});
					context.watch(field.scope, () => setting.setDesc(`${field.pending ? "Pending" : "Applied"}: ${status()}`));
				}, { manual: true }),
				...([
					["templatePath", "template path", "Path for the template, including extension.", "Template path"],
					["folderPath", "destination folder", "Folder for the new note. Empty selects the vault root.", "Folder path"],
					["entityName", "entity type", "How to describe the entity that will be created.", "Entity name"],
				] as const).map(([key, name, desc, placeholder]) => context.field("entityCreationTemplates", `${label} ${name}`, desc, (setting, field) => {
					setting.addText(text => {
						text.setPlaceholder(placeholder).setValue(field.value?.[index]?.[key] ?? "")
							.onChange(value => field.edit(list => update(list, { [key]: value }) as T["entityCreationTemplates"]));
						field.captureText(text.inputEl, { read: list => list?.[index]?.[key], write: (list, value) => update(list, { [key]: value }) as T["entityCreationTemplates"] });
						context.watch(field.scope, () => text.setDisabled(recipe(index).engine === "disabled"));
						if (key === "templatePath") new FileSuggest(context.plugin.app, text.inputEl);
						if (key === "folderPath") new FolderSuggest(context.plugin.app, text.inputEl);
					});
				}, { manual: true })),
			],
		};
	}), context.field("entityCreationTemplates", "Apply recipe changes", "Apply or discard the pending changes to these recipes.", (setting, field) => {
		setting.addButton(button => button.setButtonText("Apply recipe changes").onClick(field.scope.guard(() => field.save())))
			.addButton(button => button.setButtonText("Discard recipe changes").onClick(field.scope.guard(() => field.reload())));
	}, { manual: true })];
}

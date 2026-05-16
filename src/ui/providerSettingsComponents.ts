import { App, ExtraButtonComponent, Plugin, Setting, TFile } from "obsidian";
import { entityFromTemplateSettings } from "../entities.types";
import { IconPickerModal, openTemplateDetailsModal } from "../userComponents";
import { FolderSuggest } from "./file-suggest";
import { setValidationStatus } from "./validationStatus";

/**
 * Builds an icon picker setting row.
 */
export function buildIconPickerSetting(
	container: HTMLElement,
	label: string,
	settings: { icon: string },
	defaultIcon: string,
	onShouldSave: () => void,
	app: App
): void {
	new Setting(container)
		.setName(label)
		.setDesc("Icon for the entities returned by this provider")
		.addButton((button) =>
			button
				.setIcon(settings.icon ?? defaultIcon)
				.setDisabled(false)
				.onClick(() => {
					const iconPickerModal = new IconPickerModal(app);
					iconPickerModal.open();
					iconPickerModal.getInput().then((iconName) => {
						settings.icon = iconName;
						onShouldSave();
						button.setIcon(iconName);
					});
				})
		);
}

/**
 * Returns a human-readable status label for template creation settings.
 */
export function entityTemplateStatusLabel(
	entityCreationTemplates: entityFromTemplateSettings[]
): string {
	if (entityCreationTemplates.length === 0) {
		return "Set Template";
	} else if (
		entityCreationTemplates.length === 1 &&
		entityCreationTemplates[0].engine !== "disabled"
	) {
		return "1 template";
	} else if (
		entityCreationTemplates.length === 1 &&
		entityCreationTemplates[0].engine === "disabled"
	) {
		return "Set Template";
	} else {
		return `${entityCreationTemplates.length} templates`;
	}
}

/**
 * Builds a "New Entity From Templates" setting row with a button to open the template details modal.
 */
export function buildTemplateCreationSetting<T extends { entityCreationTemplates?: entityFromTemplateSettings[] }>(
	container: HTMLElement,
	settings: T,
	onShouldSave: (newSettings: T) => void,
	app: App
): void {
	const newEntityFromTemplatesSetting = new Setting(container)
		.setName("New Entity From Templates")
		.setDesc(
			"Create entity which uses the template for a new file with the query as the file name."
		);
	newEntityFromTemplatesSetting.addButton((button) =>
		button
			.setButtonText(
				entityTemplateStatusLabel(settings.entityCreationTemplates ?? [])
			)
			.onClick(async () => {
				const initialSettings = settings.entityCreationTemplates ?? [];
				const templateDetails = await openTemplateDetailsModal(
					app,
					initialSettings[0]
				);
				if (templateDetails) {
					settings.entityCreationTemplates = [templateDetails];
					button.setButtonText(
						entityTemplateStatusLabel([templateDetails])
					);
					onShouldSave(settings);
				}
			})
	);
}

/**
 * Builds a folder path setting with existence indicator, used by FolderEntityProvider
 * and TemplateEntityProvider summary settings.
 */
export function buildFolderPathSummarySetting<T extends { path: string }>(
	settingContainer: Setting,
	settings: T,
	onShouldSave: (newSettings: T) => void,
	plugin: Plugin,
	options?: { showNoteCount?: boolean }
): void {
	const folderExists = (folderPath: string) =>
		plugin.app.vault.getFolderByPath(folderPath) !== null;
	let folderExistsIcon: ExtraButtonComponent;
	const updateFolderExistsIcon = (path: string) => {
		if (folderExists(path) && folderExistsIcon) {
			const folder = plugin.app.vault.getFolderByPath(path);
			const noteCount = folder?.children.filter(
				(file) => file instanceof TFile
			).length;
			const tooltip = options?.showNoteCount
				? `Folder Found (${noteCount} notes)`
				: "Folder Found";

			setValidationStatus(
				folderExistsIcon,
				"folder-check",
				tooltip,
				"neutral"
			);
		} else if (folderExistsIcon) {
			setValidationStatus(
				folderExistsIcon,
				"folder-x",
				"Folder not found",
				"error"
			);
		}
	};
	settingContainer.addExtraButton((button) => {
		folderExistsIcon = button;
		updateFolderExistsIcon(settings.path);
		button.setDisabled(true);
	});

	settingContainer.addText((text) => {
		text.setPlaceholder("Folder Path").setValue(settings.path);
		text.onChange((value) => {
			updateFolderExistsIcon(value);
			if (folderExists(value)) {
				settings.path = value;
				onShouldSave(settings);
			}
		});

		new FolderSuggest(plugin.app, text.inputEl, {
			additionalClasses: "entities-settings",
		});
	});
}

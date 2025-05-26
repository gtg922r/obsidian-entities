import { EntitySuggestionItem } from "src/EntitiesSuggestor";
import { EntityProvider, EntityProviderUserSettings, RefreshBehavior } from "./EntityProvider";
import {
	EditorSuggestContext,
	Plugin,
	Setting,
	moment
} from "obsidian";
import { IconPickerModal } from "src/userComponents";
import { TriggerCharacter } from "src/entities.types";

const helperProviderTypeID = "helper";

export interface HelperProviderUserSettings extends EntityProviderUserSettings {
	providerTypeID: string;
	addCreatedTag: boolean; // New setting for adding the created tag
}

const defaultHelperProviderUserSettings: HelperProviderUserSettings = {
	providerTypeID: helperProviderTypeID,
	enabled: true,
	icon: "wand",
	entityCreationTemplates: [],
	addCreatedTag: true, // New setting for adding the created tag
};

const checkboxTypes = [
	{'todo': ' '},
	{'incomplete': '/'},
	{'done': 'x'},
	{'canceled': '-'},
	{'forwarded': '>'},
	{'scheduling': '<'},
	{'question': '?'},
	{'important': '!'},
	{'star': '*'},
	{'quote': '"'},
	{'location': 'l'},
	{'bookmark': 'b'},
	{'information': 'i'},
	{'savings': 'S'},
	{'idea': 'I'},
	{'pro': 'p'},
	{'thumbsUp': 'p'},
	{'thumbsDown': 'c'},
	{'con': 'c'},
	{'fire': 'f'},
	{'key': 'k'},
	{'win': 'w'},
	{'up': 'u'},
	{'down': 'd'},
	{'update': 'U'},
	{'reference': 'R'},
	{'knowledge': 'K'},
	{'conversation': 'C'},
];

export class HelperEntityProvider extends EntityProvider<HelperProviderUserSettings> {
	static readonly providerTypeID: string = helperProviderTypeID;

	static getDescription(settings?: HelperProviderUserSettings): string {
		if (settings) {
			return `🪄 Helper Entity Provider`;
		} else {
			return `Helper Entity Provider`;
		}
	}

	getDescription(): string {
		return HelperEntityProvider.getDescription(this.settings);
	}
	static getDefaultSettings(): HelperProviderUserSettings {
		return { ...defaultHelperProviderUserSettings };
	}

	getDefaultSettings(): HelperProviderUserSettings {
		return HelperEntityProvider.getDefaultSettings();
	}

	constructor(plugin: Plugin, settings: Partial<HelperProviderUserSettings>) {
		super(plugin, settings);
	}

	get triggers(): TriggerCharacter[] {
		return [TriggerCharacter.Slash]; // Specify the '/' trigger
	}

	getRefreshBehavior(): RefreshBehavior {
		return RefreshBehavior.Never; // Use the "Never" refresh behavior
	}

	getEntityList(query: string, trigger: TriggerCharacter): EntitySuggestionItem[] {
		if (trigger === TriggerCharacter.Slash) {
			return checkboxTypes.map(type => {
				const [checkboxType, checkboxContent] = Object.entries(type)[0];
				return {
					suggestionText: `Checkbox: ${checkboxType.charAt(0).toUpperCase() + checkboxType.slice(1)}`,
					icon: this.settings.icon ?? "wand",
					action: (item, context) => {
						if (context) {
							this.checkboxUtilityFunction(checkboxContent, context);
						} else {
							console.log("Utility Function Provider: No context given");
						}
						return undefined;
					},
				};
			});
		}
		return [];
	}

	private checkboxUtilityFunction(
		checkboxType: string,
		context: EditorSuggestContext
	) {
		const editor = context.editor;
                const startPos = {
                        ...context.start,
                        ch: Math.max(context.start.ch - 1, 0), // offset accounts for space between checkbox and text
                };
		editor.replaceRange("", startPos, context.end);

		const lineStart = { line: context.start.line, ch: 0 };
		const lineEnd = {
			line: context.end.line,
			ch: editor.getLine(context.end.line).length,
		};
		const currentLineText = editor.getRange(lineStart, lineEnd);
		const replaceRegx = /(^\s*)(?:- \[.?\]\s|- )?(.*)(?:\[created)?/;
		const match = currentLineText.match(replaceRegx);
		const currentDate = moment().format('YYYY-MM-DD');
		const createdTag = this.settings.addCreatedTag ? ` [created::${currentDate}]` : '';
		const replacementText = match
			? `${match[1]}- [${checkboxType}] ${match[2]}${createdTag}`
			: currentLineText;
		editor.replaceRange(replacementText, lineStart, lineEnd);
	}

	static buildSummarySetting(
		settingContainer: Setting,
		settings: HelperProviderUserSettings,
		onShouldSave: (newSettings: HelperProviderUserSettings) => void,
		plugin: Plugin
	): void {
		return;
	}

	static buildSimpleSettings(
		settingContainer: HTMLElement,
		settings: HelperProviderUserSettings,
		onShouldSave: (newSettings: HelperProviderUserSettings) => void,
		plugin: Plugin
	): void {
		new Setting(settingContainer)
			.setName("Icon")
			.setDesc("Icon for the entities returned by this provider")
			.addButton((button) =>
				button
					.setIcon(settings.icon ?? "box-select")
					.setDisabled(false)
					.onClick(() => {
						const iconPickerModal = new IconPickerModal(plugin.app);
						iconPickerModal.open();
						iconPickerModal.getInput().then((iconName) => {
							settings.icon = iconName;
							onShouldSave(settings);
							button.setIcon(iconName);
						});
					})
			);

		// New setting for adding the created tag
		new Setting(settingContainer)
			.setName("Add Created Tag")
			.setDesc("Whether to add the [created::...] tag at the end of a line from the checkbox function")
			.addToggle((toggle) =>
				toggle
					.setValue(settings.addCreatedTag)
					.onChange((value) => {
						settings.addCreatedTag = value;
						onShouldSave(settings);
					})
			);
	}
}

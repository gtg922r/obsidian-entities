import { EntitySuggestionItem } from "src/EntitiesSuggestor";
import { EntityProvider, EntityProviderUserSettings } from "./EntityProvider";
import {
	EditorSuggestContext,
	Plugin,
	Setting,
} from "obsidian";
import { IconPickerModal } from "src/userComponents";

const helperProviderTypeID = "helper";

export interface HelperProviderUserSettings extends EntityProviderUserSettings {
	providerTypeID: string;
}

const defaultHelperProviderUserSettings: HelperProviderUserSettings = {
	providerTypeID: helperProviderTypeID,
	enabled: true,
	icon: "wand",
	entityCreationTemplates: [],
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

	getEntityList(): EntitySuggestionItem[] {

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

	private checkboxUtilityFunction(
		checkboxType: string,
		context: EditorSuggestContext
	) {
		const editor = context.editor;
		const startPos = {
			...context.start,
			// TODO: -2 is a hack to account for the space between the checkbox and the text
			ch: Math.max(context.start.ch - 2, 0), // Ensure ch is not negative
		};
		editor.replaceRange("", startPos, context.end);

		const lineStart = { line: context.start.line, ch: 0 };
		const lineEnd = {
			line: context.end.line,
			ch: editor.getLine(context.end.line).length,
		};
		const currentLineText = editor.getRange(lineStart, lineEnd);
		const replaceRegx = /(^\s*)(?:- \[.?\]\s|- )(.*)/;
		const match = currentLineText.match(replaceRegx);
		const replacementText = match
			? `${match[1]}- [${checkboxType}] ${match[2]}`
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
	}
}

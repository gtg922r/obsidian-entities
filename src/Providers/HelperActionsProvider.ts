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
	checkboxIcon: string; // Icon for checkbox helpers
	calloutIcon: string; // Icon for callout helpers
}

const defaultHelperProviderUserSettings: HelperProviderUserSettings = {
	providerTypeID: helperProviderTypeID,
	enabled: true,
	icon: "", // Not used - we use checkboxIcon and calloutIcon instead
	entityCreationTemplates: [],
	addCreatedTag: true, // New setting for adding the created tag
	checkboxIcon: "square-asterisk", // Default icon for checkbox helpers
	calloutIcon: "square-chevron-right", // Default icon for callout helpers
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

const calloutTypes = [
        'note',
        'abstract',
        'summary',
        'tldr',
        'info',
        'todo',
        'tip',
        'hint',
        'important',
        'success',
        'check',
        'done',
        'question',
        'help',
        'faq',
        'warning',
        'caution',
        'attention',
        'failure',
        'fail',
        'missing',
        'danger',
        'error',
        'bug',
        'example',
        'quote',
        'cite',
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
                        const checkboxSuggestions = checkboxTypes.map(type => {
                                const [checkboxType, checkboxContent] = Object.entries(type)[0];
                                return {
                                        suggestionText: `Checkbox: ${checkboxType.charAt(0).toUpperCase() + checkboxType.slice(1)}`,
                                        icon: this.settings.checkboxIcon ?? "square-asterisk",
                                        action: (item, context) => {
                                                if (context) {
                                                        this.checkboxUtilityFunction(checkboxContent, context);
                                                } else {
                                                        console.log("Utility Function Provider: No context given");
                                                }
                                                return undefined;
                                        },
                                } as EntitySuggestionItem;
                        });

                        const calloutSuggestions = calloutTypes.map(type => {
                                return {
                                        suggestionText: `Callout: ${type.charAt(0).toUpperCase() + type.slice(1)}`,
                                        icon: this.settings.calloutIcon ?? "square-chevron-right",
                                        action: (item, context) => {
                                                if (context) {
                                                        this.calloutUtilityFunction(type, context);
                                                } else {
                                                        console.log("Utility Function Provider: No context given");
                                                }
                                                return undefined;
                                        },
                                } as EntitySuggestionItem;
                        });

                        return [...checkboxSuggestions, ...calloutSuggestions];
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
			// TODO: -2 is a hack to account for the space between the checkbox and the text
			ch: Math.max(context.start.ch - 1, 0), // Ensure ch is not negative
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

        private calloutUtilityFunction(
                calloutType: string,
                context: EditorSuggestContext
        ) {
                const editor = context.editor;
                const startPos = {
                        ...context.start,
                        ch: Math.max(context.start.ch - 1, 0),
                };
                editor.replaceRange("", startPos, context.end);

                const lineStart = { line: context.start.line, ch: 0 };
                const lineEnd = {
                        line: context.end.line,
                        ch: editor.getLine(context.end.line).length,
                };
                const currentLineText = editor.getRange(lineStart, lineEnd);
                const replacementText = `> [!${calloutType}]
> ${currentLineText}`;
                editor.replaceRange(replacementText, lineStart, lineEnd);
                editor.setCursor({
                        line: lineStart.line + 1,
                        ch: currentLineText.length + 2, // +2 to account for the "> " prefix
                });
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
			.setName("Checkbox Icon")
			.setDesc("Icon for the checkbox helper entities")
			.addButton((button) =>
				button
					.setIcon(settings.checkboxIcon ?? "square-asterisk")
					.setDisabled(false)
					.onClick(() => {
						const iconPickerModal = new IconPickerModal(plugin.app);
						iconPickerModal.open();
						iconPickerModal.getInput().then((iconName) => {
							settings.checkboxIcon = iconName;
							onShouldSave(settings);
							button.setIcon(iconName);
						});
					})
			);

		new Setting(settingContainer)
			.setName("Callout Icon")
			.setDesc("Icon for the callout helper entities")
			.addButton((button) =>
				button
					.setIcon(settings.calloutIcon ?? "square-chevron-right")
					.setDisabled(false)
					.onClick(() => {
						const iconPickerModal = new IconPickerModal(plugin.app);
						iconPickerModal.open();
						iconPickerModal.getInput().then((iconName) => {
							settings.calloutIcon = iconName;
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

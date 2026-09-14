import { checkboxEdit, calloutEdit } from "../helperEdits";
import { cloneSettings } from "../settingsData";
import { EntitySuggestionItem } from "src/suggestion.types";
import { EntityProvider, EntityProviderUserSettings, ProviderSettingsInput, RefreshBehavior } from "./EntityProvider";
import {
	Plugin,
	moment
} from "obsidian";
import { iconSetting } from "../ui/providerSettingsComponents";
import type { ProviderSettingsContext } from "../ui/providerSettings";
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
	get isQueryDependent(): boolean {
		return false;
	}

	static readonly providerTypeID: string = helperProviderTypeID;

	static getDescription(settings?: HelperProviderUserSettings): string {
		if (settings) {
			return `🪄 Helper entity provider`;
		} else {
			return `Helper entity provider`;
		}
	}

	getDescription(): string {
		return HelperEntityProvider.getDescription(this.settings);
	}
	static getDefaultSettings(): HelperProviderUserSettings {
		return cloneSettings(defaultHelperProviderUserSettings);
	}

	getDefaultSettings(): HelperProviderUserSettings {
		return HelperEntityProvider.getDefaultSettings();
	}

	constructor(plugin: Plugin, settings: ProviderSettingsInput<HelperProviderUserSettings>) {
		super(plugin, settings);
	}

	get triggers(): TriggerCharacter[] {
		return [TriggerCharacter.Slash]; // Specify the '/' trigger
	}

	getRefreshBehavior(): RefreshBehavior {
		return RefreshBehavior.Never; // Use the "Never" refresh behavior
	}

	getEntityList(query: string, trigger: TriggerCharacter): EntitySuggestionItem[] {
		if (trigger !== TriggerCharacter.Slash) return [];
		const checkboxSuggestions = checkboxTypes.map((type): EntitySuggestionItem => {
			const [checkboxType, checkboxContent] = Object.entries(type)[0];
			return {
				suggestionText: `Checkbox: ${checkboxType.charAt(0).toUpperCase() + checkboxType.slice(1)}`,
				icon: this.settings.checkboxIcon ?? "square-asterisk",
				target: {
					kind: "action",
					id: JSON.stringify(["checkbox", checkboxContent]),
					callback: context => ({ status: "edit", edit: checkboxEdit(context, checkboxContent, this.settings.addCreatedTag, moment().format("YYYY-MM-DD")) }),
				},
			};
		});
		const calloutSuggestions = calloutTypes.map((type): EntitySuggestionItem => ({
			suggestionText: `Callout: ${type.charAt(0).toUpperCase() + type.slice(1)}`,
			icon: this.settings.calloutIcon ?? "square-chevron-right",
			target: {
				kind: "action",
				id: JSON.stringify(["callout", type]),
				callback: context => ({ status: "edit", edit: calloutEdit(context, type) }),
			},
		}));
		return [...checkboxSuggestions, ...calloutSuggestions];
	}

	static getSettingDefinitions(context: ProviderSettingsContext<HelperProviderUserSettings>) {
		return [
			iconSetting(context, "checkboxIcon", "Checkbox icon", "Icon for the checkbox helpers.", "square-asterisk"),
			iconSetting(context, "calloutIcon", "Callout icon", "Icon for the callout helpers.", "square-chevron-right"),
			context.field("addCreatedTag", "Add created tag", "Add [created::...] metadata at the end of a line from the checkbox action.", (setting, field) => {
				setting.addToggle(toggle => toggle.setValue(field.value).onChange(value => field.set(value)));
			}),
		];
	}

}

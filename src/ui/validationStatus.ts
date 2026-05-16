import { ExtraButtonComponent } from "obsidian";

export type ValidationStatus =
	| "neutral"
	| "muted"
	| "success"
	| "warning"
	| "error";

const STATUS_CLASSES = [
	"entities-validation-status-muted",
	"entities-validation-status-success",
	"entities-validation-status-warning",
	"entities-validation-status-error",
];

export function setValidationStatus(
	button: ExtraButtonComponent,
	icon: string,
	tooltip: string,
	status: ValidationStatus
): void {
	button.setIcon(icon);
	button.setTooltip(tooltip);

	for (const className of STATUS_CLASSES) {
		button.extraSettingsEl.removeClass(className);
	}

	if (status !== "neutral") {
		button.extraSettingsEl.addClass(`entities-validation-status-${status}`);
	}
}

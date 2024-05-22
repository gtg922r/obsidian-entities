import {
	App,
	DropdownComponent,
	Modal,
	Setting,
	TextComponent,
	getIconIds,
	getIcon,
} from "obsidian";
import {
	entityFromTemplateSettings,
} from "./entities.types";
import { FileSuggest } from "./ui/file-suggest";

// export class ProviderSettingsModal extends Modal {
// 	private populateSettings: (
// 		contentEl: HTMLElement,
// 		config: CommonProviderConfig,
// 		app: App
// 	) => void;
// 	private config: CommonProviderConfig;

// 	constructor(
// 		app: App,
// 		config: CommonProviderConfig,
// 		populateSettings: (
// 			contentEl: HTMLElement,
// 			config: CommonProviderConfig,
// 			app: App
// 		) => void
// 	) {
// 		super(app);
// 		this.config = config;
// 		this.populateSettings = populateSettings;
// 	}

// 	onOpen() {
// 		const { contentEl } = this;
// 		contentEl.empty();
// 		contentEl.addClass("entities-wide-modal");
// 		this.populateSettings(contentEl, this.config, this.app);
// 	}
// }

export interface EntitiesModalInputOptions {
	placeholder?: string;
	instructions?: {
		insertString?: string;
		dismissString?: string;
	};
}

export class EntitiesModalInput extends Modal {
	promise: Promise<string>;
	resolve: (value: string | PromiseLike<string>) => void;
	placeholder: string;
	instructions: { insertString: string; dismissString: string };

	constructor(
		app: App,
		{ placeholder, instructions }: EntitiesModalInputOptions = {}
	) {
		super(app);
		this.placeholder = placeholder ?? "Type here...";
		this.instructions = {
			insertString: instructions?.insertString ?? "to insert",
			dismissString: instructions?.dismissString ?? "to dismiss",
		};

		this.promise = new Promise<string>((resolve) => {
			this.resolve = resolve;
		});
	}

	onOpen() {
		const { modalEl } = this;
		modalEl.empty(); // Ensure the content is empty before adding new elements
		modalEl.removeClass("modal-content");
		modalEl.addClass("prompt");

		const inputContainer = modalEl.createDiv({
			cls: "prompt-input-container",
		});

		const inputEl = inputContainer.createEl("input", {
			cls: "prompt-input",
			attr: {
				enterkeyhint: "done",
				type: "text",
				placeholder: this.placeholder,
			},
		});

		// Input CTA container (if needed for future use)
		inputContainer.createDiv({ cls: "prompt-input-cta" });

		const instructions = modalEl.createDiv({ cls: "prompt-instructions" });

		// Instruction for inserting template
		const insertInstruction = instructions.createDiv({
			cls: "prompt-instruction",
		});
		insertInstruction.createSpan({
			cls: "prompt-instruction-command",
			text: "↵",
		});
		insertInstruction.appendText(this.instructions.insertString);

		// Instruction for dismissing the modal
		const dismissInstruction = instructions.createDiv({
			cls: "prompt-instruction",
		});
		dismissInstruction.createSpan({
			cls: "prompt-instruction-command",
			text: "esc",
		});
		dismissInstruction.appendText(this.instructions.dismissString);

		// Handle enter key press to resolve the promise and close the modal
		inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				this.resolve(inputEl.value);
				this.close();
			}
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	getInput(): Promise<string> {
		return this.promise;
	}
}

export async function openTemplateDetailsModal(
	initialSettings: entityFromTemplateSettings
): Promise<entityFromTemplateSettings | null> {
	const modal = new TemplateDetailsModal(this.app, initialSettings);
	return await modal.openAndGetValue();
}

export class TemplateDetailsModal extends Modal {
	private resolve: (value: entityFromTemplateSettings | null) => void;
	private initialSettings?: entityFromTemplateSettings;

	constructor(app: App, initialSettings?: entityFromTemplateSettings) {
		super(app);
		this.initialSettings = initialSettings;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty(); // Clear previous content

		contentEl.createEl("h2", { text: "New Entity From Template" });

		let engineDropdown: DropdownComponent;
		let templatePathInput: TextComponent;
		let entityNameInput: TextComponent;

		// Engine Dropdown Setting
		new Setting(contentEl)
			.setName("Engine")
			.setDesc("Choose the template engine for the new entity")
			.addDropdown((dropdown) => {
				dropdown
					.addOptions({
						disabled: "Disabled",
						// core: "Core", // Needs to be implemented
						templater: "Templater",
					})
					.setValue(this.initialSettings?.engine || "disabled")
					.onChange((value) => {
						templatePathInput.setDisabled(value === "disabled");
						entityNameInput.setDisabled(value === "disabled");
					});
				engineDropdown = dropdown;
			});

		// Template Path Input Setting
		new Setting(contentEl)
			.setName("Template Path")
			.setDesc("Path for the template (include extension)")
			.addText((text) => {
				text.setPlaceholder("Template Path").setValue(
					this.initialSettings?.templatePath || ""
				);
				templatePathInput = text;
				text.setDisabled(engineDropdown.getValue() === "disabled");
				new FileSuggest(this.app, text.inputEl);
			});

		// Entity Name Input Setting
		new Setting(contentEl)
			.setName("Entity Type")
			.setDesc("How to describe the entity that will be created")
			.addText((text) => {
				text.setPlaceholder("Entity Name").setValue(
					this.initialSettings?.entityName || ""
				);
				entityNameInput = text;
				text.setDisabled(engineDropdown.getValue() === "disabled");
			});

		// Save Button
		new Setting(contentEl)
			.addButton((button) =>
				button.setButtonText("Save").onClick(() => {
					const templateDetails: entityFromTemplateSettings = {
						engine: engineDropdown.getValue() as
							| "disabled"
							| "core"
							| "templater",
						templatePath: templatePathInput.getValue(),
						entityName: entityNameInput.getValue(),
					};
					this.close();
					this.resolve(templateDetails);
				})
			)
			.addButton((button) =>
				button.setButtonText("Cancel").onClick(() => {
					this.close();
					this.resolve(null);
				})
			);
	}

	async openAndGetValue(): Promise<entityFromTemplateSettings | null> {
		return new Promise((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}
}

export class IconPickerModal extends Modal {
	private resolve: (value: string | PromiseLike<string>) => void;
	private icons: string[];
	private filteredIcons: string[];
	private gridContainer: HTMLElement; // Add a property to hold the reference
	private promise?: Promise<string>; // Make the promise property optional

	constructor(app: App) {
		super(app);
		this.icons = getIconIds().map((iconId) =>
			iconId.replace(/^lucide-/, "")
		);
		this.filteredIcons = this.icons;
	}

	onOpen() {
		const { modalEl } = this;
		modalEl.empty();
		modalEl.removeClass("modal-content");
		modalEl.addClass("prompt");

		const inputContainer = modalEl.createDiv({
			cls: "prompt-input-container",
		});

		// Search box
		const searchBox = inputContainer.createEl("input", {
			cls: "prompt-input",
			attr: {
				enterkeyhint: "done",
				type: "text",
				placeholder: "Search icons...",
			},
		});
		searchBox.addEventListener("input", () =>
			this.filterIcons(searchBox.value)
		);

		// Display results in a grid
		const promptResults = modalEl.createDiv({ cls: "prompt-results" });
		this.gridContainer = promptResults.createDiv({ cls: "icon-grid" }); // Store the reference
		this.displayIcons(this.gridContainer); // Use the reference

		// Show instructions
		const instructions = modalEl.createDiv({ cls: "prompt-instructions" });

		// Instruction for inserting template
		const insertInstruction = instructions.createDiv({
			cls: "prompt-instruction",
		});
		insertInstruction.createSpan({
			cls: "prompt-instruction-command",
			text: "click",
		});
		insertInstruction.appendText("to insert");

		// Instruction for dismissing the modal
		const dismissInstruction = instructions.createDiv({
			cls: "prompt-instruction",
		});
		dismissInstruction.createSpan({
			cls: "prompt-instruction-command",
			text: "esc",
		});
		dismissInstruction.appendText("to dismiss");

		// Promise to return selected icon
		this.promise = new Promise<string>((resolve) => {
			this.resolve = resolve;
		});
	}

	private filterIcons(query: string) {
		if (!query) {
			this.filteredIcons = this.icons;
		} else {
			this.filteredIcons = this.icons.filter((icon) =>
				icon.toLowerCase().includes(query.toLowerCase())
			);
		}
		this.displayIcons(this.gridContainer); // Use the reference
	}

	private displayIcons(container: HTMLElement) {
		container.empty();
		this.filteredIcons.forEach((iconName) => {
			const iconEl = container.createEl("div", { cls: "icon-item" });
			const iconSVG = getIcon(iconName); // Get the SVG element for the icon
			if (iconSVG instanceof SVGSVGElement) {
				iconSVG.addClass("icon-svg"); // Add a class for styling if needed
				iconEl.appendChild(iconSVG); // Append the SVG to the icon element
			}
			iconEl.setAttribute("title", iconName); // Set the title attribute for tooltip
			// const iconLabel = iconEl.createEl("span", { cls: "icon-name" });
			// iconLabel.setText(iconName); // Set the text label for the icon (optional, uncomment if you want labels)
			iconEl.addEventListener("click", () => {
				this.resolve(iconName);
				this.close();
			});
		});
	}

	getInput(): Promise<string> {
		return this.promise ?? Promise.resolve("");
	}
}

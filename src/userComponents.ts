import { App, Modal, Setting } from "obsidian";
import { entityFromTemplateSettings } from "./entities.types";

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

		const prompt = modalEl;
		const inputContainer = prompt.createDiv({
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

		const instructions = prompt.createDiv({ cls: "prompt-instructions" });

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


export class TemplateDetailsModal extends Modal {
    private resolve: (value: entityFromTemplateSettings | null) => void;

    constructor(app: App) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty(); // Clear previous content

        contentEl.createEl("h2", { text: "New Entity From Template" });

        // Engine Dropdown Setting
        new Setting(contentEl)
            .setName("Engine")
            .setDesc("Choose the template engine for the new entity")
            .addDropdown(dropdown => 
                dropdown.addOptions({
                    disabled: "Disabled",
                    core: "Core",
                    templater: "Templater",
                })
                .setValue("disabled")
            );

        // Template Path Input Setting
        new Setting(contentEl)
            .setName("Template Path")
            .setDesc("Path for the template (include extension)")
            .addText(text => text
                .setPlaceholder("Template Path")
            );

        // Entity Name Input Setting
        new Setting(contentEl)
            .setName("Entity Type")
            .setDesc("How to describe the entity that will be created")
            .addText(text => text
                .setPlaceholder("Entity Name")
            );

        // Save Button
        new Setting(contentEl)
            .addButton(button => button
				.setButtonText("Save")
                .onClick(() => {
                    // You need to store references to the dropdown and text inputs above to access their values here
                    // This is a simplified example. Adjust according to your actual data handling needs.
                    const templateDetails: entityFromTemplateSettings = {
                        engine: "disabled", // Replace with actual value
                        templatePath: "", // Replace with actual value
                        entityName: "", // Replace with actual value
                    };
                    this.close();
                    this.resolve(templateDetails);
                }))
            .addButton(button => 
                button.setButtonText("Cancel")
                .onClick(() => {
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

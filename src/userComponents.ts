import { App, Modal } from "obsidian";

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

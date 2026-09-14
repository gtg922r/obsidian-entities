import {
	App,
	Modal,
	getIconIds,
	getIcon,
} from "obsidian";
import { InputSuggestScope } from "./ui/inputSuggestLifecycle";


import { Notice, setIcon } from "obsidian";

export class EntitiesNotice extends Notice {
	constructor(message: string, icon: string, duration?: number) {
		super("", duration);
		this.noticeEl.addClass("entities-notice");
		const noticeIconEl = this.noticeEl.createSpan({
			cls: "entities-notice-icon",
		});
		setIcon(noticeIconEl, icon);
		this.noticeEl
			.createSpan({ cls: "entities-notice-text" })
			.setText(message);
	}
}

export interface EntitiesModalInputOptions {
	placeholder?: string;
	instructions?: {
		insertString?: string;
		dismissString?: string;
	};
}

export class EntitiesModalInput extends Modal {
	private readonly promise: Promise<string | undefined>;
	private resolve!: (value: string | undefined) => void;
	private settled = false;
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

		this.promise = new Promise<string | undefined>((resolve) => {
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
			if (e.key === "Enter" && !e.isComposing) {
				e.preventDefault();
				e.stopPropagation();
				this.settle(inputEl.value);
				this.close();
			}
		});
	}

	onClose() {
		this.settle(undefined);
		const { contentEl } = this;
		contentEl.empty();
	}

	private settle(value: string | undefined): void {
		if (this.settled) return;
		this.settled = true;
		this.resolve(value);
	}

	getInput(): Promise<string | undefined> {
		return this.promise;
	}
}

export class IconPickerModal extends Modal {
	private resolve!: (value: string | undefined) => void;
	private settled = false;
	private renderScope?: InputSuggestScope;
	private releaseClose?: () => void;
	private icons: string[];
	private filteredIcons: string[];
	private gridContainer!: HTMLElement; // Add a property to hold the reference
	private readonly promise: Promise<string | undefined>;

	constructor(app: App, private owner?: InputSuggestScope) {
		super(app);
		this.icons = getIconIds().map((iconId) =>
			iconId.replace(/^lucide-/, "")
		);
		this.filteredIcons = this.icons;
		this.promise = new Promise(resolve => { this.resolve = resolve; });
	}

	onOpen() {
		if (this.settled || (this.owner && !this.owner.active)) { this.close(); return; }
		const view = this.renderScope = new InputSuggestScope(this.modalEl, this.owner);
		this.releaseClose = view.own(() => this.close());
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
		searchBox.addEventListener("input", view.guard(() => this.filterIcons(searchBox.value)));

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
			if (iconSVG) {
				iconSVG.classList.add("icon-svg"); // Add a class for styling if needed
				iconEl.appendChild(iconSVG); // Append the SVG to the icon element
			}
			iconEl.setAttribute("title", iconName); // Set the title attribute for tooltip
			// const iconLabel = iconEl.createEl("span", { cls: "icon-name" });
			// iconLabel.setText(iconName); // Set the text label for the icon (optional, uncomment if you want labels)
			iconEl.addEventListener("click", this.renderScope!.guard(() => {
				this.settle(iconName);
				this.close();
			}));
		});
	}

	onClose(): void {
		this.settle(undefined);
		this.releaseClose?.();
		this.releaseClose = undefined;
		this.renderScope?.dispose();
	}

	private settle(value: string | undefined): void {
		if (this.settled) return;
		this.settled = true;
		this.resolve(value);
	}

	getInput(): Promise<string | undefined> { return this.promise; }
}

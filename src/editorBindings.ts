import { App, Editor, MarkdownFileInfo, Plugin, TAbstractFile, TFile, editorInfoField } from "obsidian";
import { EditorView, ViewPlugin } from "@codemirror/view";

interface Binding {
	readonly editor: Editor;
	readonly file: TFile;
	readonly info: MarkdownFileInfo;
	readonly view: EditorView;
	readonly ownerDocument: Document;
	readonly window: Window | null;
	readonly generation: number;
}

/** Opaque captured public binding and observed change generations. */
export interface EditorBindingSnapshot {
	readonly binding: Binding;
	readonly revision: number;
	readonly activation: number;
}

/** Public editor extension and events only; no private Editor-to-CodeMirror access. */
export class EditorBindings {
	private current = new WeakMap<Editor, Binding>();
	private live = new Set<Binding>();
	private revisions = new WeakMap<Editor, number>();
	private generation = 0;
	private activation = 0;
	private focused?: Binding;
	private disposed = false;
	readonly extension;

	constructor(private readonly app: App) {
		this.extension = this.createExtension(this);
	}

	private createExtension(owner: EditorBindings) {
		return ViewPlugin.fromClass(class {
			binding?: Binding;
			constructor(readonly view: EditorView) { this.refresh(); }
			refresh() {
				const info = this.view.state.field(editorInfoField, false);
				const editor = info?.editor, file = info?.file;
				if (this.binding && (owner.current.get(this.binding.editor) !== this.binding || this.binding.info !== info || this.binding.editor !== editor || this.binding.file !== file ||
					this.binding.ownerDocument !== this.view.dom.ownerDocument)) {
					owner.remove(this.binding);
					this.binding = undefined;
				}
				if (!this.binding && !owner.disposed && info && editor && file instanceof TFile) {
					const old = owner.current.get(editor);
					if (old) owner.remove(old);
					this.binding = { editor, file, info, view: this.view, ownerDocument: this.view.dom.ownerDocument,
						window: this.view.dom.ownerDocument.defaultView, generation: ++owner.generation };
					owner.current.set(editor, this.binding);
					owner.live.add(this.binding);
				}
			}
			update() { this.refresh(); }
			destroy() { if (this.binding) owner.remove(this.binding); }
		}, {
			eventHandlers: {
				focus() {
					this.refresh();
					if (this.binding) owner.observeFocus(this.binding);
				},
			},
		});
	}

	/** Install before the suggestor; Obsidian owns extension and event cleanup. */
	register(plugin: Plugin): void {
		plugin.registerEditorExtension(this.extension);
		plugin.register(() => this.dispose());
		plugin.registerEvent(this.app.workspace.on("editor-change", editor => {
			this.revisions.set(editor, (this.revisions.get(editor) ?? 0) + 1);
		}));
		const activate = () => { this.activation++; };
		plugin.registerEvent(this.app.workspace.on("active-leaf-change", activate));
		plugin.registerEvent(this.app.workspace.on("file-open", activate));
		plugin.registerEvent(this.app.workspace.on("layout-change", () => {
			for (const binding of this.live) if (!this.attached(binding)) this.remove(binding);
		}));
		plugin.registerEvent(this.app.workspace.on("window-close", (_container, window) => {
			for (const binding of this.live) if (binding.window === window) this.remove(binding);
		}));
		// Source events invalidate bindings, while target/index events remain cache-only.
		const invalidateSource = (file: TAbstractFile) => {
			for (const binding of this.live) {
				if (file === binding.file || binding.file.path.startsWith(file.path + "/") ||
					this.app.vault.getAbstractFileByPath(binding.file.path) !== binding.file) this.remove(binding);
			}
		};
		plugin.registerEvent(this.app.vault.on("delete", invalidateSource));
		plugin.registerEvent(this.app.vault.on("rename", invalidateSource));
	}

	private observeFocus(binding: Binding): void {
		if (this.focused !== binding) {
			this.activation++;
			this.focused = binding;
		}
	}

	private remove(binding: Binding): void {
		if (this.current.get(binding.editor) === binding) this.current.delete(binding.editor);
		this.live.delete(binding);
	}

	private attached(binding: Binding): boolean {
		return this.current.get(binding.editor) === binding && binding.view.dom.isConnected &&
			binding.view.dom.ownerDocument === binding.ownerDocument && binding.ownerDocument.defaultView === binding.window &&
			!binding.window?.closed && binding.info.editor === binding.editor && binding.info.file === binding.file &&
			binding.view.state.field(editorInfoField, false) === binding.info;
	}

	/** Seed focus at entry even when the editor's earlier focus event was unobserved. */
	capture(editor: Editor, file: TFile): EditorBindingSnapshot | undefined {
		const binding = this.current.get(editor);
		if (this.disposed || !binding || binding.file !== file || this.app.workspace.activeEditor !== binding.info || !this.attached(binding)) return;
		this.observeFocus(binding);
		return { binding, revision: this.revisions.get(editor) ?? 0, activation: this.activation };
	}

	/** Final checks supplement delivered events; invisible programmatic history is not observable. */
	isCurrent(snapshot: EditorBindingSnapshot): boolean {
		const { binding } = snapshot;
		return !this.disposed && snapshot.activation === this.activation &&
			snapshot.revision === (this.revisions.get(binding.editor) ?? 0) &&
			this.app.workspace.activeEditor === binding.info && this.attached(binding);
	}

	/** Invalidate all snapshots without disturbing another plugin's views or listeners. */
	dispose(): void {
		this.disposed = true;
		this.current = new WeakMap();
		this.live.clear();
		this.focused = undefined;
	}
}

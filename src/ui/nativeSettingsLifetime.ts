import { InputSuggestScope, runInputCleanups } from "./inputSuggestLifecycle";

export type CompositionFinish = "start" | "capture" | "commit" | "input";

type Render = { root: HTMLElement; attachedDocument: Document; scope: InputSuggestScope; composing?: EventTarget | null; finish?: (phase: CompositionFinish) => void; interaction?: boolean; epoch: number };

/** Owns public native row renders, document adoption, and deferred composition rebuilds. */
export class NativeSettingsLifetime {
	private renders = new Set<Render>();
	private observer?: MutationObserver;
	private ownerDocument?: Document;
	private lastDocument?: Document;
	private adoptionRoot?: HTMLElement;
	private removeWindow?: () => void;
	private pending = false;
	private settledActions = new Set<{ scope: InputSuggestScope; run: () => void; cancel: () => void }>();
	private moving = false;
	private hidden = true;
	private disposed = false;
	private closedDocuments = new WeakSet<Document>();
	private scheduled?: { window: Window; timer: number };

	constructor(private root: () => HTMLElement, private parent: InputSuggestScope, private rebuild: () => void) {
		parent.own(() => this.dispose());
	}

	get composing(): boolean { return [...this.renders].some(render => Boolean(render.composing)); }

	/** Registration may update definitions before any rows exist. */
	update(): void {
		if (this.disposed || !this.parent.active || this.closedDocuments.has(this.ownerDocument ?? this.lastDocument ?? this.root().ownerDocument)) return;
		if ([...this.renders].some(render => render.composing)) { this.pending = true; return; }
		this.pending = false;
		const doc = this.ownerDocument;
		const active = doc?.activeElement;
		const focused = [...this.renders].find(render => active && render.root.contains(active));
		const inputs = focused ? Array.from(focused.root.querySelectorAll<HTMLInputElement>("input, textarea")) : [];
		const index = inputs.findIndex(input => input === active);
		const selection = index < 0 ? undefined : [inputs[index].selectionStart, inputs[index].selectionEnd] as const;
		this.rebuild();
		const replacement = focused?.root.querySelectorAll<HTMLInputElement>("input, textarea")[index];
		// A synchronous replacement may restore only the field that still owns user focus.
		if (doc && doc.hasFocus() && doc === this.ownerDocument && focused?.root.isConnected && index >= 0 &&
			(doc.activeElement === doc.body || doc.activeElement === active || doc.activeElement === replacement)) {
			if (replacement && replacement !== active) {
				if (doc.activeElement !== replacement) replacement.focus();
				if (selection?.[0] !== null && selection?.[1] !== null) {
					try { replacement.setSelectionRange(selection![0], selection![1]); } catch { /* Non-text controls have no selection. */ }
				}
			}
		}
	}

	/** Each callback retains this scope; no old control resolves a newly rendered session. */
	render(root: HTMLElement, finish: (phase: CompositionFinish) => void): { scope: InputSuggestScope; composing: () => boolean } {
		this.hidden = false;
		this.moving = false;
		this.cancelScheduled();
		// A fresh native render supersedes old adopted scopes before their late cleanup can reclaim it.
		for (const render of this.renders) if (render.root.ownerDocument !== render.attachedDocument) render.scope.dispose();
		this.watch(root.ownerDocument);
		const scope = new InputSuggestScope(root, this.parent);
		const render: Render = { root, attachedDocument: root.ownerDocument, scope, finish, epoch: 0 };
		this.renders.add(render);
		this.adoptionRoot = undefined;
		const start = (event: Event) => { render.composing = event.target; render.interaction = false; render.epoch++; render.finish?.("start"); };
		const end = (event: Event) => {
			// compositionend can precede the final input, even in a later event turn.
			render.composing = event.target; render.interaction = false; render.epoch++;
		};
		const finalInput = (event: Event) => {
			if ((event as InputEvent).isComposing) {
				if (!render.composing) { render.epoch++; render.finish?.("start"); }
				render.composing = event.target; return;
			}
			if (render.composing) { render.composing = undefined; this.afterInteraction(render); }
		};
		const blur = () => { if (render.composing) this.afterInteraction(render, true); };
		const intent = (event: Event) => { if (render.composing && !(event as KeyboardEvent).isComposing) render.interaction = true; };
		const laterInteraction = () => { if (render.interaction && render.composing) this.afterInteraction(render, true); };
		const keyup = (event: Event) => { if (!(event as KeyboardEvent).isComposing) laterInteraction(); };
		root.addEventListener("compositionstart", start, true);
		root.addEventListener("compositionend", end, true);
		root.addEventListener("input", finalInput, true);
		root.addEventListener("focusout", blur);
		root.addEventListener("keydown", intent);
		root.addEventListener("pointerdown", intent);
		root.addEventListener("click", laterInteraction);
		root.addEventListener("keyup", keyup);
		scope.own(() => {
			// R6a may retire an adopted input before the old document's observer runs.
			if (!this.hidden && root.ownerDocument !== render.attachedDocument) this.adoptionRoot = root;
			if (render.composing) { render.finish?.("capture"); this.pending = false; this.cancelScheduled(); this.cancelActions(); }
			render.composing = undefined;
			render.finish = undefined;
			this.renders.delete(render);
			root.removeEventListener("compositionstart", start, true);
			root.removeEventListener("compositionend", end, true);
			root.removeEventListener("input", finalInput, true);
			root.removeEventListener("focusout", blur);
			root.removeEventListener("keydown", intent);
			root.removeEventListener("pointerdown", intent);
			root.removeEventListener("click", laterInteraction);
			root.removeEventListener("keyup", keyup);
		});
		return { scope, composing: () => Boolean(render.composing) };
	}

	private afterInteraction(render: Render, release = false): void {
		// A task boundary lets target handlers and default input/click effects finish first.
		const composing = render.composing;
		const epoch = render.epoch;
		const win = render.root.ownerDocument.defaultView;
		if (!win) return;
		const timer = win.setTimeout(() => {
			unregister();
			if (!render.scope.active || this.hidden || this.disposed) return;
			if (release && render.epoch === epoch && render.composing === composing) render.composing = undefined;
			if (render.composing) return;
			render.finish?.(release ? "commit" : "input");
			this.drainActions();
			if (this.pending) this.update();
		}, 0);
		const unregister = render.scope.own(() => win.clearTimeout(timer));
	}

	/** Explicit collection Apply waits for pending input/default effects without outliving its row. */
	whenSettled(scope: InputSuggestScope, action: () => void): void {
		const win = this.ownerDocument?.defaultView;
		if (!win || !scope.active || this.hidden || this.disposed) return;
		if (!this.composing) { action(); return; }
		if ([...this.settledActions].some(pending => pending.scope === scope)) return;
		let release = () => {};
		const pending = {
			scope,
			run: () => {
				pending.cancel();
				if (scope.active && !this.hidden && !this.disposed) action();
			},
			cancel: () => { win.clearTimeout(timer); this.settledActions.delete(pending); release(); },
		};
		const timer = win.setTimeout(() => {
			if ([...this.renders].some(render => render.composing)) this.settledActions.add(pending);
			else pending.run();
		}, 0);
		release = scope.own(pending.cancel);
		this.settledActions.add(pending);
	}

	private drainActions(): void {
		if (![...this.renders].some(render => render.composing)) for (const action of this.settledActions) action.run();
	}

	private cancelActions(): void { for (const action of this.settledActions) action.cancel(); }

	private watch(doc: Document): void {
		if (doc === this.ownerDocument) return;
		this.observer?.disconnect();
		this.removeWindow?.();
		this.ownerDocument = doc;
		this.lastDocument = doc;
		const win = doc.defaultView;
		if (!win) return;
		const pagehide = () => {
			if ([...this.renders].some(render => render.root.ownerDocument !== doc) || (this.adoptionRoot && this.adoptionRoot.ownerDocument !== doc)) this.checkDocument();
			else { this.closedDocuments.add(doc); this.hide(); }
		};
		win.addEventListener("pagehide", pagehide);
		this.removeWindow = () => win.removeEventListener("pagehide", pagehide);
		// The old document receives removal records even after the subtree is adopted elsewhere.
		const Observer = (win as Window & { MutationObserver: typeof MutationObserver }).MutationObserver;
		this.observer = new Observer(() => this.checkDocument());
		this.observer.observe(doc, { childList: true, subtree: true });
	}

	private checkDocument(): void {
		if (this.hidden || this.disposed) return;
		const adopted = [...this.renders].find(render => render.root.ownerDocument !== render.attachedDocument)?.root ?? this.adoptionRoot;
		if (adopted && adopted.ownerDocument !== this.ownerDocument) {
			this.moving = true;
			this.adoptionRoot = adopted;
			this.retireRenders();
			this.watch(adopted.ownerDocument);
		}
		if (this.moving) {
			const root = this.adoptionRoot;
			const win = root?.ownerDocument.defaultView;
			if (root?.isConnected && win && this.scheduled === undefined) this.scheduled = { window: win, timer: win.setTimeout(() => {
				this.scheduled = undefined;
				if (this.hidden || this.disposed || !root.isConnected) return;
				this.moving = false;
				this.adoptionRoot = undefined;
				this.update();
			}, 0) };
			return;
		}
		for (const render of this.renders) {
			const composing = render.composing as Node | undefined;
			if (!render.root.isConnected || (composing && !render.root.contains(composing))) {
				this.pending = false;
				render.scope.dispose();
			}
		}
		// Native provider pages need not be descendants of the original tab container.
		if (!this.renders.size) this.hide();
	}

	private cancelScheduled(): void {
		if (this.scheduled) this.scheduled.window.clearTimeout(this.scheduled.timer);
		this.scheduled = undefined;
	}

	private retireRenders(): void {
		runInputCleanups(...[...this.renders].map(render => () => render.scope.dispose()));
	}

	/** Navigation hides controls but detached drafts belong to the tab until plugin disposal. */
	hide(): void {
		this.hidden = true;
		this.pending = false;
		this.moving = false;
		this.adoptionRoot = undefined;
		this.cancelScheduled();
		this.cancelActions();
		this.retireRenders();
		this.observer?.disconnect();
		this.removeWindow?.();
		this.ownerDocument = undefined;
	}

	dispose(): void { this.disposed = true; this.hide(); this.lastDocument = undefined; }
}

const scopes = new WeakMap<HTMLElement, InputSuggestScope>();

/** Attempt every teardown step even if an external cleanup fails. */
export function runInputCleanups(...cleanups: (() => void)[]): void {
	for (const cleanup of cleanups) {
		try { cleanup(); } catch (error) { console.error("Entities cleanup failed", error); }
	}
}

/** Find the rendered view that owns an input or a nested settings editor. */
export function inputSuggestScope(element: HTMLElement): InputSuggestScope | undefined {
	for (let current: HTMLElement | null = element; current; current = current.parentElement) {
		const scope = scopes.get(current);
		if (scope) return scope;
	}
	return undefined;
}

/** Bounded cleanup for one plugin lifetime, rendered view, or nested editor. */
export class InputSuggestScope {
	private cleanups = new Set<() => void>();
	private releaseParent?: () => void;
	private disposed = false;
	private readonly attachedDocument?: Document;
	private readonly attachedWindow?: Window | null;
	private readonly onPageHide = () => this.dispose();

	constructor(private root?: HTMLElement, parent?: InputSuggestScope) {
		this.attachedDocument = root?.ownerDocument;
		this.attachedWindow = this.attachedDocument?.defaultView;
		if (root) {
			scopes.get(root)?.dispose();
			parent ??= root.parentElement ? inputSuggestScope(root.parentElement) : undefined;
			scopes.set(root, this);
			this.attachedWindow?.addEventListener("pagehide", this.onPageHide);
		}
		this.releaseParent = parent?.own(() => this.dispose());
	}

	get active(): boolean {
		if (this.root && this.root.ownerDocument !== this.attachedDocument) this.dispose();
		return !this.disposed && this.root?.isConnected !== false;
	}

	/** Return an unregister function so shorter-lived children do not accumulate. */
	own(cleanup: () => void): () => void {
		if (this.disposed) {
			runInputCleanups(cleanup);
			return () => {};
		}
		this.cleanups.add(cleanup);
		return () => { this.cleanups.delete(cleanup); };
	}

	/** Release the captured save callback as well as rejecting calls after teardown. */
	guard<Args extends unknown[], Result>(callback: (...args: Args) => Result): (...args: Args) => Result | undefined {
		let current: typeof callback | undefined = callback;
		this.own(() => { current = undefined; });
		return (...args) => this.active ? current?.(...args) : undefined;
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		const releaseParent = this.releaseParent;
		this.releaseParent = undefined;
		const cleanups = Array.from(this.cleanups);
		this.cleanups.clear();
		if (this.root && scopes.get(this.root) === this) scopes.delete(this.root);
		this.root = undefined;
		runInputCleanups(
			() => releaseParent?.(),
			() => this.attachedWindow?.removeEventListener("pagehide", this.onPageHide),
			...cleanups
		);
	}
}

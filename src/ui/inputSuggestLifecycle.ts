const scopes = new WeakMap<HTMLElement, InputSuggestScope>();

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
	private readonly onPageHide = () => this.dispose();

	constructor(private root?: HTMLElement, parent?: InputSuggestScope) {
		if (root) {
			scopes.get(root)?.dispose();
			parent ??= root.parentElement ? inputSuggestScope(root.parentElement) : undefined;
			scopes.set(root, this);
			root.ownerDocument?.defaultView?.addEventListener("pagehide", this.onPageHide);
		}
		this.releaseParent = parent?.own(() => this.dispose());
	}

	get active(): boolean {
		return !this.disposed && this.root?.isConnected !== false;
	}

	/** Return an unregister function so shorter-lived children do not accumulate. */
	own(cleanup: () => void): () => void {
		if (this.disposed) {
			cleanup();
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
		this.releaseParent?.();
		this.releaseParent = undefined;
		const cleanups = Array.from(this.cleanups);
		this.cleanups.clear();
		for (const cleanup of cleanups) cleanup();
		this.root?.ownerDocument?.defaultView?.removeEventListener("pagehide", this.onPageHide);
		if (this.root && scopes.get(this.root) === this) scopes.delete(this.root);
		this.root = undefined;
	}
}

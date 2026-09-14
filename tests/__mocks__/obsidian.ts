export { editorInfoField } from "../editorInfoFixture";
// import EventEmitter from "events";

/** Basic obsidian abstraction for any file or folder in a vault. */
export abstract class TAbstractFile {
    // /**
    //  * @public
    //  */
    // vault: Vault;
    /**
     * @public
     */
    path: string;
    /**
     * @public
     */
    name: string;
    /**
     * @public
     */
    parent: TFolder;
}

/** Tracks file created/modified time as well as file system size. */
export interface FileStats {
    /** @public */
    ctime: number;
    /** @public */
    mtime: number;
    /** @public */
    size: number;
}

/** A regular file in the vault. */
export class TFile extends TAbstractFile {
    stat: FileStats;
    basename: string;
    extension: string;
}

/** A folder in the vault. */
export class TFolder extends TAbstractFile {
    children: TAbstractFile[];

    isRoot(): boolean {
        return false;
    }
}

// export class Vault extends EventEmitter {
//     getFiles() {
//         return [];
//     }
//     trigger(name: string, ...data: any[]): void {
//         this.emit(name, ...data);
//     }
// }

export class Component {
    registerEvent() {}
}

/** Scope ordering mirrors the separately executed native method fixture; no DOM routing is simulated here. */
export class Scope {
	private handlers: { key: string; callback: (event: KeyboardEvent) => unknown }[] = [];
	constructor(private parent?: Scope) {}
	register(modifiers: string[], key: string, callback: (event: KeyboardEvent) => unknown) {
		this.handlers.push({ key, callback });
	}
	handleKey(event: KeyboardEvent): unknown {
		const handler = this.handlers.find(handler => handler.key === event.key);
		return handler ? handler.callback(event) : this.parent?.handleKey(event);
	}
}

export function pressScopeKey(scope: unknown, key: string, isComposing = false): unknown {
	return (scope as Scope).handleKey(new KeyboardEvent("keydown", { key, isComposing }));
}

/** Public parser contract, checked separately against extracted native host methods. */
export function parseFrontMatterStringArray(frontmatter: Record<string, unknown>, key: string): string[] | null {
	const value = frontmatter[key];
	if (typeof value === "string") return value.trim() ? [value.trim()] : null;
	if (!Array.isArray(value)) return null;
	return value.filter((item): item is string => typeof item === "string" && item.trim() !== "").map(item => item.trim());
}

export function parseFrontMatterAliases(frontmatter: Record<string, unknown>): string[] | null {
	const key = Object.keys(frontmatter).find(key => key.toLowerCase() === "aliases");
	return key === undefined ? null : parseFrontMatterStringArray(frontmatter, key);
}

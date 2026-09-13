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

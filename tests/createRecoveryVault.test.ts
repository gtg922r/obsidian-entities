/** @jest-environment node */
import { spawnSync } from "child_process";
import { createHash } from "crypto";
import {
	cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
	readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

const script = resolve(__dirname, "../scripts/create-recovery-vault.mjs");
const fixture = resolve(__dirname, "fixtures/recovery-vault");
const manifest = { id: "entities", name: "Entities", version: "0.4.4", minAppVersion: "1.7.2", isDesktopOnly: false };

describe("disposable recovery vault CLI", () => {
	let root: string;
	let artifact: string;
	let destination: string;

	beforeEach(() => {
		root = mkdtempSync(join(realpathSync(tmpdir()), "entities-fixture-test-"));
		artifact = join(root, "artifact");
		destination = join(root, "new vault 東京");
		mkdirSync(artifact);
		writeFileSync(join(artifact, "manifest.json"), JSON.stringify(manifest));
		// Executing this artifact would fail: generation must only read bytes.
		writeFileSync(join(artifact, "main.js"), 'throw new Error("Do not execute fixture artifacts");\n');
		writeFileSync(join(artifact, "styles.css"), ".fixture {}\n");
	});

	afterEach(() => rmSync(root, { recursive: true, force: true }));

	function run(args = ["--destination", destination, "--artifact", artifact], entry = script) {
		return spawnSync(process.execPath, [entry, ...args], { encoding: "utf8" });
	}

	function expectRefusal(args?: string[], entry?: string) {
		const result = run(args, entry);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("Recovery fixture:");
		expect(existsSync(destination)).toBe(false);
		return result;
	}

	it("copies only allowlisted artifacts, separately seeds legacy settings, and records exact bytes", () => {
		writeFileSync(join(artifact, "data.json"), '{"secret":"PRIVATE ARTIFACT SETTINGS"}');
		writeFileSync(join(artifact, "data.json.bak"), "PRIVATE BACKUP");
		writeFileSync(join(artifact, "main.js.map"), "PRIVATE SOURCE MAP");
		mkdirSync(join(artifact, "backups"));
		writeFileSync(join(artifact, "backups/data.json"), "PRIVATE NESTED BACKUP");
		symlinkSync(join(root, "absent"), join(artifact, "unlisted-link"));
		const result = run();
		expect(result.status).toBe(0);
		expect(result.stdout).toContain("Runtime acceptance: NOT RUN");
		const installed = join(destination, ".obsidian/plugins/entities");
		expect(readdirSync(installed).sort()).toEqual(["data.json", "main.js", "manifest.json", "styles.css"]);
		expect(readFileSync(join(installed, "data.json"))).toEqual(readFileSync(join(fixture, "legacy-data.json")));
		expect(JSON.parse(readFileSync(join(destination, ".obsidian/community-plugins.json"), "utf8"))).toEqual([]);
		const receiptText = readFileSync(join(destination, "RECOVERY-FIXTURE.json"), "utf8");
		const receipt = JSON.parse(receiptText);
		expect(receiptText).not.toContain(root);
		expect(receiptText).not.toContain("PRIVATE");
		expect(receipt.artifact).toMatchObject({ id: "entities", version: "0.4.4", minAppVersion: "1.7.2", isDesktopOnly: false });
		expect(receipt.runtimeAcceptance).toBe("NOT RUN");
		for (const [path, hash] of Object.entries(receipt.fixtureFiles)) {
			const bytes = readFileSync(join(destination, path));
			expect(hash).toEqual({ bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
		}
		for (const [name, hash] of Object.entries(receipt.artifact.files)) {
			const bytes = readFileSync(join(installed, name));
			expect(bytes).toEqual(readFileSync(join(artifact, name)));
			expect(hash).toEqual({ bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
		}
		expect(readFileSync(join(destination, "Templates/Templater/Failure.md"), "utf8")).toContain("throw new Error");
		expect(existsSync(join(destination, "Sources/People/Zoë 東京.md"))).toBe(true);
	});

	it("produces the same receipt and note bytes in two fresh destinations", () => {
		expect(run().status).toBe(0);
		const second = join(root, "second");
		expect(run(["--artifact", artifact, "--destination", second]).status).toBe(0);
		expect(readFileSync(join(second, "RECOVERY-FIXTURE.json"))).toEqual(readFileSync(join(destination, "RECOVERY-FIXTURE.json")));
	});

	it("accepts artifacts without optional styles.css", () => {
		rmSync(join(artifact, "styles.css"));
		expect(run().status).toBe(0);
		expect(existsSync(join(destination, ".obsidian/plugins/entities/styles.css"))).toBe(false);
	});

	it.each(["main.js", "manifest.json"])("rejects missing required artifact %s before writing", (name) => {
		rmSync(join(artifact, name));
		expectRefusal();
	});

	it.each(["main.js", "manifest.json"])("rejects empty required artifact %s before writing", (name) => {
		writeFileSync(join(artifact, name), "");
		expectRefusal();
	});

	it.each(["{", "null", JSON.stringify({ ...manifest, id: "../outside" }), JSON.stringify({ ...manifest, version: "" })])("rejects invalid manifests (%s)", (content) => {
		writeFileSync(join(artifact, "manifest.json"), content);
		expectRefusal();
		expect(readdirSync(root)).toEqual(["artifact"]);
	});

	it.each(["directory", "file", "symlink", "broken symlink"])("never overwrites an existing destination: %s", (kind) => {
		if (kind === "directory") mkdirSync(destination);
		else if (kind === "file") writeFileSync(destination, "KEEP");
		else symlinkSync(kind === "symlink" ? artifact : join(root, "missing"), destination);
		const before = lstatSync(destination);
		const result = run();
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("already exists");
		expect(lstatSync(destination).ino).toBe(before.ino);
		if (kind === "directory") expect(readdirSync(destination)).toEqual([]);
		if (kind === "file") expect(readFileSync(destination, "utf8")).toBe("KEEP");
	});

	it.each(["main.js", "manifest.json", "styles.css"])("rejects symlinked allowlisted artifact %s", (name) => {
		const outside = join(root, "outside");
		writeFileSync(outside, "DO NOT COPY OR MODIFY");
		rmSync(join(artifact, name));
		symlinkSync(outside, join(artifact, name));
		expectRefusal();
		expect(readFileSync(outside, "utf8")).toBe("DO NOT COPY OR MODIFY");
	});

	it("rejects symlinked artifact ancestors", () => {
		const linked = join(root, "linked");
		symlinkSync(root, linked);
		expectRefusal(["--destination", destination, "--artifact", join(linked, "artifact")]);
	});

	it("rejects symlinked destination ancestors", () => {
		const linked = join(root, "linked");
		symlinkSync(root, linked);
		expectRefusal(["--destination", join(linked, "escaped"), "--artifact", artifact]);
		expect(existsSync(join(root, "escaped"))).toBe(false);
	});

	it("rejects non-file artifacts", () => {
		rmSync(join(artifact, "main.js"));
		mkdirSync(join(artifact, "main.js"));
		expectRefusal();
	});

	it("rejects symlinked fixture notes before creating a destination", () => {
		const kit = join(root, "kit");
		mkdirSync(join(kit, "scripts"), { recursive: true });
		cpSync(script, join(kit, "scripts/create-recovery-vault.mjs"));
		cpSync(fixture, join(kit, "tests/fixtures/recovery-vault"), { recursive: true });
		symlinkSync(join(artifact, "main.js"), join(kit, "tests/fixtures/recovery-vault/notes/linked.md"));
		expectRefusal(undefined, join(kit, "scripts/create-recovery-vault.mjs"));
	});

	it("refuses nesting inside an existing vault", () => {
		mkdirSync(join(root, ".obsidian"));
		expectRefusal();
	});

	it("requires an existing destination parent", () => {
		expectRefusal(["--destination", join(root, "missing/new"), "--artifact", artifact]);
		expect(existsSync(join(root, "missing"))).toBe(false);
	});

	it.each([
		{ args: [] }, { args: ["--destination", "relative"] }, { args: ["--unknown", "value"] },
		{ args: ["--destination", "/new", "--destination", "/another", "--artifact", "/artifact"] },
	])("requires exactly two explicit named arguments: $args", ({ args }) => {
		expectRefusal(args);
	});

	it("rejects traversal and relative paths", () => {
		for (const target of ["relative-vault", `${root}/artifact/../new`, `${root}/./new`]) {
			expectRefusal(["--destination", target, "--artifact", artifact]);
		}
		expect(existsSync(join(root, "new"))).toBe(false);
	});

	it("prints help without touching the filesystem", () => {
		expect(run(["--help"]).status).toBe(0);
		expect(readdirSync(root)).toEqual(["artifact"]);
	});
});

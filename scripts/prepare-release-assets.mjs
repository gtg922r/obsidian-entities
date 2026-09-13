#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ARTIFACTS, cli, cleanHead, git, metadata, readBytes, releaseNotes, REPOSITORY, run, sha256, sourceBytes, validateRepository, validateTagSource, validateToolchain, version } from "./release-utils.mjs";

cli(() => {
	const [tag, flag] = process.argv.slice(2);
	version(tag);
	if (process.argv.length > 4 || (flag && flag !== "--dry-run")) throw new Error("Usage: prepare-release-assets.mjs <version> [--dry-run]");
	validateRepository();
	const commit = cleanHead();
	const source = metadata(tag, (file) => sourceBytes(commit, file));
	validateToolchain(source.pkg);
	const hasStyles = git(["ls-tree", "--name-only", commit]).split("\n").includes("styles.css");
	const notes = releaseNotes(source.bytes["CHANGELOG.md"].toString(), tag);
	validateTagSource(tag, commit);
	const output = resolve("dist", "release", tag);
	if (existsSync(output)) throw new Error(`Output already exists: ${output}. Preserve it; choose a new candidate version or deliberately move it aside.`);
	if (flag) {
		process.stdout.write(`Dry run: validated ${tag}, source ${commit}, metadata, notes, toolchain and unused output path.\nPlanned only: fresh source export, npm ci, npm run check, package to ${output}. Install/build/artifact bytes were NOT validated.\n`);
		return;
	}
	// Export only committed files; ignored local builds, vault data and dependencies never enter the build.
	const workspace = mkdtempSync(join(tmpdir(), "entities-release-build-"));
	let stage;
	try {
		const archive = run("git", ["archive", "--format=tar", commit], { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
		run("tar", ["-xf", "-", "-C", workspace], { input: archive, stdio: ["pipe", "inherit", "inherit"] });
		rmSync(join(workspace, "main.js"), { force: true });
		run("npm", ["ci"], { cwd: workspace });
		// An install hook cannot supply the production build output.
		rmSync(join(workspace, "main.js"), { force: true });
		run("npm", ["run", "check"], { cwd: workspace });
		for (const [file, hash] of Object.entries(source.hashes)) {
			if (sha256(readBytes(join(workspace, file))) !== hash) throw new Error(`Build changed checked metadata: ${file}`);
		}
		if (cleanHead() !== commit) throw new Error("Source changed while packaging; candidate rejected.");
		validateTagSource(tag, commit);
		const files = {};
		for (const file of ARTIFACTS) {
			const path = join(workspace, file);
			if (file === "styles.css" && !hasStyles) {
				if (existsSync(path)) throw new Error("Build injected uncommitted styles.css.");
				continue;
			}
			files[file] = readBytes(path);
			if (!files[file].length && file !== "styles.css") throw new Error(`Empty artifact: ${file}`);
		}
		if (/sourceMappingURL\s*=/.test(files["main.js"].toString())) throw new Error("Production main.js contains a source map reference.");
		if (sha256(files["manifest.json"]) !== source.hashes["manifest.json"]) throw new Error("Build manifest differs from checked source bytes.");
		// Styles are a committed optional input, not a generated or locally injected artifact.
		if (files["styles.css"] && sha256(files["styles.css"]) !== sha256(sourceBytes(commit, "styles.css"))) throw new Error("Build styles differ from source bytes.");
		const receipt = {
			schemaVersion: 1, repository: REPOSITORY, tag, sourceCommit: commit,
			minAppVersion: source.manifest.minAppVersion,
			toolchain: { node: process.versions.node, npm: "11.19.0" },
			metadata: source.hashes,
			artifacts: Object.fromEntries(Object.entries(files).map(([file, bytes]) => [file, { sha256: sha256(bytes), size: bytes.length }])),
			notesSha256: sha256(notes),
		};
		mkdirSync(resolve("dist", "release"), { recursive: true });
		stage = mkdtempSync(resolve("dist", "release", `.${tag}-`));
		for (const [file, bytes] of Object.entries(files)) writeFileSync(join(stage, file), bytes, { flag: "wx" });
		writeFileSync(join(stage, "release-notes.md"), notes, { flag: "wx" });
		writeFileSync(join(stage, "receipt.json"), `${JSON.stringify(receipt, null, "\t")}\n`, { flag: "wx" });
		if (existsSync(output)) throw new Error("Output appeared while building; refusing to overwrite it.");
		renameSync(stage, output);
		stage = undefined;
		process.stdout.write(`Prepared ${output} from ${commit}. Retain receipt.json with these exact bytes for BRAT acceptance.\n`);
	} finally {
		if (stage) rmSync(stage, { recursive: true, force: true });
		rmSync(workspace, { recursive: true, force: true });
	}
});

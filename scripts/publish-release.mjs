#!/usr/bin/env node
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ARTIFACTS, cli, git, json, metadata, readBytes, releaseNotes, REMOTE, REPOSITORY, run, sha256, sourceBytes, validateRepository, validateTagSource, validateToolchain, version } from "./release-utils.mjs";

cli(() => {
	const args = process.argv.slice(2);
	const tags = args.filter((arg) => !arg.startsWith("-"));
	const flags = args.filter((arg) => arg.startsWith("-"));
	// Keep the asset path deterministic so a similarly named directory cannot select another candidate.
	if (tags.length !== 1 || new Set(flags).size !== flags.length || flags.some((arg) => !["--prerelease", "--dry-run"].includes(arg))) throw new Error("Usage: publish-release.mjs <version> --prerelease [--dry-run]");
	if (!flags.includes("--prerelease")) throw new Error("Stable publication/promotion is disabled. Explicit --prerelease is required; promotion must preserve tested assets and awaits separate review.");
	const tag = version(tags[0]);
	validateRepository();
	validateToolchain();
	const directory = resolve("dist", "release", tag);
	const receiptBytes = readBytes(join(directory, "receipt.json"));
	const receipt = json(receiptBytes);
	if (receipt.schemaVersion !== 1 || receipt.repository !== REPOSITORY || receipt.tag !== tag || !/^[a-f0-9]{40}$/.test(receipt.sourceCommit)) throw new Error("Receipt schema/repository/tag/source is invalid.");
	const commit = receipt.sourceCommit;
	if (git(["rev-parse", `${commit}^{commit}`]) !== commit) throw new Error("Receipt source is not an exact commit.");
	validateTagSource(tag, commit, true);
	const source = metadata(tag, (file) => sourceBytes(commit, file));
	if (receipt.minAppVersion !== source.manifest.minAppVersion || receipt.toolchain?.node !== "24.21.0" || receipt.toolchain?.npm !== "11.19.0") throw new Error("Receipt support floor/toolchain mismatch.");
	const sourceFiles = git(["ls-tree", "--name-only", commit]).split("\n");
	const expected = ARTIFACTS.filter((file) => file !== "styles.css" || sourceFiles.includes(file));
	const sameKeys = (actual, wanted) => JSON.stringify(Object.keys(actual ?? {}).sort()) === JSON.stringify([...wanted].sort());
	if (!sameKeys(receipt.metadata, Object.keys(source.hashes)) || Object.entries(source.hashes).some(([file, hash]) => receipt.metadata[file] !== hash)) throw new Error("Receipt metadata hashes disagree with source commit.");
	if (!sameKeys(receipt.artifacts, expected) || JSON.stringify(readdirSync(directory).sort()) !== JSON.stringify([...expected, "receipt.json", "release-notes.md"].sort())) throw new Error("Package must contain exactly the allowlisted artifacts, receipt and notes; extra/missing files rejected.");
	// Hold verified bytes in memory, then upload a private snapshot; later edits to the package cannot race the upload.
	const files = Object.fromEntries(expected.map((file) => [file, readBytes(join(directory, file))]));
	for (const [file, bytes] of Object.entries(files)) {
		if (receipt.artifacts[file]?.sha256 !== sha256(bytes) || receipt.artifacts[file]?.size !== bytes.length || (!bytes.length && file !== "styles.css")) throw new Error(`Artifact hash/size mismatch: ${file}`);
		if (file !== "main.js" && sha256(bytes) !== sha256(sourceBytes(commit, file))) throw new Error(`Artifact differs from committed source: ${file}`);
	}
	if (/sourceMappingURL\s*=/.test(files["main.js"].toString())) throw new Error("Production main.js contains a source map reference.");
	const notes = readBytes(join(directory, "release-notes.md"));
	if (sha256(notes) !== receipt.notesSha256 || notes.toString() !== releaseNotes(source.bytes["CHANGELOG.md"].toString(), tag)) throw new Error("Release notes differ from receipt or source.");
	const remoteTagCommit = () => {
		const refs = git(["ls-remote", "--tags", REMOTE, `refs/tags/${tag}`, `refs/tags/${tag}^{}`]).split("\n").filter(Boolean).map((line) => line.split(/\s+/));
		const remoteCommit = refs.find(([, ref]) => ref === `refs/tags/${tag}^{}`)?.[0] ?? refs.find(([, ref]) => ref === `refs/tags/${tag}`)?.[0];
		return remoteCommit;
	};
	if (remoteTagCommit() !== commit) throw new Error("Remote tag missing or points to a different source commit. Push the reviewed tag deliberately before publication.");
	const listReleases = () => {
		const pages = JSON.parse(run("gh", ["api", "--hostname", "github.com", "--paginate", "--slurp", `repos/${REPOSITORY}/releases?per_page=100`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
		if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page))) throw new Error("Unexpected GitHub release-list response.");
		return pages.flat();
	};
	if (listReleases().some((release) => release.tag_name === tag)) throw new Error("Release already exists; refusing to replace or append assets. Inspect it before any recovery/promotion.");
	if (flags.includes("--dry-run")) {
		process.stdout.write(`Dry run: verified package, committed metadata, local/remote tag and absence of an existing release in ${REPOSITORY}.\nPlanned only: create draft ${tag} in github.com/${REPOSITORY}, upload verified snapshot, verify remote bytes and publish prerelease (--latest=false). No build/upload/dispatch performed.\n`);
		return;
	}
	const snapshot = mkdtempSync(join(tmpdir(), "entities-release-upload-"));
	try {
		for (const [file, bytes] of Object.entries({ ...files, "receipt.json": receiptBytes, "release-notes.md": notes })) writeFileSync(join(snapshot, file), bytes, { flag: "wx" });
		run("gh", ["release", "create", tag, "--repo", `github.com/${REPOSITORY}`, "--verify-tag", "--draft", "--prerelease", "--latest=false", "--title", tag, "--notes-file", join(snapshot, "release-notes.md"), ...expected.map((file) => join(snapshot, file)), join(snapshot, "receipt.json")]);
		const api = (endpoint, binary = false) => run("gh", ["api", "--hostname", "github.com", ...(binary ? ["-H", "Accept: application/octet-stream"] : []), `repos/${REPOSITORY}/${endpoint}`], { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 });
		const uploadedNames = [...expected, "receipt.json"];
		// The tag endpoint is documented for published releases; authenticated listing includes drafts.
		const getDraft = () => {
			const matches = listReleases().filter((release) => release.tag_name === tag);
			if (matches.length !== 1) throw new Error("Expected exactly one remote candidate draft.");
			return matches[0];
		};
		const draft = getDraft();
		const validateDraft = (release) => {
			if (!Number.isSafeInteger(release.id) || !release.draft || !release.prerelease || release.tag_name !== tag || !Array.isArray(release.assets) || JSON.stringify(release.assets.map((asset) => asset.name).sort()) !== JSON.stringify([...uploadedNames].sort())) throw new Error("Remote draft identity or asset allowlist mismatch.");
			for (const asset of release.assets) {
				if (!Number.isSafeInteger(asset.id) || asset.state !== "uploaded") throw new Error("Remote draft asset is incomplete.");
			}
		};
		validateDraft(draft);
		for (const asset of draft.assets) {
			const bytes = asset.name === "receipt.json" ? receiptBytes : files[asset.name];
			const remoteBytes = api(`releases/assets/${asset.id}`, true);
			if (asset.size !== bytes.length || sha256(remoteBytes) !== sha256(bytes)) throw new Error(`Remote asset bytes disagree: ${asset.name}`);
		}
		const rechecked = getDraft();
		validateDraft(rechecked);
		const assetIDs = (release) => release.assets.map(({ name, id }) => `${name}:${id}`).sort().join("\n");
		if (rechecked.id !== draft.id || assetIDs(rechecked) !== assetIDs(draft) || remoteTagCommit() !== commit) throw new Error("Remote draft/tag changed during verification.");
		run("gh", ["release", "edit", tag, "--repo", `github.com/${REPOSITORY}`, "--draft=false", "--prerelease", "--latest=false"]);
		process.stdout.write(`Published BRAT prerelease ${tag} from ${commit}. Stable promotion remains blocked pending runtime acceptance and a reviewed promotion path.\n`);
	} catch (error) {
		throw new Error(`Publication failed. The remote draft may be partial, or publication status uncertain; inspect GitHub before retrying. No assets will be automatically replaced or deleted.\n${error.message}`);
	} finally {
		rmSync(snapshot, { recursive: true, force: true });
	}
});

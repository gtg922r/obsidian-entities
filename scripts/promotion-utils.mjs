import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { ARTIFACTS, git, json, metadata, readBytes, releaseNotes, REMOTE, REPOSITORY, run, sha256, sourceBytes, version } from "./release-utils.mjs";

const SHA = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
export const positiveID = value => Number.isSafeInteger(value) && value > 0;

/** Fail closed on unknown fields, arrays, and missing fields in versioned evidence. */
export function keys(value, expected, label) {
	if (!value || typeof value !== "object" || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) throw new Error(`${label}: unexpected/missing fields.`);
}

export function exactCommit(commit) {
	if (typeof commit !== "string" || !SHA.test(commit) || git(["cat-file", "-t", commit]) !== "commit") throw new Error("Expected an exact available commit; fetch deliberately outside promotion.");
	return commit;
}

export function ancestor(older, newer) {
	exactCommit(older); exactCommit(newer);
	try { git(["merge-base", "--is-ancestor", older, newer]); } catch {
		throw new Error(`${older} must be an ancestor of ${newer}; preserve candidate/evidence history through reviewed merges.`);
	}
}

function recordPath(path) {
	if (typeof path !== "string" || !path.split("/").every(part => /^[A-Za-z0-9_.-]+$/.test(part) && part !== "." && part !== "..")) throw new Error("Evidence path must be a repository-relative file path without traversal.");
	return path;
}

/** Restrict evidence and metadata reads to committed regular files, not symlink targets. */
export function committedFile(commit, path) {
	const entry = git(["ls-tree", commit, "--", recordPath(path)]);
	if (!/^100(?:644|755) blob [a-f0-9]{40}\t/.test(entry) || entry.split("\t")[1] !== path) throw new Error(`Expected a committed regular file: ${path}`);
	return sourceBytes(commit, path);
}

/** Explicit GETs; all reads stay in memory and all API requests use the fixed repository/host. */
export function api(endpoint = "", accept = "application/vnd.github+json", paginate = false) {
	return run("gh", ["api", "--hostname", "github.com", "--method", "GET", "-H", `Accept: ${accept}`, ...(paginate ? ["--paginate", "--slurp"] : []), `repos/${REPOSITORY}${endpoint ? `/${endpoint}` : ""}`], { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 });
}

export function pages(endpoint) {
	const result = JSON.parse(api(endpoint, undefined, true));
	if (!Array.isArray(result) || !result.length || result.some(page => !Array.isArray(page))) throw new Error("Malformed paginated GitHub response.");
	return result.flat();
}

export function remoteFile(commit, path) {
	const local = committedFile(commit, path);
	const remote = api(`contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${commit}`, "application/vnd.github.raw+json");
	if (!remote.equals(local)) throw new Error(`Local/remote committed content mismatch: ${path}`);
	return remote;
}

/** Validate the retained R7a package without rebuilding or changing it. */
export function candidate(tag) {
	const directory = resolve("dist", "release", tag);
	const receiptBytes = readBytes(join(directory, "receipt.json"));
	const receipt = json(receiptBytes);
	keys(receipt, ["schemaVersion", "repository", "tag", "sourceCommit", "minAppVersion", "toolchain", "metadata", "artifacts", "notesSha256"], "Receipt");
	if (receipt.schemaVersion !== 1 || receipt.repository !== REPOSITORY || receipt.tag !== tag) throw new Error("Receipt schema/repository/tag mismatch.");
	const commit = exactCommit(receipt.sourceCommit);
	const source = metadata(tag, path => committedFile(commit, path));
	keys(receipt.toolchain, ["node", "npm"], "Receipt toolchain");
	if (receipt.minAppVersion !== source.manifest.minAppVersion || receipt.toolchain.node !== "24.21.0" || receipt.toolchain.npm !== "11.19.0" || source.pkg.engines?.node !== "24.21.0" || source.pkg.engines?.npm !== "11.19.0") throw new Error("Receipt support floor/toolchain mismatch.");
	keys(receipt.metadata, Object.keys(source.hashes), "Receipt metadata");
	if (Object.entries(source.hashes).some(([path, hash]) => receipt.metadata[path] !== hash)) throw new Error("Receipt metadata differs from candidate source.");
	const sourceFiles = git(["ls-tree", "--name-only", commit]).split("\n");
	const expected = ARTIFACTS.filter(path => path !== "styles.css" || sourceFiles.includes(path));
	keys(receipt.artifacts, expected, "Receipt artifacts");
	if (JSON.stringify(readdirSync(directory).sort()) !== JSON.stringify([...expected, "receipt.json", "release-notes.md"].sort())) throw new Error("Local package asset allowlist mismatch.");
	const files = Object.fromEntries(expected.map(path => [path, readBytes(join(directory, path))]));
	for (const [path, bytes] of Object.entries(files)) {
		keys(receipt.artifacts[path], ["sha256", "size"], `Receipt artifact ${path}`);
		if (receipt.artifacts[path].sha256 !== sha256(bytes) || receipt.artifacts[path].size !== bytes.length || (!bytes.length && path !== "styles.css")) throw new Error(`Local artifact hash/size mismatch: ${path}`);
		if (path !== "main.js" && !bytes.equals(committedFile(commit, path))) throw new Error(`Artifact differs from source: ${path}`);
	}
	if (/sourceMappingURL\s*=/.test(files["main.js"].toString())) throw new Error("Production main.js contains a source map reference.");
	const notes = readBytes(join(directory, "release-notes.md"));
	if (sha256(notes) !== receipt.notesSha256 || notes.toString() !== releaseNotes(source.bytes["CHANGELOG.md"].toString(), tag)) throw new Error("Release notes differ from receipt/source.");
	files["receipt.json"] = receiptBytes;
	return { tag, commit, receipt, receiptBytes, source, files, notes };
}

/** Pin the reviewed index and its report; this verifies consistency, not human approval. */
export function acceptance(reference, c) {
	const match = /^([a-f0-9]{40}):(.+\.json)$/.exec(reference ?? "");
	if (!match) throw new Error("--acceptance requires an exact commit:path.json reference.");
	const [, commit, path] = match;
	exactCommit(commit);
	const bytes = remoteFile(commit, path);
	const record = json(bytes);
	keys(record, ["schemaVersion", "repository", "tag", "sourceCommit", "tagObject", "releaseId", "receiptSha256", "minAppVersion", "metadataCommit", "assets", "review"], "Acceptance record");
	if (record.schemaVersion !== 1 || record.repository !== REPOSITORY || record.tag !== c.tag || record.sourceCommit !== c.commit || record.minAppVersion !== c.receipt.minAppVersion || record.receiptSha256 !== sha256(c.receiptBytes) || !positiveID(record.releaseId) || typeof record.tagObject !== "string" || !SHA.test(record.tagObject)) throw new Error("Acceptance candidate identity/receipt/support floor mismatch.");
	keys(record.assets, Object.keys(c.files), "Acceptance assets");
	const ids = new Set();
	for (const [name, asset] of Object.entries(record.assets)) {
		keys(asset, ["id", "size", "sha256"], "Acceptance asset");
		if (!positiveID(asset.id) || ids.has(asset.id) || asset.size !== c.files[name].length || asset.sha256 !== sha256(c.files[name])) throw new Error(`Acceptance asset ID/hash/size mismatch: ${name}`);
		ids.add(asset.id);
	}
	keys(record.review, ["commit", "path", "sha256"], "Acceptance review");
	if (typeof record.review.path !== "string" || !record.review.path.endsWith(".md") || typeof record.review.sha256 !== "string" || !HASH.test(record.review.sha256)) throw new Error("Acceptance review reference must pin a Markdown report and SHA-256.");
	ancestor(record.review.commit, commit);
	const report = remoteFile(record.review.commit, record.review.path);
	if (!report.toString().trim() || sha256(report) !== record.review.sha256) throw new Error("Acceptance review report hash/content mismatch.");
	ancestor(record.metadataCommit, commit);
	ancestor(c.commit, record.metadataCommit);
	verifyMetadata(record.metadataCommit, c);
	return { record, commit, path, bytes };
}

/** Both the recorded transition and the live default HEAD must expose the tested metadata. */
export function verifyMetadata(commit, c) {
	for (const [path, hash] of Object.entries(c.source.hashes)) {
		if (sha256(remoteFile(commit, path)) !== hash) throw new Error(`Default-branch metadata differs from candidate at ${commit}: ${path}`);
	}
}

export function refs(c, a) {
	const repo = json(api());
	if (repo.full_name !== REPOSITORY || typeof repo.default_branch !== "string") throw new Error("GitHub repository/default branch mismatch.");
	git(["check-ref-format", `refs/heads/${repo.default_branch}`]);
	const branchRef = `refs/heads/${repo.default_branch}`;
	const branchLines = git(["ls-remote", REMOTE, branchRef]).split("\n");
	if (branchLines.length !== 1 || branchLines[0].split(/\s+/)[1] !== branchRef || !SHA.test(branchLines[0].split(/\s+/)[0])) throw new Error("Missing/ambiguous remote default branch.");
	const head = branchLines[0].split(/\s+/)[0];
	const tagRef = `refs/tags/${c.tag}`;
	const tagLines = git(["ls-remote", "--tags", REMOTE, tagRef, `${tagRef}^{}`]).split("\n").filter(Boolean).map(line => line.split(/\s+/));
	if (tagLines.length < 1 || tagLines.length > 2 || new Set(tagLines.map(([, ref]) => ref)).size !== tagLines.length || tagLines.some(([sha, ref]) => !SHA.test(sha) || ![tagRef, `${tagRef}^{}`].includes(ref))) throw new Error("Missing/ambiguous remote tag.");
	const raw = tagLines.find(([, ref]) => ref === tagRef)?.[0];
	const peeled = tagLines.find(([, ref]) => ref === `${tagRef}^{}`)?.[0] ?? raw;
	if (raw !== a.record.tagObject || peeled !== c.commit || git(["rev-parse", tagRef]) !== raw || git(["rev-parse", `${tagRef}^{commit}`]) !== c.commit) throw new Error("Local/remote tag object or peeled source drift.");
	return { branch: repo.default_branch, head, raw, peeled };
}

function publishedTime(value) {
	if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().replace(".000Z", "Z") !== value) throw new Error("Malformed release publication timestamp.");
	return Date.parse(value);
}

function newerOrEqual(left, right) {
	const differences = version(left).split(".").map((part, i) => Number(part) - Number(right.split(".")[i]));
	return (differences.find(value => value !== 0) ?? 0) >= 0;
}

function assetIdentity(asset) {
	return [asset.name, asset.id, asset.size, asset.state, asset.digest ?? null, asset.created_at ?? null, asset.updated_at ?? null];
}

/** Read complete inventories and reject stale candidates or any observed identity drift. */
export function releaseState(c, a, stable = false) {
	const releases = pages("releases?per_page=100");
	const ids = new Set();
	for (const release of releases) {
		if (!release || !positiveID(release.id) || ids.has(release.id) || typeof release.tag_name !== "string" || typeof release.draft !== "boolean" || typeof release.prerelease !== "boolean") throw new Error("Malformed/duplicate release identity in GitHub list.");
		ids.add(release.id);
	}
	const matches = releases.filter(release => release.tag_name === c.tag);
	if (matches.length !== 1 || matches[0].id !== a.record.releaseId) throw new Error("Missing/duplicate/mismatched candidate release.");
	const release = json(api(`releases/${a.record.releaseId}`));
	const validate = value => {
		if (value.id !== a.record.releaseId || value.tag_name !== c.tag || value.draft !== false || value.prerelease !== !stable || value.body !== c.notes.toString()) throw new Error("Candidate release identity/status/body mismatch.");
		publishedTime(value.published_at);
		if (!Array.isArray(value.assets)) throw new Error("Missing candidate asset inventory.");
	};
	validate(release); validate(matches[0]);
	const others = releases.filter(value => !value.draft && !value.prerelease && value.id !== release.id);
	for (const other of others) {
		if (newerOrEqual(other.tag_name, c.tag) || publishedTime(other.published_at) >= publishedTime(release.published_at)) throw new Error("A higher/equal or later stable release blocks stale promotion.");
	}
	const assets = pages(`releases/${release.id}/assets?per_page=100`);
	const validateAssets = values => {
		if (values.length !== Object.keys(c.files).length || new Set(values.map(asset => asset?.id)).size !== values.length || new Set(values.map(asset => asset?.name)).size !== values.length) throw new Error("Remote asset allowlist or duplicate IDs/names mismatch.");
		for (const asset of values) {
			const expected = a.record.assets[asset?.name];
			if (!expected || !positiveID(asset.id) || asset.id !== expected.id || asset.size !== expected.size || asset.state !== "uploaded" || (asset.digest != null && asset.digest !== `sha256:${expected.sha256}`)) throw new Error("Remote asset identity/size/state/digest mismatch.");
		}
		return values.map(assetIdentity).sort((left, right) => left[0].localeCompare(right[0]));
	};
	const assetSnapshot = validateAssets(assets);
	for (const embedded of [release.assets, matches[0].assets]) {
		if (JSON.stringify(validateAssets(embedded)) !== JSON.stringify(assetSnapshot)) throw new Error("Remote asset inventories changed during verification.");
	}
	// Download counters may change through our own reads. Release updated_at may change on PATCH.
	const identity = value => [value.id, value.tag_name, value.name, value.body, value.target_commitish, value.created_at, value.published_at, value.immutable ?? null];
	if (JSON.stringify(identity(release)) !== JSON.stringify(identity(matches[0]))) throw new Error("Release changed during verification.");
	return { assets, identity: identity(release), assetSnapshot, others: others.map(value => [value.id, value.tag_name, value.published_at]).sort((left, right) => left[0] - right[0]), updatedAt: release.updated_at ?? null };
}

/** Download by ID every time, including the remote receipt; local evidence alone is insufficient. */
export function verifyDownloads(state, c) {
	for (const asset of state.assets) {
		const bytes = api(`releases/assets/${asset.id}`, "application/octet-stream");
		if (!bytes.equals(c.files[asset.name])) throw new Error(`Remote asset bytes differ from acceptance/local package: ${asset.name}`);
	}
}

export function unchanged(actual, expected, label) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} changed during verification.`);
}

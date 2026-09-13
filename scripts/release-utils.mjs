import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const REPOSITORY = "gtg922r/obsidian-entities";
export const REMOTE = `https://github.com/${REPOSITORY}.git`;
export const METADATA_FILES = ["package.json", "package-lock.json", "manifest.json", "versions.json", "CHANGELOG.md"];
export const ARTIFACTS = ["main.js", "manifest.json", "styles.css"];
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Reject versions Obsidian cannot use as ordinary release tags. */
export function version(value) {
	if (typeof value !== "string" || !SEMVER.test(value) || value.split(".").some((n) => !Number.isSafeInteger(Number(n)))) {
		throw new Error(`Invalid release version "${value}"; expected exact semver such as 0.4.5.`);
	}
	return value;
}

export function nextVersion(current, type) {
	const parts = version(current).split(".").map(Number);
	const index = ["major", "minor", "patch"].indexOf(type);
	if (index < 0) throw new Error("Expected patch, minor, or major.");
	parts[index]++;
	for (let i = index + 1; i < parts.length; i++) parts[i] = 0;
	return version(parts.join("."));
}

export function run(command, args, options = {}) {
	return execFileSync(command, args, { stdio: "inherit", ...options });
}

export function git(args, options = {}) {
	return run("git", args, {
		encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
		env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" }, ...options,
	}).trim();
}

export function readBytes(path) {
	if (!lstatSync(path).isFile()) throw new Error(`Expected a regular file: ${path}`);
	return readFileSync(path);
}

export function sourceBytes(commit, path) {
	return run("git", ["show", `${commit}:${path}`], { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 });
}

export function sha256(bytes) {
	return createHash("sha256").update(bytes).digest("hex");
}

export function json(bytes) {
	const value = JSON.parse(bytes.toString());
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a JSON object.");
	return value;
}

export function validateToolchain(pkg = json(readBytes("package.json"))) {
	if (process.versions.node !== "24.21.0" || run("npm", ["--version"], { encoding: "utf8", stdio: "pipe" }).trim() !== "11.19.0") {
		throw new Error("Use Node 24.21.0 and npm 11.19.0.");
	}
	if (pkg.engines?.node !== "24.21.0" || pkg.engines?.npm !== "11.19.0") throw new Error("Package engines disagree with the release toolchain.");
}

/** Require a root checkout and a known origin; never infer a publication repository. */
export function validateRepository() {
	if (resolve(git(["rev-parse", "--show-toplevel"])) !== resolve(process.cwd())) throw new Error("Run from the repository root.");
	const remote = git(["remote", "get-url", "origin"]);
	if (![REMOTE, REMOTE.slice(0, -4), `git@github.com:${REPOSITORY}.git`].includes(remote)) throw new Error("origin must identify gtg922r/obsidian-entities on github.com.");
}

export function cleanHead() {
	if (git(["status", "--porcelain", "--untracked-files=all"])) throw new Error("Working tree/index must be clean, including untracked files.");
	return git(["rev-parse", "HEAD"]);
}

export function validateTagSource(tag, commit, required = false) {
	const matches = git(["tag", "--list", version(tag)]);
	if (!matches && !required) return;
	if (!matches || git(["rev-parse", `refs/tags/${tag}^{commit}`]) !== commit) throw new Error(`Tag ${tag} must point to source commit ${commit}.`);
}

/** Parse one unambiguous section per version; link definitions must form a trailing block. */
export function parseChangelog(text) {
	const headings = [...text.matchAll(/^##[ \t]+([^\r\n]+)\r?$/gm)];
	const refs = [...text.matchAll(/^\[([^\]\r\n]+)\]:[^\r\n]*\r?$/gm)];
	const refsStart = refs[0]?.index ?? text.length;
	if (headings.some((h) => h.index > refsStart) || text.slice(refsStart).split(/\r?\n/).some((line) => line.trim() && !/^\[[^\]]+\]:\s*\S/.test(line))) {
		throw new Error("Changelog link definitions must be an unambiguous trailing block.");
	}
	const labels = new Set();
	for (const ref of refs) {
		const label = ref[1].toLowerCase();
		if (labels.has(label)) throw new Error(`Duplicate changelog link: ${ref[1]}`);
		labels.add(label);
	}
	const sections = new Map();
	for (const [i, heading] of headings.entries()) {
		const match = /^\[([^\]]+)\](?:[ \t]+-[ \t]+[^\r\n]+)?[ \t]*$/.exec(heading[1]);
		if (!match) throw new Error(`Unsupported changelog section: ${heading[1]}`);
		const label = match[1].toLowerCase() === "unreleased" ? "Unreleased" : version(match[1]);
		if (sections.has(label)) throw new Error(`Duplicate changelog section: ${label}`);
		const end = Math.min(headings[i + 1]?.index ?? text.length, refsStart);
		const bodyStart = heading.index + heading[0].length;
		sections.set(label, { start: heading.index, end, body: text.slice(bodyStart, end) });
	}
	if (!sections.has("Unreleased")) throw new Error("Missing changelog Unreleased section.");
	if (sections.keys().next().value !== "Unreleased") throw new Error("Unreleased must be the first changelog section.");
	return sections;
}

function hasNotes(body) {
	return body.replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/).some((line) => line.replace(/^\s*(?:[-*+]|\d+[.)])\s*/, "").trim() && !/^\s*#{1,6}\s/.test(line));
}

export function releaseNotes(text, tag) {
	const section = parseChangelog(text).get(version(tag));
	if (!section || !hasNotes(section.body)) throw new Error(`Missing or empty release notes for ${tag}.`);
	return `${section.body.trim()}\n`;
}

/** Insert a release without rewriting historic prose or link definitions; an empty rerun is a no-op. */
export function planChangelog(text, tag, date = new Date().toISOString().slice(0, 10)) {
	version(tag);
	const sections = parseChangelog(text);
	const unreleased = sections.get("Unreleased");
	if (sections.has(tag)) {
		releaseNotes(text, tag);
		if (hasNotes(unreleased.body)) throw new Error(`Release ${tag} already exists and Unreleased has content; refusing to replace history.`);
		return text;
	}
	if (!hasNotes(unreleased.body)) throw new Error("Unreleased notes are empty; write release notes before preparation.");
	const previous = [...sections.keys()].filter((v) => v !== "Unreleased")[0];
	const differences = previous ? tag.split(".").map((n, i) => Number(n) - Number(previous.split(".")[i])) : [1];
	if ((differences.find((difference) => difference !== 0) ?? 0) <= 0) throw new Error("New release must be newer than the latest changelog version.");
	let result = text.slice(0, unreleased.start) + `## [Unreleased]\n\n## [${tag}] - ${date}\n` + unreleased.body + text.slice(unreleased.end);
	if (/^\[[^\]]+\]:/m.test(text)) {
		if (new RegExp(`^\\[${tag.replaceAll(".", "\\.")}\\]:`, "m").test(text)) throw new Error(`Existing ${tag} link without a release section; reconcile the changelog explicitly.`);
		const unreleasedLink = `[Unreleased]: https://github.com/${REPOSITORY}/compare/${tag}...HEAD`;
		if (/^\[Unreleased\]:/im.test(result)) result = result.replace(/^\[Unreleased\]:[^\r\n]*/im, unreleasedLink);
		else result += `\n${unreleasedLink}\n`;
		const target = previous ? `compare/${previous}...${tag}` : `releases/tag/${tag}`;
		result += `\n[${tag}]: https://github.com/${REPOSITORY}/${target}\n`;
	}
	return result;
}

/** Validate all version-bearing metadata, including both lockfile versions and the support mapping. */
export function metadata(tag, read = readBytes) {
	version(tag);
	const bytes = Object.fromEntries(METADATA_FILES.map((file) => [file, read(file)]));
	const pkg = json(bytes["package.json"]);
	const lock = json(bytes["package-lock.json"]);
	const manifest = json(bytes["manifest.json"]);
	const versions = json(bytes["versions.json"]);
	if ([pkg.version, lock.version, lock.packages?.[""]?.version, manifest.version].some((v) => v !== tag)) throw new Error("Tag/package/lock/manifest versions disagree.");
	version(manifest.minAppVersion);
	if (versions[tag] !== manifest.minAppVersion) throw new Error("versions.json minimum version mapping disagrees with manifest.minAppVersion.");
	return { pkg, manifest, bytes, hashes: Object.fromEntries(METADATA_FILES.map((file) => [file, sha256(bytes[file])])) };
}

/** Atomic per-file writes, never rollback unrelated edits after a partial failure. */
export function writeAtomic(path, bytes) {
	const temporary = `${path}.release-${process.pid}.tmp`;
	try {
		writeFileSync(temporary, bytes, { flag: "wx" });
		renameSync(temporary, path);
	} finally {
		rmSync(temporary, { force: true });
	}
}

export function cli(action) {
	try { action(); } catch (error) {
		process.stderr.write(`${error.message}\n`);
		process.exitCode = 1;
	}
}

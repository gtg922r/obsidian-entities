#!/usr/bin/env node
import { cli, cleanHead, git, json, metadata, nextVersion, planChangelog, readBytes, run, validateRepository, validateToolchain } from "./release-utils.mjs";

cli(() => {
	const args = process.argv.slice(2);
	const type = args.shift();
	if (!type || args.some((arg) => !["--dry-run", "-n"].includes(arg)) || args.length > 1) throw new Error("Usage: release.mjs <patch|minor|major> [--dry-run]");
	const dryRun = args.length === 1;
	validateToolchain();
	validateRepository();
	const head = cleanHead();
	const current = json(readBytes("package.json")).version;
	metadata(current);
	const target = nextVersion(current, type);
	planChangelog(readBytes("CHANGELOG.md").toString(), target);
	// Resolve the configured upstream before installation; failures are prerequisites, not warnings.
	git(["rev-parse", "--verify", "@{upstream}"]);
	if (!dryRun) git(["fetch", "origin"]);
	if (git(["rev-parse", "@{upstream}"]) !== head) throw new Error("HEAD and upstream differ; reconcile them explicitly before preparation.");
	if (dryRun) {
		process.stdout.write(`Dry run: local clean tree, cached upstream, toolchain, metadata and notes validated for ${target}.\nPlanned only: fetch origin, verify upstream, npm ci, npm run release:check, npm version ${target} --no-git-tag-version.\nRemote freshness, dependency install and checks were NOT validated. No files/index/refs changed.\n`);
		return;
	}
	run("npm", ["ci"]);
	run("npm", ["run", "release:check"]);
	if (cleanHead() !== head) throw new Error("Checks changed the source revision.");
	try {
		run("npm", ["version", target, "--no-git-tag-version"]);
		metadata(target);
	} catch (error) {
		throw new Error(`Preparation failed; metadata may be partially changed. Inspect package.json, package-lock.json, manifest.json, versions.json and CHANGELOG.md; repair deliberately before retrying. No rollback, commit or tag was attempted.\n${error.message}`);
	}
	process.stdout.write(`Prepared ${target} locally. Review and commit the five metadata files on a candidate branch. No staging, commit, tag, push or publication performed.\n`);
});

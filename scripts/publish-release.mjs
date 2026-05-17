#!/usr/bin/env node
import { execFileSync } from "child_process";

const EXACT_SEMVER = /^\d+\.\d+\.\d+$/;

function fail(message) {
	process.stderr.write(`${message}\n`);
	process.exit(1);
}

function run(command, args, options = {}) {
	process.stdout.write(`$ ${command} ${args.join(" ")}\n`);
	return execFileSync(command, args, { stdio: "inherit", ...options });
}

const args = process.argv.slice(2);
const tag = args.find((arg) => !arg.startsWith("-"));
const prerelease = args.includes("--prerelease");
const dryRun = args.includes("--dry-run") || args.includes("-n");

if (!tag) {
	fail("Usage: node scripts/publish-release.mjs <1.9.10> [--prerelease] [--dry-run]");
}

if (!EXACT_SEMVER.test(tag)) {
	fail(`Invalid release tag "${tag}". Expected exact semver like 1.9.10.`);
}

try {
	execFileSync("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`], { stdio: "ignore" });
} catch {
	fail(`Local tag "${tag}" does not exist.`);
}

const prereleaseValue = prerelease ? "true" : "false";

if (dryRun) {
	run("git", ["push", "--dry-run", "origin", tag]);
	process.stdout.write(
		`Dry run: would run "gh workflow run release.yml --ref master -f tag=${tag} -f prerelease=${prereleaseValue}"\n`
	);
} else {
	run("git", ["push", "origin", tag]);
	run("gh", [
		"workflow",
		"run",
		"release.yml",
		"--ref",
		"master",
		"-f",
		`tag=${tag}`,
		"-f",
		`prerelease=${prereleaseValue}`,
	]);
}

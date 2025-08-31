#!/usr/bin/env node
import { execSync } from "child_process";

const COLORS = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	cyan: "\x1b[36m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	red: "\x1b[31m",
	dim: "\x1b[90m",
};

function log(step, message) {
	const cols = Math.min(process.stdout.columns || 80, 100);
	const line = "".padEnd(cols, "─");
	process.stdout.write(
		`\n${COLORS.cyan}${line}\n` +
		`${COLORS.bold}▶ ${step}${COLORS.reset} ${COLORS.bold}${message}${COLORS.reset}\n` +
		`${COLORS.cyan}${line}${COLORS.reset}\n`
	);
}

function ok(message) {
	process.stdout.write(`${COLORS.green}✔${COLORS.reset} ${message}\n`);
}

function warn(message) {
	process.stdout.write(`${COLORS.yellow}⚠${COLORS.reset} ${message}\n`);
}

function fail(message) {
	process.stderr.write(`${COLORS.red}✖ ${message}${COLORS.reset}\n`);
	process.exit(1);
}

function run(cmd, opts = {}) {
	process.stdout.write(`${COLORS.dim}$ ${cmd}${COLORS.reset}\n`);
	return execSync(cmd, { stdio: "inherit", ...opts });
}

// Parse CLI args: first non-flag is the release type; support --dry-run
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run") || args.includes("-n");
const showTestLogs = args.includes("--show-test-logs");
const type = args.find((a) => ["patch", "minor", "major"].includes(a));
if (!type) {
	fail("Usage: node scripts/release.mjs <patch|minor|major> [--dry-run|-n]");
}

try {
	log("Step 1:", "Checking working tree is clean");
	const status = execSync("git status --porcelain", { encoding: "utf8" }).trim();
	if (status) {
		fail("Working directory not clean. Commit or stash changes before releasing.");
	}
	ok("Working tree clean");

	log("Step 2:", "Fetching latest changes");
	run("git fetch --all --prune");
	try { run("git diff --quiet @{u}"); } catch { warn("Local branch is ahead or behind remote."); }
	try { run("git pull --ff-only"); } catch { warn("Fast-forward pull not possible. Ensure you are up-to-date."); }
	ok("Repository up-to-date");

	log("Step 3:", "Installing dependencies");
	try { run("npm ci"); } catch { warn("npm ci failed, falling back to npm install"); run("npm install"); }
	ok("Dependencies installed");

	log("Step 4:", "Running tests");
	run(showTestLogs ? "npm test --silent=false --verbose --runInBand" : "npm test");
	ok("Tests passed");

	log("Step 5:", "Building project");
	run("npm run build");
	ok("Build succeeded");

	log(
		"Step 6:",
		dryRun
			? `Bumping version (${type}) without git tag/commit and updating changelog`
			: `Bumping version (${type}) and updating changelog`
	);
	// In dry-run, run lifecycle scripts (to update CHANGELOG, etc.) but avoid tagging/committing
	const versionCmd = `npm version ${type} -m "chore(release): %s"` + (dryRun ? " --no-git-tag-version" : "");
	run(versionCmd);
	ok(
		dryRun
			? "Version + lifecycle ran; files updated, no tag/commit"
			: "Version bumped, changelog updated, tag created"
	);

	log(
		"Step 7:",
		dryRun ? "Dry-run: would push commit and tags" : "Pushing commit and tags"
	);
	if (dryRun) {
		run("git push --dry-run");
		run("git push --tags --dry-run");
		ok("Dry-run complete. No changes pushed.");
	} else {
		run("git push");
		run("git push --tags");
		ok("Pushed to origin. GitHub Actions will build and publish the release.");
	}

} catch (err) {
	fail(err.message || String(err));
}

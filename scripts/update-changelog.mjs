import { readFileSync, writeFileSync, existsSync } from "fs";
import { execSync } from "child_process";

function logInfo(message) {
	process.stdout.write(`\x1b[36mℹ\x1b[0m ${message}\n`);
}

function logSuccess(message) {
	process.stdout.write(`\x1b[32m✔\x1b[0m ${message}\n`);
}

function logWarn(message) {
	process.stdout.write(`\x1b[33m⚠\x1b[0m ${message}\n`);
}

function normalizeRepoUrl(remote) {
	if (!remote) return null;
	let url = remote.trim();
	if (url.startsWith("git@github.com:")) {
		url = "https://github.com/" + url.replace("git@github.com:", "");
	}
	// Remove .git suffix if present
	url = url.replace(/\.git$/, "");
	return url;
}

function getRepoUrl() {
	try {
		const remote = execSync("git config --get remote.origin.url", { encoding: "utf8" }).trim();
		return normalizeRepoUrl(remote);
	} catch {
		return null;
	}
}

function getToday() {
	const d = new Date();
	const yyyy = d.getFullYear();
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const dd = String(d.getDate()).padStart(2, "0");
	return `${yyyy}-${mm}-${dd}`;
}

function ensureInitialChangelog() {
	if (!existsSync("CHANGELOG.md")) {
		const initial = `# Changelog\n\nAll notable changes to this project will be documented in this file.\n\nThe format is based on Keep a Changelog, and this project adheres to Semantic Versioning.\n\nSee: https://keepachangelog.com/en/1.1.0/\n\n## [Unreleased]\n\n- Added\n- Changed\n- Deprecated\n- Removed\n- Fixed\n- Security\n`;
		writeFileSync("CHANGELOG.md", initial);
		logInfo("Initialized CHANGELOG.md with Keep a Changelog structure");
	}
}

function extractLatestReleasedVersion(changelog) {
	const versionHeadingRegex = /^## \[(\d+\.\d+\.\d+)\]/m;
	const match = changelog.match(versionHeadingRegex);
	return match ? match[1] : null;
}

function updateChangelog() {
	ensureInitialChangelog();
	const changelogPath = "CHANGELOG.md";
	let changelog = readFileSync(changelogPath, "utf8");
	const pkg = JSON.parse(readFileSync("package.json", "utf8"));
	const currentVersion = pkg.version;
	const today = getToday();

	// Ensure Unreleased section exists
	if (!/^## \[Unreleased\]/m.test(changelog)) {
		changelog = changelog.trim() + "\n\n## [Unreleased]\n\n";
	}

	// Capture Unreleased content
	const unreleasedSectionRegex = /(## \[Unreleased\]\s*)([\s\S]*?)(?=^##\s\[|^##\s[^\[]|\Z)/m;
	const unreleasedMatch = changelog.match(unreleasedSectionRegex);
	let unreleasedContent = unreleasedMatch ? unreleasedMatch[2].trim() : "";
	if (!unreleasedContent) {
		unreleasedContent = "- No notable changes.";
		logWarn("No content found under Unreleased. Using placeholder.");
	}

	// Build new version section
	const newVersionSection = `## [${currentVersion}] - ${today}\n${unreleasedContent}\n\n`;

	// Replace Unreleased section with empty template and insert new version below it
	const newUnreleasedSection = "## [Unreleased]\n\n";
	if (unreleasedMatch) {
		const prefix = changelog.slice(0, unreleasedMatch.index);
		const suffix = changelog.slice(unreleasedMatch.index + unreleasedMatch[0].length);
		changelog = prefix + newUnreleasedSection + newVersionSection + suffix;
	} else {
		changelog = changelog + "\n" + newUnreleasedSection + newVersionSection;
	}

	// Update link references
	const repoUrl = getRepoUrl();
	if (!repoUrl) {
		logWarn("Could not determine repository URL from git. Skipping compare links.");
		writeFileSync(changelogPath, changelog.trim() + "\n");
		logSuccess(`Updated CHANGELOG.md for ${currentVersion}`);
		return;
	}

	const latestReleasedBefore = extractLatestReleasedVersion(changelog.replace(newVersionSection, ""));

	// Remove existing Unreleased and current version link definitions
	const lines = changelog.split(/\r?\n/);
	const filtered = lines.filter(
		(line) => !line.startsWith("[Unreleased]:") && !line.startsWith(`[${currentVersion}]:`)
	);

	const unreleasedLink = `[Unreleased]: ${repoUrl}/compare/v${currentVersion}...HEAD`;
	let currentVersionLink;
	if (latestReleasedBefore) {
		currentVersionLink = `[${currentVersion}]: ${repoUrl}/compare/v${latestReleasedBefore}...v${currentVersion}`;
	} else {
		currentVersionLink = `[${currentVersion}]: ${repoUrl}/releases/tag/v${currentVersion}`;
	}

	// Ensure a blank line before link refs block
	let updated = filtered.join("\n").replace(/\n*$/, "\n\n");
	updated += `${unreleasedLink}\n${currentVersionLink}\n`;

	writeFileSync(changelogPath, updated);
	logSuccess(`Updated CHANGELOG.md for ${currentVersion}`);
}

updateChangelog();


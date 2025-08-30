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
        const initial = `# Changelog\n\nAll notable changes to this project will be documented in this file.\n\nThe format is based on Keep a Changelog, and this project adheres to Semantic Versioning.\n\nSee: https://keepachangelog.com/en/1.1.0/\n\n## [Unreleased]\n\n### Added\n### Fixed\n### Changed\n### Deprecated\n### Removed\n### Security\n`;
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

	// Pre-clean: remove any existing sections for the current version to avoid duplicates on re-runs
	function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
	const currentVersionSectionRegexGlobal = new RegExp(
		`(^## \\[${escapeRegExp(currentVersion)}\\]\\s*)([\\s\\S]*?)(?=^##\\s\\[|^##\\s[^\\[]|\\\Z)`,
		"gm"
	);
	changelog = changelog.replace(currentVersionSectionRegexGlobal, "");

	// Find and combine all Unreleased sections, collapsing duplicates
	// Treat the link references block (lines starting with "[") as a boundary too
	const unreleasedSectionRegexGlobal = /(^## \[Unreleased\]\s*)([\s\S]*?)(?=^##\s\[|^##\s[^\[]|^\[|\Z)/gm;
	let match;
	const segments = [];
	while ((match = unreleasedSectionRegexGlobal.exec(changelog)) !== null) {
		segments.push({ index: match.index, full: match[0], content: match[2] });
	}

	if (segments.length === 0) {
		// Append a fresh Unreleased section if missing entirely
		changelog = changelog.trimEnd() + "\n\n## [Unreleased]\n\n";
		// Re-run to pick up the freshly added section
		while ((match = unreleasedSectionRegexGlobal.exec(changelog)) !== null) {
			segments.push({ index: match.index, full: match[0], content: match[2] });
		}
	}

	// Aggregate content from all Unreleased sections
	const aggregatedContent = segments.map((s) => s.content).join("\n");

	// Filter out empty category headings (e.g., "### Added") that have no content beneath
	function filterEmptyHeadings(content) {
		const lines = content.split(/\r?\n/);
		const out = [];
		let i = 0;
		while (i < lines.length) {
			const line = lines[i];
			const isHeading = /^###\s+/.test(line);
			if (!isHeading) {
				// Non-heading line: keep as-is
				out.push(line);
				i++;
				continue;
			}

			// Collect block under this heading until next heading or end
			const headingLine = line;
			i++;
			const block = [];
			while (i < lines.length && !/^###\s+/.test(lines[i])) {
				block.push(lines[i]);
				i++;
			}

			// Determine if block has meaningful content (ignore blank lines)
			const hasContent = block.some((l) => l.trim().length > 0);
			if (hasContent) {
				out.push(headingLine, ...block);
			}
			// If no content, drop heading and its blank block entirely
		}
		// Trim trailing blank lines for cleanliness but preserve internal formatting
		return out.join("\n").replace(/\s+$/s, "");
	}

	const filteredAggregated = filterEmptyHeadings(aggregatedContent);

	// Determine if there's meaningful content after filtering (ignore blanks and category headings)
	const unreleasedLines = filteredAggregated.split(/\r?\n/);
	const hasMeaningful = unreleasedLines.some((line) => {
		const t = line.trim();
		if (!t) return false;
		if (t.startsWith("### ")) return false;
		return true;
	});

	let unreleasedContent = filteredAggregated.trim();
	if (!hasMeaningful) {
		unreleasedContent = "- No notable changes.";
		logWarn("No content found under Unreleased. Using placeholder.");
	}

	// Build new version section
	const newVersionSection = `## [${currentVersion}] - ${today}\n${unreleasedContent}\n\n`;

	// Replace ALL Unreleased sections with a single empty template and insert new version below first occurrence
	const firstIndex = segments[0].index;
	const last = segments[segments.length - 1];
	const afterLastIndex = last.index + last.full.length;
	const prefix = changelog.slice(0, firstIndex);
	let suffix = changelog.slice(afterLastIndex);
    const UNRELEASED_TEMPLATE = [
        "### Added",
        "### Fixed",
        "### Changed",
        "### Deprecated",
        "### Removed",
        "### Security",
        ""
    ].join("\n");

    const newUnreleasedSection = "## [Unreleased]\n\n" + UNRELEASED_TEMPLATE + "\n";
	changelog = prefix + newUnreleasedSection + newVersionSection + suffix;

	// Helper: remove duplicate Unreleased heading lines, keep the first
	function dedupeUnreleasedHeadings(str) {
		const lines2 = str.split(/\r?\n/);
		let seenUnreleased = false;
		const out = [];
		for (const ln of lines2) {
			if (/^## \[Unreleased\]\s*$/.test(ln)) {
				if (seenUnreleased) continue;
				seenUnreleased = true;
			}
			out.push(ln);
		}
		return out.join("\n");
	}

	// Apply heading dedupe early so both branches (with/without repo URL) get it
	changelog = dedupeUnreleasedHeadings(changelog);

	// Safety: ensure exactly one Unreleased section remains
	let first = true;
	const unreleasedSectionRegexGlobalOnce = new RegExp(unreleasedSectionRegexGlobal.source, "gm");
	changelog = changelog.replace(unreleasedSectionRegexGlobalOnce, (full) => {
		if (first) { first = false; return full; }
		return "";
	});

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

	// Final cleanup: guarantee exactly one Unreleased heading line
	updated = dedupeUnreleasedHeadings(updated);

	writeFileSync(changelogPath, updated);
	logSuccess(`Updated CHANGELOG.md for ${currentVersion}`);
}

updateChangelog();

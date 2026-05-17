#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";

const EXACT_SEMVER = /^\d+\.\d+\.\d+$/;

function fail(message) {
	process.stderr.write(`${message}\n`);
	process.exit(1);
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const tag = process.argv[2] || process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME;
const outputPath = process.argv[3] || "dist/release/release-notes.md";

if (!tag) {
	fail("Release tag is required. Pass an exact semver tag or set RELEASE_TAG/GITHUB_REF_NAME.");
}

if (!EXACT_SEMVER.test(tag)) {
	fail(`Invalid release tag "${tag}". Expected exact semver like 1.9.10.`);
}

const changelog = readFileSync("CHANGELOG.md", "utf8");
const headingPattern = new RegExp(
	`^## \\[${escapeRegExp(tag)}\\](?:\\s+-\\s+[^\\n]+)?\\s*$`,
	"m"
);
const headingMatch = changelog.match(headingPattern);

if (!headingMatch || headingMatch.index === undefined) {
	fail(`Could not find CHANGELOG.md release notes for ${tag}.`);
}

const sectionStart = headingMatch.index + headingMatch[0].length;
const rest = changelog.slice(sectionStart);
const nextHeadingMatch = rest.match(/^## \[/m);
const section = (nextHeadingMatch ? rest.slice(0, nextHeadingMatch.index) : rest).trim();

if (!section) {
	fail(`CHANGELOG.md release notes for ${tag} are empty.`);
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${section}\n`);
process.stdout.write(`Wrote release notes for ${tag} to ${outputPath}\n`);

#!/usr/bin/env node
import { execFileSync } from "child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const EXACT_SEMVER = /^\d+\.\d+\.\d+$/;

function fail(message) {
	process.stderr.write(`${message}\n`);
	process.exit(1);
}

const tag = process.argv[2] || process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME;

if (!tag) {
	fail("Release tag is required. Pass an exact semver tag or set RELEASE_TAG/GITHUB_REF_NAME.");
}

if (!EXACT_SEMVER.test(tag)) {
	fail(`Invalid release tag "${tag}". Expected exact semver like 1.9.10.`);
}

execFileSync("npm", ["run", "build"], { stdio: "inherit" });

const releaseDir = join("dist", "release");
mkdirSync(releaseDir, { recursive: true });

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
manifest.version = tag;

writeFileSync(join(releaseDir, "manifest.json"), `${JSON.stringify(manifest, null, "\t")}\n`);
copyFileSync("main.js", join(releaseDir, "main.js"));
copyFileSync("styles.css", join(releaseDir, "styles.css"));

process.stdout.write(`Prepared release assets for ${tag} in ${releaseDir}\n`);

#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { createInterface } from "readline";

// ANSI color codes for beautiful console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m'
};

// Console logging helpers
const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  step: (msg) => console.log(`${colors.cyan}▶${colors.reset} ${msg}`),
  title: (msg) => console.log(`\n${colors.bright}${colors.bgBlue} ${msg} ${colors.reset}\n`),
  subtitle: (msg) => console.log(`${colors.bright}${colors.blue}${msg}${colors.reset}`)
};

function validateChangelogFormat() {
  log.step("Validating CHANGELOG.md format...");
  
  if (!existsSync("CHANGELOG.md")) {
    log.error("CHANGELOG.md not found!");
    process.exit(1);
  }

  const changelog = readFileSync("CHANGELOG.md", "utf8");
  
  // Check for unreleased section with content
  if (!changelog.includes("## [Unreleased]")) {
    log.error("CHANGELOG.md must have an [Unreleased] section!");
    process.exit(1);
  }

  // Check if unreleased section has actual changes
  const unreleasedSection = changelog.split("## [Unreleased]")[1]?.split("## [")[0] || "";
  const hasChanges = /### (Added|Changed|Deprecated|Removed|Fixed|Security)\s*\n(?!\s*###|\s*##)/.test(unreleasedSection);
  
  if (!hasChanges) {
    log.error("No changes found in [Unreleased] section! Please add your changes before releasing.");
    log.info("Add changes under the appropriate sections: Added, Changed, Deprecated, Removed, Fixed, Security");
    process.exit(1);
  }

  log.success("CHANGELOG.md format is valid");
}

function runTests() {
  log.step("Running tests...");
  try {
    execSync("npm test", { stdio: "inherit" });
    log.success("All tests passed");
  } catch (error) {
    log.error("Tests failed!");
    process.exit(1);
  }
}

function runBuild() {
  log.step("Running production build...");
  try {
    execSync("npm run build", { stdio: "inherit" });
    log.success("Build completed successfully");
  } catch (error) {
    log.error("Build failed!");
    process.exit(1);
  }
}

function validateGitStatus() {
  log.step("Checking git status...");
  
  try {
    const status = execSync("git status --porcelain", { encoding: "utf8" });
    if (status.trim()) {
      log.error("Working directory is not clean! Please commit or stash your changes.");
      console.log(status);
      process.exit(1);
    }
    log.success("Working directory is clean");
  } catch (error) {
    log.error("Failed to check git status");
    process.exit(1);
  }
}

function getCurrentVersion() {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  return packageJson.version;
}

function bumpVersion(currentVersion, releaseType) {
  const parts = currentVersion.split(".").map(Number);
  
  switch (releaseType) {
    case "major":
      return `${parts[0] + 1}.0.0`;
    case "minor":
      return `${parts[0]}.${parts[1] + 1}.0`;
    case "patch":
      return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
    default:
      throw new Error(`Invalid release type: ${releaseType}`);
  }
}

function updateVersionFiles(newVersion) {
  log.step(`Updating version files to ${newVersion}...`);

  // Update package.json
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  packageJson.version = newVersion;
  writeFileSync("package.json", JSON.stringify(packageJson, null, "\t"));
  log.success("Updated package.json");

  // Update manifest.json
  const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
  const { minAppVersion } = manifest;
  manifest.version = newVersion;
  writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));
  log.success("Updated manifest.json");

  // Update versions.json
  const versions = JSON.parse(readFileSync("versions.json", "utf8"));
  versions[newVersion] = minAppVersion;
  writeFileSync("versions.json", JSON.stringify(versions, null, "\t"));
  log.success("Updated versions.json");
}

function updateChangelog(newVersion) {
  log.step(`Updating CHANGELOG.md for version ${newVersion}...`);
  
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  const today = new Date().toISOString().split('T')[0];
  
  // Replace [Unreleased] with the new version
  const updatedChangelog = changelog.replace(
    /## \[Unreleased\]/,
    `## [Unreleased]

### Added
### Changed
### Deprecated
### Removed
### Fixed
### Security

## [${newVersion}] - ${today}`
  );

  // Update the links at the bottom
  const lines = updatedChangelog.split('\n');
  const linkSectionStart = lines.findIndex(line => line.startsWith('[Unreleased]:'));
  
  if (linkSectionStart !== -1) {
    // Update unreleased link to compare from new version
    lines[linkSectionStart] = `[Unreleased]: https://github.com/gtg922r/obsidian-entities/compare/v${newVersion}...HEAD`;
    
    // Add new version link
    const currentVersion = getCurrentVersion();
    const newVersionLink = `[${newVersion}]: https://github.com/gtg922r/obsidian-entities/compare/v${currentVersion}...v${newVersion}`;
    lines.splice(linkSectionStart + 1, 0, newVersionLink);
  }

  writeFileSync("CHANGELOG.md", lines.join('\n'));
  log.success("Updated CHANGELOG.md");
}

function commitAndTag(newVersion) {
  log.step("Committing changes and creating tag...");
  
  try {
    execSync(`git add package.json manifest.json versions.json CHANGELOG.md`, { stdio: "inherit" });
    execSync(`git commit -m "chore: release v${newVersion}"`, { stdio: "inherit" });
    execSync(`git tag -a v${newVersion} -m "Release v${newVersion}"`, { stdio: "inherit" });
    log.success(`Created commit and tag v${newVersion}`);
  } catch (error) {
    log.error("Failed to commit and tag");
    process.exit(1);
  }
}

function pushChanges() {
  log.step("Pushing changes and tags to remote...");
  
  try {
    execSync("git push", { stdio: "inherit" });
    execSync("git push --tags", { stdio: "inherit" });
    log.success("Pushed changes and tags to remote");
  } catch (error) {
    log.error("Failed to push changes");
    process.exit(1);
  }
}

async function confirmRelease(currentVersion, newVersion, releaseType) {
  log.subtitle(`Release Summary:`);
  console.log(`  Current version: ${colors.cyan}${currentVersion}${colors.reset}`);
  console.log(`  New version:     ${colors.green}${newVersion}${colors.reset}`);
  console.log(`  Release type:    ${colors.yellow}${releaseType}${colors.reset}`);
  
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`\n${colors.yellow}⚠${colors.reset} Proceed with release? (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function main() {
  const releaseType = process.argv[2];
  
  if (!releaseType || !["major", "minor", "patch"].includes(releaseType)) {
    log.error("Usage: node scripts/release.mjs <major|minor|patch>");
    process.exit(1);
  }

  log.title(`🚀 OBSIDIAN ENTITIES RELEASE - ${releaseType.toUpperCase()}`);

  const currentVersion = getCurrentVersion();
  const newVersion = bumpVersion(currentVersion, releaseType);

  // Pre-release validation
  log.subtitle("🔍 Pre-release Validation");
  validateGitStatus();
  validateChangelogFormat();
  runTests();
  runBuild();

  // Confirm release
  const shouldProceed = await confirmRelease(currentVersion, newVersion, releaseType);
  if (!shouldProceed) {
    log.warning("Release cancelled by user");
    process.exit(0);
  }

  // Execute release
  log.subtitle("📦 Executing Release");
  updateVersionFiles(newVersion);
  updateChangelog(newVersion);
  commitAndTag(newVersion);
  pushChanges();

  log.title(`🎉 RELEASE COMPLETE`);
  log.success(`Version ${newVersion} has been released!`);
  log.info("GitHub Actions will now build and publish the release automatically.");
  log.info(`Check the release at: https://github.com/gtg922r/obsidian-entities/releases/tag/v${newVersion}`);
}

main().catch((error) => {
  log.error(`Release failed: ${error.message}`);
  process.exit(1);
});
#!/usr/bin/env node

import { readFileSync } from "fs";

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

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  step: (msg) => console.log(`${colors.cyan}▶${colors.reset} ${msg}`),
  title: (msg) => console.log(`\n${colors.bright}${colors.bgBlue} ${msg} ${colors.reset}\n`),
  subtitle: (msg) => console.log(`${colors.bright}${colors.blue}${msg}${colors.reset}`)
};

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

function main() {
  const releaseType = process.argv[2];
  
  if (!releaseType || !["major", "minor", "patch"].includes(releaseType)) {
    log.error("Usage: node scripts/demo-release.mjs <major|minor|patch>");
    process.exit(1);
  }

  log.title(`🚀 OBSIDIAN ENTITIES RELEASE DEMO - ${releaseType.toUpperCase()}`);

  const currentVersion = getCurrentVersion();
  const newVersion = bumpVersion(currentVersion, releaseType);

  log.subtitle("📋 Release Summary");
  console.log(`  Current version: ${colors.cyan}${currentVersion}${colors.reset}`);
  console.log(`  New version:     ${colors.green}${newVersion}${colors.reset}`);
  console.log(`  Release type:    ${colors.yellow}${releaseType}${colors.reset}`);

  log.subtitle("🔍 What would happen during release:");
  log.step("✅ Validate git working directory is clean");
  log.step("✅ Validate CHANGELOG.md format and unreleased content");
  log.step("✅ Run all tests to ensure they pass");
  log.step("✅ Run production build to verify compilation");
  log.step("📝 Update package.json, manifest.json, and versions.json");
  log.step("📋 Move [Unreleased] changes to new version in CHANGELOG.md");
  log.step("💾 Commit changes with message: 'chore: release v" + newVersion + "'");
  log.step("🏷️ Create annotated git tag: 'v" + newVersion + "'");
  log.step("⬆️ Push commit and tags to GitHub");
  log.step("🤖 GitHub Actions builds and creates release automatically");

  log.title("🎯 To run actual release:");
  console.log(`${colors.green}npm run release:${releaseType}${colors.reset}`);
  
  log.info("This was just a demo - no changes were made to your repository.");
}

main();
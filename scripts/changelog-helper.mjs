#!/usr/bin/env node

import { readFileSync, writeFileSync } from "fs";

// ANSI color codes for beautiful console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  step: (msg) => console.log(`${colors.cyan}▶${colors.reset} ${msg}`)
};

/**
 * Extract changelog content for a specific version
 */
export function getChangelogForVersion(version) {
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  
  // Find the section for this version
  const versionRegex = new RegExp(`## \\[${version}\\].*?(?=## \\[|$)`, 's');
  const match = changelog.match(versionRegex);
  
  if (!match) {
    return `Release ${version}`;
  }

  // Clean up the content
  let content = match[0]
    .replace(/## \[.*?\] - .*?\n/, '') // Remove version header
    .replace(/\[.*?\]: https:\/\/.*?\n/g, '') // Remove links
    .trim();

  // If content is empty or just section headers, provide default
  if (!content || content.match(/^(### (Added|Changed|Deprecated|Removed|Fixed|Security)\s*)+$/)) {
    return `Release ${version}`;
  }

  return content;
}

/**
 * Validate that unreleased section has content
 */
export function validateUnreleasedSection() {
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  const unreleasedSection = changelog.split("## [Unreleased]")[1]?.split("## [")[0] || "";
  
  // Check if there's actual content under any section
  const hasChanges = /### (Added|Changed|Deprecated|Removed|Fixed|Security)\s*\n\s*-/.test(unreleasedSection);
  
  return hasChanges;
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  const version = process.argv[3];

  switch (command) {
    case "extract":
      if (!version) {
        log.error("Usage: node changelog-helper.mjs extract <version>");
        process.exit(1);
      }
      console.log(getChangelogForVersion(version));
      break;
    
    case "validate":
      if (validateUnreleasedSection()) {
        log.success("Unreleased section has content");
        process.exit(0);
      } else {
        log.error("Unreleased section is empty");
        process.exit(1);
      }
      break;
    
    default:
      log.error("Usage: node changelog-helper.mjs <extract|validate> [version]");
      process.exit(1);
  }
}
#!/usr/bin/env node

import { execSync } from "child_process";
import { existsSync } from "fs";

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  step: (msg) => console.log(`${colors.cyan}▶${colors.reset} ${msg}`)
};

function runLinting() {
  log.step("Running ESLint...");
  try {
    execSync("npx eslint src/ --ext .ts,.js", { stdio: "inherit" });
    log.success("Linting passed");
  } catch (error) {
    log.warning("Linting issues found - please fix before committing");
    return false;
  }
  return true;
}

function runTests() {
  log.step("Running tests...");
  try {
    execSync("npm test", { stdio: "inherit" });
    log.success("All tests passed");
  } catch (error) {
    log.error("Tests failed");
    return false;
  }
  return true;
}

function checkBuild() {
  log.step("Checking TypeScript compilation...");
  try {
    execSync("tsc -noEmit -skipLibCheck", { stdio: "inherit" });
    log.success("TypeScript compilation successful");
  } catch (error) {
    log.error("TypeScript compilation failed");
    return false;
  }
  return true;
}

function main() {
  console.log(`${colors.cyan}🔍 Pre-commit validation${colors.reset}\n`);
  
  let allPassed = true;
  
  allPassed &= checkBuild();
  allPassed &= runLinting();
  allPassed &= runTests();
  
  if (allPassed) {
    log.success("All pre-commit checks passed! ✨");
    process.exit(0);
  } else {
    log.error("Some checks failed. Please fix the issues before committing.");
    process.exit(1);
  }
}

main();
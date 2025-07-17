import { readFileSync, writeFileSync, existsSync } from "fs";
import { execSync } from "child_process";

// Check for help flag
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage: npm run release:beta [type[.number]]

Examples:
  npm run release:beta              # Creates 0.3.7-preview.1
  npm run release:beta preview.2    # Creates 0.3.7-preview.2
  npm run release:beta beta.1       # Creates 0.3.7-beta.1
  npm run release:beta alpha        # Creates 0.3.7-alpha.1

This script creates a beta release tag for testing with Obsidian BRAT.
`);
  process.exit(0);
}

// Get current version from package.json
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const currentVersion = packageJson.version;

// Parse version components
const [major, minor, patch] = currentVersion.split('.').map(Number);

// Parse arguments - handle format like "preview.1" or separate args
let betaType = 'preview';
let betaNumber = '1';

if (process.argv[2]) {
  if (process.argv[2].includes('.')) {
    // Format like "preview.1"
    [betaType, betaNumber] = process.argv[2].split('.');
  } else {
    // Separate arguments
    betaType = process.argv[2];
    betaNumber = process.argv[3] || '1';
  }
}

// Create beta version
const betaVersion = `${major}.${minor}.${patch}-${betaType}.${betaNumber}`;

console.log(`Creating beta release: ${betaVersion}`);

// Update manifest.json for beta
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
manifest.version = betaVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));

// Build the plugin
console.log("Building plugin...");
try {
  execSync("npm run build", { stdio: "inherit" });
} catch (error) {
  console.error("Build failed:", error.message);
  process.exit(1);
}

// Create git tag
console.log(`Creating git tag: ${betaVersion}`);
try {
  execSync(`git add manifest.json`);
  execSync(`git commit -m "chore: prepare beta release ${betaVersion}"`);
  execSync(`git tag -a ${betaVersion} -m "Beta release ${betaVersion}"`);
  console.log(`Tag created: ${betaVersion}`);
  console.log("Push the tag with: git push origin --tags");
} catch (error) {
  console.error("Failed to create tag:", error.message);
  console.log("You may need to manually create the tag and push it.");
}

console.log(`
Beta release ${betaVersion} prepared!

Next steps:
1. Push the tag: git push origin --tags
2. Create a GitHub release from the tag
3. Mark it as "pre-release"
4. Upload the built files: main.js, manifest.json, styles.css
5. Share the repository URL with beta testers for BRAT installation

Note: Remember to revert manifest.json changes before making production releases!
`);

// Revert manifest.json to original version
console.log("Reverting manifest.json to production version...");
manifest.version = currentVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));
console.log("manifest.json reverted to production version.");
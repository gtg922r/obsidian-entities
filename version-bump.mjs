import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.env.npm_package_version;

console.log(`🔄 Updating version files to ${targetVersion}...`);

// read minAppVersion from manifest.json and bump version to target version
let manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));
console.log("✓ Updated manifest.json");

// update versions.json with target version and minAppVersion from manifest.json
let versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t"));
console.log("✓ Updated versions.json");

console.log("✅ Version bump completed successfully!");

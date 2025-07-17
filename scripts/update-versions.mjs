import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.argv[2] || process.env.npm_package_version;

if (!targetVersion) {
  console.error("No target version provided");
  process.exit(1);
}

console.log(`Updating files to version: ${targetVersion}`);

// Update manifest.json
let manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));
console.log("Updated manifest.json");

// Update versions.json
let versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;

// Sort versions to maintain order
const sortedVersions = {};
Object.keys(versions)
  .sort((a, b) => {
    // Simple version comparison (works for our versioning scheme)
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);
    
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || 0;
      const bPart = bParts[i] || 0;
      
      if (aPart !== bPart) {
        return aPart - bPart;
      }
    }
    return 0;
  })
  .forEach(version => {
    sortedVersions[version] = versions[version];
  });

writeFileSync("versions.json", JSON.stringify(sortedVersions, null, "\t"));
console.log("Updated versions.json");

console.log(`Successfully updated to version ${targetVersion}`);
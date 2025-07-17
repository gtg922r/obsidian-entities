import { readFileSync, writeFileSync } from "fs";

// Determine target version from npm environment variable or fallback to package.json
let targetVersion = process.env.npm_package_version;
if (!targetVersion) {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  targetVersion = pkg.version;
}

// read minAppVersion from manifest.json and bump version to target version
let manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));

// update versions.json with target version and minAppVersion from manifest.json
let versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t"));

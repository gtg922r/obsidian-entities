import { cli, json, metadata, planChangelog, readBytes, validateManifest, validateToolchain, version, writeAtomic } from "./scripts/release-utils.mjs";

cli(() => {
	// npm 11 exports an explicitly disabled boolean as an empty string.
	if (!["", "false"].includes(process.env.npm_config_git_tag_version)) throw new Error("Use npm version <version> --no-git-tag-version; implicit release commits/tags are disabled.");
	validateToolchain();
	const pkg = json(readBytes("package.json"));
	const manifest = json(readBytes("manifest.json"));
	validateManifest(manifest);
	if (process.argv[2] === "--preflight") {
		metadata(pkg.version);
		planChangelog(readBytes("CHANGELOG.md").toString(), version(process.env.npm_new_version));
		return;
	}
	if (process.argv.length > 2) throw new Error("Unexpected version-bump argument.");
	const target = version(process.env.npm_package_version);
	const lock = json(readBytes("package-lock.json"));
	const versions = json(readBytes("versions.json"));
	if ([pkg.version, lock.version, lock.packages?.[""]?.version].some((v) => v !== target)) throw new Error("npm lifecycle package/lock versions disagree; inspect and repair metadata before retrying.");
	version(manifest.version);
	version(manifest.minAppVersion);
	if (versions[manifest.version] !== manifest.minAppVersion || (Object.hasOwn(versions, target) && versions[target] !== manifest.minAppVersion)) throw new Error("Existing minimum version mapping disagrees; refusing to repair it implicitly.");
	const changelog = planChangelog(readBytes("CHANGELOG.md").toString(), target);
	manifest.version = target;
	versions[target] = manifest.minAppVersion;
	try {
		writeAtomic("manifest.json", `${JSON.stringify(manifest, null, "\t")}\n`);
		writeAtomic("versions.json", `${JSON.stringify(versions, null, "\t")}\n`);
		writeAtomic("CHANGELOG.md", changelog);
		metadata(target);
	} catch (error) {
		throw new Error(`Version lifecycle failed; inspect and repair all five release metadata files. Partial writes are retained for recovery; nothing was staged or rolled back.\n${error.message}`);
	}
});

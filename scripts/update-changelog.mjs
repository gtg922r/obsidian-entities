import { cli, json, planChangelog, readBytes, writeAtomic } from "./release-utils.mjs";

cli(() => {
	if (process.argv.length > 2) throw new Error("Usage: node scripts/update-changelog.mjs");
	const before = readBytes("CHANGELOG.md").toString();
	const after = planChangelog(before, json(readBytes("package.json")).version);
	if (before !== after) writeAtomic("CHANGELOG.md", after);
	process.stdout.write(before === after ? "Changelog already prepared; unchanged.\n" : "Changelog prepared; historic sections and links preserved.\n");
});

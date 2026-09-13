#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { cli, readBytes, releaseNotes, writeAtomic } from "./release-utils.mjs";

cli(() => {
	const [tag, outputPath] = process.argv.slice(2);
	if (!tag || !outputPath || process.argv.length !== 4) throw new Error("Usage: extract-release-notes.mjs <version> <output-path>");
	const notes = releaseNotes(readBytes("CHANGELOG.md").toString(), tag);
	mkdirSync(dirname(outputPath), { recursive: true });
	writeAtomic(outputPath, notes);
	process.stdout.write(`Wrote notes for ${tag} to ${outputPath}\n`);
});

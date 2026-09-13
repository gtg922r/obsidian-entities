#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
	closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync,
	openSync, readFileSync, readdirSync, writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const fixtureRoot = fileURLToPath(new URL("../tests/fixtures/recovery-vault/", import.meta.url));
const artifactNames = ["main.js", "manifest.json", "styles.css"];
const usage = "Usage: node scripts/create-recovery-vault.mjs --destination /absolute/NEW-vault --artifact /absolute/artifacts";

/** Reject ambiguous paths before normalization can hide traversal or symlinks. */
function explicitPath(value) {
	if (!value || !isAbsolute(value) || value.includes("\0") ||
		value.split(/[\\/]/).some((part) => part === "." || part === "..")) {
		throw new Error("Supply absolute paths without '.' or '..' components.");
	}
	return resolve(value);
}

/** Check every existing directory component, including ancestors of inputs. */
function checkedDirectory(path) {
	let current = parse(path).root;
	for (const part of relative(current, path).split(sep).filter(Boolean)) {
		current = join(current, part);
		const info = lstatSync(current);
		if (info.isSymbolicLink() || !info.isDirectory()) {
			throw new Error(`Expected a directory without symlinks: ${current}`);
		}
	}
}

/** Open only regular files; never evaluate JS/templates or follow file symlinks. */
function readRegular(path) {
	checkedDirectory(dirname(path));
	if (!lstatSync(path).isFile()) throw new Error(`Expected a regular file: ${path}`);
	const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
	try {
		if (!fstatSync(fd).isFile()) throw new Error(`Expected a regular file: ${path}`);
		return readFileSync(fd);
	} finally {
		closeSync(fd);
	}
}

function fingerprint(bytes) {
	return { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

/** Read the hand-authored note tree, rejecting unexpected assets and symlinks. */
function readNotes(directory, prefix = "") {
	checkedDirectory(directory);
	return readdirSync(directory).sort().flatMap((name) => {
		if (name.includes("\\") || name === ".obsidian") throw new Error(`Invalid fixture name: ${name}`);
		const path = join(directory, name);
		const target = prefix ? `${prefix}/${name}` : name;
		const info = lstatSync(path);
		if (info.isDirectory()) return readNotes(path, target);
		if (!info.isFile() || !name.endsWith(".md")) throw new Error(`Expected a fixture note: ${path}`);
		return [{ path: target, bytes: readRegular(path) }];
	});
}

function run(args) {
	if (args.length === 1 && args[0] === "--help") {
		process.stdout.write(`${usage}\nNo plugins are downloaded, enabled, or opened.\n`);
		return;
	}
	const options = new Map();
	for (let index = 0; index < args.length; index += 2) {
		const key = args[index];
		if (!["--destination", "--artifact"].includes(key) || options.has(key) || !args[index + 1]) {
			throw new Error(usage);
		}
		options.set(key, args[index + 1]);
	}
	if (options.size !== 2) throw new Error(usage);
	const destination = explicitPath(options.get("--destination"));
	const artifact = explicitPath(options.get("--artifact"));
	checkedDirectory(dirname(destination));
	checkedDirectory(artifact);
	// lstat also detects broken destination symlinks, which existsSync would miss.
	try {
		lstatSync(destination);
		throw new Error("Destination already exists; choose a NEW destination.");
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	for (let parent = dirname(destination);; parent = dirname(parent)) {
		if (existsSync(join(parent, ".obsidian"))) throw new Error("Destination must be outside an existing Obsidian vault.");
		if (parent === dirname(parent)) break;
	}

	// Validate and snapshot all inputs before the first destination write.
	const artifacts = artifactNames.flatMap((name) => {
		let bytes;
		try {
			bytes = readRegular(join(artifact, name));
		} catch (error) {
			if (name === "styles.css" && error.code === "ENOENT") return [];
			throw error;
		}
		if (name !== "styles.css" && !bytes.length) throw new Error(`Empty required artifact: ${name}`);
		return [{ path: name, bytes }];
	});
	const manifest = JSON.parse(artifacts.find((file) => file.path === "manifest.json").bytes.toString("utf8"));
	if (!manifest || manifest.id !== "entities" ||
		typeof manifest.version !== "string" || !/^\d+\.\d+\.\d+$/.test(manifest.version) ||
		typeof manifest.minAppVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(manifest.minAppVersion) ||
		typeof manifest.name !== "string" || !manifest.name.trim() || typeof manifest.isDesktopOnly !== "boolean") {
		throw new Error("Artifact manifest must identify entities with a name, exact numeric version/minAppVersion, and isDesktopOnly.");
	}
	const settings = readRegular(join(fixtureRoot, "legacy-data.json"));
	if (!Array.isArray(JSON.parse(settings.toString("utf8")).providerSettings)) {
		throw new Error("Invalid legacy fixture settings.");
	}
	const fixtureFiles = [
		...readNotes(join(fixtureRoot, "notes")),
		{ path: ".obsidian/plugins/entities/data.json", bytes: settings },
		{ path: ".obsidian/community-plugins.json", bytes: Buffer.from("[]\n") },
	];
	const receipt = {
		kitVersion: 1,
		fixtureSettingsSource: "tests/fixtures/recovery-vault/legacy-data.json",
		artifact: {
			id: manifest.id, version: manifest.version,
			minAppVersion: manifest.minAppVersion, isDesktopOnly: manifest.isDesktopOnly,
			files: Object.fromEntries(artifacts.map((file) => [file.path, fingerprint(file.bytes)])),
		},
		fixtureFiles: Object.fromEntries(fixtureFiles.map((file) => [file.path, fingerprint(file.bytes)])),
		runtimeAcceptance: "NOT RUN",
	};
	const files = [
		...fixtureFiles,
		...artifacts.map((file) => ({ ...file, path: `.obsidian/plugins/entities/${file.path}` })),
		{ path: "RECOVERY-FIXTURE.json", bytes: Buffer.from(`${JSON.stringify(receipt, null, "\t")}\n`) },
	];
	// Exclusive root creation is the overwrite guard. Do not recursively delete on failure.
	mkdirSync(destination, { mode: 0o700 });
	try {
		for (const file of files) {
			let parent = destination;
			for (const part of file.path.split("/").slice(0, -1)) {
				checkedDirectory(parent);
				parent = join(parent, part);
				try { mkdirSync(parent, { mode: 0o700 }); } catch (error) {
					if (error.code !== "EEXIST") throw error;
				}
			}
			checkedDirectory(parent);
			writeFileSync(join(destination, file.path), file.bytes, { flag: "wx", mode: 0o600 });
		}
	} catch (error) {
		throw new Error(`Incomplete fixture at ${destination}; inspect it and choose a new destination. ${error.message}`);
	}
	process.stdout.write(`Created disposable fixture: ${destination}\nEntities ${manifest.version}; identity in RECOVERY-FIXTURE.json. Runtime acceptance: NOT RUN.\n`);
}

try {
	run(process.argv.slice(2));
} catch (error) {
	process.stderr.write(`Recovery fixture: ${error.message}\n`);
	process.exitCode = 1;
}

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
const releaseScripts = ["release-utils.mjs", "release.mjs", "prepare-release-assets.mjs", "publish-release.mjs", "update-changelog.mjs", "extract-release-notes.mjs"];
const historical = "## [0.4.3] - 2024-01-01\n\nHistoric prose with a literal Z.\n\n[history]: https://example.com/preserved\n";
const initialNotes = `# Changelog\n\n## [Unreleased]\n\n### Fixed\n- Candidate changes.\n\n${historical}`;
const releasedNotes = `# Changelog\n\n## [Unreleased]\n\n## [0.4.4] - 2026-09-13\n\n### Fixed\n- Tested release changes.\n\n${historical}`;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const parse = (file) => JSON.parse(readFileSync(file, "utf8"));
const writeJSON = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, "\t")}\n`);

// All mutating release commands are fake executables, including npm version and every tag/remote action.
const fakeExecutable = `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const command = path.basename(process.argv[1]);
const args = process.argv.slice(2);
fs.appendFileSync(process.env.LEDGER, JSON.stringify({ command, args, cwd: process.cwd() }) + '\\n');
const key = command + ' ' + args.join(' ');
if (process.env.FAIL_COMMAND && key.startsWith(process.env.FAIL_COMMAND)) { console.error('Injected failure: ' + key); process.exit(17); }
function output(value) { process.stdout.write(value + '\\n'); process.exit(0); }
if (command === 'git') {
 if (args[0] === 'fetch') process.exit(0);
 if (args[0] === 'tag' && args[1] === '--list') output(process.env.FAKE_TAG || '');
 if (args[0] === 'ls-remote') output(process.env.REMOTE_SHA ? (process.env.ANNOTATED ? 'c'.repeat(40) + '\\trefs/tags/0.4.4\\n' : '') + process.env.REMOTE_SHA + '\\trefs/tags/0.4.4' + (process.env.ANNOTATED ? '^{}' : '') : '');
 if (args[0] === 'rev-parse' && args.some(a => a.startsWith('refs/tags/'))) output(process.env.TAG_SHA || '');
 if (['tag','push','pull'].includes(args[0])) throw Error('Forbidden real git mutation');
 const result = cp.spawnSync(process.env.REAL_GIT, args, { stdio:'inherit', env: process.env }); process.exit(result.status ?? 1);
}
if (command === 'npm') {
 if (args[0] === '--version') output(process.env.NPM_VERSION || '11.19.0');
 if (args[0] === 'ci') { if (process.env.INSTALL_MAIN) fs.writeFileSync('main.js','install stale output'); process.exit(0); }
 if (args[0] === 'run' && ['check','release:check'].includes(args[1])) {
  const mode = process.env.BUILD_MODE;
  if (mode !== 'missing') fs.writeFileSync('main.js',mode === 'map' ? '//# sourceMappingURL=data:base64,test' : 'fresh production bytes\\n');
  if (mode === 'mutate') fs.appendFileSync('manifest.json',' ');
  if (mode === 'symlink') { fs.unlinkSync('main.js'); fs.symlinkSync('manifest.json','main.js'); }
  if (mode === 'remove-styles') fs.unlinkSync('styles.css');
  process.exit(0);
 }
 if (args[0] === 'version') {
  if (args[2] !== '--no-git-tag-version') throw Error('Tagging version invocation forbidden');
  for (const file of ['package.json','package-lock.json']) {
   const value = JSON.parse(fs.readFileSync(file)); value.version = args[1];
   if (value.packages) value.packages[''].version = args[1];
   fs.writeFileSync(file, JSON.stringify(value));
  }
  if (process.env.VERSION_FAILURE) { console.error('Injected lifecycle failure after package update'); process.exit(19); }
  const result = cp.spawnSync(process.execPath,['version-bump.mjs'], { stdio:'inherit',env:{...process.env,npm_package_version:args[1],npm_config_git_tag_version:'false'}});
  process.exit(result.status ?? 1);
 }
 throw Error('Unexpected npm command: ' + key);
}
if (command === 'gh') {
 if (args[0] === 'api') {
  const endpoint = args.at(-1);
  if (endpoint.includes('?per_page') && !fs.existsSync(process.env.UPLOAD_CAPTURE)) output(process.env.EXISTING_RELEASE ? '[[{"tag_name":"0.4.4"}]]' : '[[]]');
  const uploaded = JSON.parse(fs.readFileSync(process.env.UPLOAD_CAPTURE));
  const names = Object.keys(uploaded).filter(n => n !== 'release-notes.md');
  const mode = process.env.REMOTE_MODE;
  if (endpoint.includes('/assets/')) {
   const name = names[Number(endpoint.split('/').at(-1)) - 100];
   process.stdout.write(mode === 'corrupt' ? 'corrupt bytes' : uploaded[name]); process.exit(0);
  }
  const assets = names.map((name,i) => ({name,id:100+i,state:mode === 'incomplete' ? 'new' : 'uploaded',size:Buffer.byteLength(uploaded[name])}));
  if (mode === 'extra') assets.push({name:'data.json',id:999,state:'uploaded',size:0});
  if (mode === 'missing') assets.pop();
  const release = {id:42,draft:true,prerelease:true,tag_name:'0.4.4',assets};
  output(JSON.stringify(endpoint.includes('?per_page') ? [[release]] : release));
 }
 if (args[0] === 'release' && args[1] === 'edit') output('Fake draft published');
 if (args[0] === 'release' && args[1] === 'create') {
  const files = args.filter(a => a.startsWith(process.env.TMP_PREFIX || '/'));
  fs.writeFileSync(process.env.UPLOAD_CAPTURE, JSON.stringify(Object.fromEntries(files.map(p => [path.basename(p),fs.readFileSync(p,'utf8')]))));
  output('Fake prerelease created');
 }
 throw Error('Unexpected gh command');
}
throw Error('Unexpected executable');
`;

function fixture(t, notes = releasedNotes) {
	const temp = mkdtempSync(join(tmpdir(), "entities-release-test-"));
	t.after(() => rmSync(temp, { recursive: true, force: true }));
	const repo = join(temp, "repo");
	const bin = join(temp, "bin");
	mkdirSync(join(repo, "scripts"), { recursive: true });
	mkdirSync(bin);
	for (const script of releaseScripts) copyFileSync(join(root, "scripts", script), join(repo, "scripts", script));
	copyFileSync(join(root, "version-bump.mjs"), join(repo, "version-bump.mjs"));
	for (const name of ["npm", "git", "gh"]) {
		writeFileSync(join(bin, name), fakeExecutable);
		chmodSync(join(bin, name), 0o755);
	}
	writeJSON(join(repo, "package.json"), { name: "release-fixture", version: "0.4.4", engines: { node: "24.21.0", npm: "11.19.0" } });
	writeJSON(join(repo, "package-lock.json"), { name: "release-fixture", version: "0.4.4", lockfileVersion: 3, packages: { "": { version: "0.4.4" } } });
	writeFileSync(join(repo, "manifest.json"), '{ "id": "entities", "version": "0.4.4", "minAppVersion": "1.7.2" }');
	writeJSON(join(repo, "versions.json"), { "0.4.3": "1.5.7", "0.4.4": "1.7.2" });
	writeFileSync(join(repo, "CHANGELOG.md"), notes);
	writeFileSync(join(repo, "styles.css"), "/* committed styles */\n");
	writeFileSync(join(repo, ".gitignore"), "main.js\ndist/\ndata.json\n*.map\n.env\n");
	const git = (...args) => execFileSync(realGit, args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
	git("init", "-b", "master");
	git("config", "user.email", "release-tests@example.invalid");
	git("config", "user.name", "Release Tests");
	git("config", "commit.gpgsign", "false");
	git("config", "core.hooksPath", join(temp, "empty-hooks"));
	git("remote", "add", "origin", "https://github.com/gtg922r/obsidian-entities.git");
	function commit() {
		git("add", "."); git("commit", "-m", "test: fixture");
		const sha = git("rev-parse", "HEAD");
		git("update-ref", "refs/remotes/origin/master", sha);
		return sha;
	}
	commit();
	git("config", "branch.master.remote", "origin");
	git("config", "branch.master.merge", "refs/heads/master");
	const ledger = join(temp, "commands.jsonl");
	writeFileSync(ledger, "");
	const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, LEDGER: ledger, REAL_GIT: realGit, UPLOAD_CAPTURE: join(temp, "upload.json") };
	// Ensure developer npm settings cannot silently affect the fixture lifecycle.
	delete env.npm_package_version;
	delete env.npm_config_git_tag_version;
	const run = (script, args = [], overrides = {}) => spawnSync(process.execPath, [join(repo, script), ...args], { cwd: repo, env: { ...env, ...overrides }, encoding: "utf8" });
	const commands = () => readFileSync(ledger, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
	const candidate = () => {
		const result = run("scripts/prepare-release-assets.mjs", ["0.4.4"]);
		assert.equal(result.status, 0, result.stderr);
		return join(repo, "dist", "release", "0.4.4");
	};
	return { temp, repo, env, run, commands, candidate, commit, git, ledger };
}

function snapshot(directory) {
	const result = {};
	function walk(path) {
		for (const name of readdirSync(path).sort()) {
			const file = join(path, name);
			if (lstatSync(file).isDirectory()) walk(file);
			else result[file.slice(directory.length)] = hash(readFileSync(file));
		}
	}
	walk(directory);
	return result;
}

function failed(result, pattern) {
	assert.notEqual(result.status, 0, result.stdout);
	assert.match(result.stderr, pattern);
}

function publicationEnv(f) {
	const sha = f.git("rev-parse", "HEAD");
	return { FAKE_TAG: "0.4.4", TAG_SHA: sha, REMOTE_SHA: sha };
}

test("preparation dry run is observational including files, index and refs", (t) => {
	const f = fixture(t, initialNotes);
	const before = snapshot(f.repo);
	const result = f.run("scripts/release.mjs", ["patch", "--dry-run"]);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /NOT validated/);
	assert.deepEqual(snapshot(f.repo), before);
	assert.ok(f.commands().every(({ command, args }) => command === "git" || (command === "npm" && args[0] === "--version")));
	assert.ok(f.commands().every(({ args }) => !["fetch", "push", "pull", "add", "version", "ci", "run"].includes(args[0])));
});

for (const [failure, forbidden] of [["git fetch", "npm ci"], ["git rev-parse --verify @{upstream}", "git fetch"], ["npm ci", "npm run"], ["npm run release:check", "npm version"]]) {
	test(`failed prerequisite ${failure} stops later actions`, (t) => {
		const f = fixture(t, initialNotes);
		const result = f.run("scripts/release.mjs", ["patch"], { FAIL_COMMAND: failure });
		failed(result, /Injected failure|Command failed/);
		assert.ok(!f.commands().some(({ command, args }) => `${command} ${args.join(" ")}`.startsWith(forbidden)));
		assert.ok(!f.commands().some(({ args }) => ["install", "push", "pull"].includes(args[0])));
		assert.equal(parse(join(f.repo, "package.json")).version, "0.4.4");
	});
}

test("upstream mismatch and absent upstream fail before install", (t) => {
	const f = fixture(t, initialNotes);
	writeFileSync(join(f.repo, "sentinel"), "new commit");
	f.git("add", "."); f.git("commit", "-m", "test: ahead");
	failed(f.run("scripts/release.mjs", ["patch"]), /HEAD and upstream differ/);
	assert.ok(!f.commands().some(({ command, args }) => command === "npm" && args[0] === "ci"));
	f.git("config", "--unset", "branch.master.merge");
	failed(f.run("scripts/release.mjs", ["patch", "--dry-run"]), /upstream|Command failed/);
});

test("local preparation aligns all five files and leaves the index and refs unchanged", (t) => {
	const f = fixture(t, initialNotes);
	const index = readFileSync(join(f.repo, ".git/index"));
	const head = f.git("rev-parse", "HEAD");
	const result = f.run("scripts/release.mjs", ["patch"]);
	assert.equal(result.status, 0, result.stderr);
	assert.equal(parse(join(f.repo, "package.json")).version, "0.4.5");
	assert.equal(parse(join(f.repo, "package-lock.json")).version, "0.4.5");
	assert.equal(parse(join(f.repo, "package-lock.json")).packages[""].version, "0.4.5");
	assert.equal(parse(join(f.repo, "manifest.json")).version, "0.4.5");
	assert.equal(parse(join(f.repo, "versions.json"))["0.4.5"], "1.7.2");
	assert.ok(readFileSync(join(f.repo, "CHANGELOG.md"), "utf8").includes(historical));
	assert.deepEqual(readFileSync(join(f.repo, ".git/index")), index);
	assert.equal(f.git("rev-parse", "HEAD"), head);
	assert.ok(!f.commands().some(({ args }) => ["add", "push", "pull", "workflow"].includes(args[0])));
	failed(f.run("scripts/release.mjs", ["patch"]), /clean/);
});

test("a failed npm lifecycle reports partial metadata for deliberate recovery", (t) => {
	const f = fixture(t, initialNotes);
	const originalManifest = readFileSync(join(f.repo, "manifest.json"));
	const result = f.run("scripts/release.mjs", ["patch"], { VERSION_FAILURE: "1" });
	failed(result, /metadata may be partially changed/);
	assert.equal(parse(join(f.repo, "package.json")).version, "0.4.5");
	assert.deepEqual(readFileSync(join(f.repo, "manifest.json")), originalManifest);
	assert.ok(!f.commands().some(({ args }) => ["reset", "checkout", "tag", "push"].includes(args[0])));
	const recovery = f.run("version-bump.mjs", [], { npm_package_version: "0.4.5", npm_config_git_tag_version: "false" });
	assert.equal(recovery.status, 0, recovery.stderr);
	const after = snapshot(f.repo);
	assert.equal(f.run("version-bump.mjs", [], { npm_package_version: "0.4.5", npm_config_git_tag_version: "false" }).status, 0);
	assert.deepEqual(snapshot(f.repo), after);
});

test("lifecycle rejects implicit tagging and misaligned package-lock before writes", (t) => {
	const f = fixture(t);
	const before = snapshot(f.repo);
	failed(f.run("version-bump.mjs", ["--preflight"]), /implicit release commits\/tags are disabled/);
	assert.deepEqual(snapshot(f.repo), before);
	failed(f.run("version-bump.mjs", [], { npm_package_version: "0.4.5", npm_config_git_tag_version: "false" }), /package\/lock versions disagree/);
	assert.deepEqual(snapshot(f.repo), before);
});

for (const [label, notes] of [
	["missing Unreleased", "# Changelog\n"],
	["empty Unreleased", "# Changelog\n\n## [Unreleased]\n### Fixed\n"],
	["duplicate Unreleased", initialNotes.replace(historical, `## [Unreleased]\n\nMore\n\n${historical}`)],
	["duplicate version", releasedNotes.replace(historical, `## [0.4.4]\n\nDuplicate\n\n${historical}`)],
	["duplicate link", `${releasedNotes}[history]: https://example.com/duplicate\n`],
]) {
	test(`changelog rejects ${label} without mutation`, (t) => {
		const f = fixture(t, notes);
		const before = snapshot(f.repo);
		failed(f.run("scripts/update-changelog.mjs"), /Missing|empty|Duplicate/);
		assert.deepEqual(snapshot(f.repo), before);
	});
}

test("changelog EOF without refs, idempotent rerun and historic prose preservation", (t) => {
	const f = fixture(t, "# Changelog\n\n## [Unreleased]\n\n### Fixed\n- EOF change without newline");
	const result = f.run("scripts/update-changelog.mjs");
	assert.equal(result.status, 0, result.stderr);
	const prepared = readFileSync(join(f.repo, "CHANGELOG.md"), "utf8");
	assert.match(prepared, /- EOF change without newline$/);
	assert.equal(f.run("scripts/update-changelog.mjs").status, 0);
	assert.equal(readFileSync(join(f.repo, "CHANGELOG.md"), "utf8"), prepared);
	writeFileSync(join(f.repo, "CHANGELOG.md"), prepared.replace("## [Unreleased]", "## [Unreleased]\n\n- Later work."));
	const withLaterWork = readFileSync(join(f.repo, "CHANGELOG.md"), "utf8");
	failed(f.run("scripts/update-changelog.mjs"), /refusing to replace history/);
	assert.equal(readFileSync(join(f.repo, "CHANGELOG.md"), "utf8"), withLaterWork);
});

test("note extraction requires unique nonempty notes, excludes trailing refs and preserves source", (t) => {
	const f = fixture(t);
	const output = join(f.temp, "notes.md");
	assert.equal(f.run("scripts/extract-release-notes.mjs", ["0.4.3", output]).status, 0);
	assert.equal(readFileSync(output, "utf8"), "Historic prose with a literal Z.\n");
	for (const notes of [releasedNotes.replace("- Tested release changes.", ""), initialNotes, releasedNotes.replace(historical, "## [0.4.4]\nDuplicate")]) {
		writeFileSync(join(f.repo, "CHANGELOG.md"), notes);
		failed(f.run("scripts/extract-release-notes.mjs", ["0.4.4", output]), /empty|Duplicate/);
		assert.equal(readFileSync(output, "utf8"), "Historic prose with a literal Z.\n");
	}
});

for (const tag of ["v0.4.4", "0.4.4-beta.1", "00.4.4", "0.4.4;touch hacked", "../0.4.4", "0.4.5"]) {
	test(`packaging rejects invalid or mismatched tag ${tag} before install/output`, (t) => {
		const f = fixture(t);
		const before = snapshot(f.repo);
		failed(f.run("scripts/prepare-release-assets.mjs", [tag]), /Invalid|disagree/);
		assert.deepEqual(snapshot(f.repo), before);
		assert.ok(!f.commands().some(({ args }) => ["ci", "run", "archive"].includes(args[0])));
	});
}

for (const [file, mutate] of [
	["package.json", (v) => { v.version = "0.4.5"; }],
	["package-lock.json", (v) => { v.version = "0.4.5"; }],
	["package-lock.json", (v) => { v.packages[""].version = "0.4.5"; }],
	["manifest.json", (v) => { v.version = "0.4.5"; }],
	["versions.json", (v) => { v["0.4.4"] = "1.0.0"; }],
	["versions.json", (v) => { delete v["0.4.4"]; }],
	["manifest.json", (v) => { v.minAppVersion = "invalid"; }],
]) {
	test(`committed ${file} disagreement is rejected without metadata repair`, (t) => {
		const f = fixture(t);
		const value = parse(join(f.repo, file)); mutate(value); writeJSON(join(f.repo, file), value); f.commit();
		const before = snapshot(f.repo);
		failed(f.run("scripts/prepare-release-assets.mjs", ["0.4.4"]), /disagree|Invalid/);
		assert.deepEqual(snapshot(f.repo), before);
		assert.ok(!f.commands().some(({ args }) => ["ci", "run", "archive"].includes(args[0])));
	});
}

test("candidate dry run validates committed notes and tag identity with no export or mutation", (t) => {
	const f = fixture(t);
	const before = snapshot(f.repo);
	assert.equal(f.run("scripts/prepare-release-assets.mjs", ["0.4.4", "--dry-run"]).status, 0);
	assert.deepEqual(snapshot(f.repo), before);
	assert.ok(!f.commands().some(({ args }) => ["archive", "ci", "run"].includes(args[0])));
	failed(f.run("scripts/prepare-release-assets.mjs", ["0.4.4"], { FAKE_TAG: "0.4.4", TAG_SHA: "a".repeat(40) }), /must point/);
	writeFileSync(join(f.repo, "CHANGELOG.md"), releasedNotes.replace("- Tested release changes.", "")); f.commit();
	failed(f.run("scripts/prepare-release-assets.mjs", ["0.4.4"]), /empty/);
	assert.ok(!existsSync(join(f.repo, "dist")));
});

test("packaging uses fresh production bytes and exact manifest, with a complete hash receipt", (t) => {
	const f = fixture(t);
	writeFileSync(join(f.repo, "main.js"), "stale local build");
	writeFileSync(join(f.repo, "data.json"), "private settings");
	writeFileSync(join(f.repo, ".env"), "private environment");
	writeFileSync(join(f.repo, "main.js.map"), "private source map");
	const directory = f.candidate();
	assert.deepEqual(readdirSync(directory).sort(), ["main.js", "manifest.json", "receipt.json", "release-notes.md", "styles.css"]);
	assert.equal(readFileSync(join(directory, "main.js"), "utf8"), "fresh production bytes\n");
	assert.deepEqual(readFileSync(join(directory, "manifest.json")), readFileSync(join(f.repo, "manifest.json")));
	assert.equal(readFileSync(join(f.repo, "main.js"), "utf8"), "stale local build");
	const receipt = parse(join(directory, "receipt.json"));
	assert.equal(receipt.schemaVersion, 1);
	assert.equal(receipt.sourceCommit, f.git("rev-parse", "HEAD"));
	assert.equal(receipt.repository, "gtg922r/obsidian-entities");
	for (const [file, info] of Object.entries(receipt.artifacts)) {
		assert.equal(info.sha256, hash(readFileSync(join(directory, file))));
		assert.equal(info.size, readFileSync(join(directory, file)).length);
	}
	for (const [file, digest] of Object.entries(receipt.metadata)) assert.equal(digest, hash(readFileSync(join(f.repo, file))));
	assert.equal(receipt.notesSha256, hash(readFileSync(join(directory, "release-notes.md"))));
	const before = snapshot(directory);
	failed(f.run("scripts/prepare-release-assets.mjs", ["0.4.4"]), /Output already exists/);
	assert.deepEqual(snapshot(directory), before);
});

for (const mode of ["missing", "map", "mutate", "symlink", "remove-styles"]) {
	test(`invalid build ${mode} cannot leave a valid or partial package`, (t) => {
		const f = fixture(t);
		writeFileSync(join(f.repo, "main.js"), "stale local build");
		const result = f.run("scripts/prepare-release-assets.mjs", ["0.4.4"], { BUILD_MODE: mode, INSTALL_MAIN: "1" });
		failed(result, /ENOENT|source map|changed checked metadata|regular file/);
		assert.ok(!existsSync(join(f.repo, "dist", "release", "0.4.4")));
		assert.equal(readFileSync(join(f.repo, "main.js"), "utf8"), "stale local build");
	});
}

test("stale partial destination is rejected without deleting its contents", (t) => {
	const f = fixture(t);
	const directory = join(f.repo, "dist", "release", "0.4.4"); mkdirSync(directory, { recursive: true });
	writeFileSync(join(directory, "main.js"), "partial");
	const before = snapshot(directory);
	failed(f.run("scripts/prepare-release-assets.mjs", ["0.4.4"]), /already exists/);
	assert.deepEqual(snapshot(directory), before);
	assert.ok(!f.commands().some(({ args }) => ["ci", "run", "archive"].includes(args[0])));
});

test("publication dry run verifies local/remote identities without upload or mutation", (t) => {
	const f = fixture(t); f.candidate();
	writeFileSync(f.ledger, "");
	const before = snapshot(f.repo);
	const result = f.run("scripts/publish-release.mjs", ["0.4.4", "--prerelease", "--dry-run"], publicationEnv(f));
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(snapshot(f.repo), before);
	assert.ok(!f.commands().some(({ args }) => ["create", "upload", "edit", "run", "ci", "push", "fetch", "archive", "workflow"].some((arg) => args.includes(arg))));
});

test("publication sends only verified bytes to the explicit intended prerelease tag/repo", (t) => {
	const f = fixture(t); const directory = f.candidate();
	writeFileSync(f.ledger, "");
	const result = f.run("scripts/publish-release.mjs", ["--prerelease", "0.4.4"], { ...publicationEnv(f), ANNOTATED: "1" });
	assert.equal(result.status, 0, result.stderr);
	const create = f.commands().find(({ command, args }) => command === "gh" && args[0] === "release");
	assert.deepEqual(create.args.slice(0, 10), ["release", "create", "0.4.4", "--repo", "github.com/gtg922r/obsidian-entities", "--verify-tag", "--draft", "--prerelease", "--latest=false", "--title"]);
	const uploaded = parse(f.env.UPLOAD_CAPTURE);
	for (const file of ["main.js", "manifest.json", "styles.css", "receipt.json", "release-notes.md"]) assert.equal(uploaded[file], readFileSync(join(directory, file), "utf8"));
	assert.ok(!f.commands().some(({ args }) => ["ci", "run", "push", "fetch", "workflow", "upload"].includes(args[0])));
});

test("stable publication and unknown flags fail before commands", (t) => {
	const f = fixture(t);
	failed(f.run("scripts/publish-release.mjs", ["0.4.4"]), /Stable publication\/promotion is disabled/);
	failed(f.run("scripts/publish-release.mjs", ["0.4.4", "--prerelease", "--stable"]), /Usage/);
	assert.deepEqual(f.commands(), []);
});

for (const [label, mutate] of [
	["main bytes", (dir) => writeFileSync(join(dir, "main.js"), "mutated")],
	["manifest bytes", (dir) => writeFileSync(join(dir, "manifest.json"), "mutated")],
	["notes", (dir) => writeFileSync(join(dir, "release-notes.md"), "mutated")],
	["private data", (dir) => writeFileSync(join(dir, "data.json"), "private")],
	["map", (dir) => writeFileSync(join(dir, "main.js.map"), "map")],
	["environment", (dir) => writeFileSync(join(dir, ".env"), "private")],
	["backup", (dir) => writeFileSync(join(dir, "manifest.json.bak"), "backup")],
	["missing styles", (dir) => rmSync(join(dir, "styles.css"))],
	["symlink", (dir) => { rmSync(join(dir, "main.js")); symlinkSync("manifest.json", join(dir, "main.js")); }],
]) {
	test(`publication rejects ${label}`, (t) => {
		const f = fixture(t); const directory = f.candidate(); mutate(directory); writeFileSync(f.ledger, "");
		failed(f.run("scripts/publish-release.mjs", ["0.4.4", "--prerelease"], publicationEnv(f)), /mismatch|differ|allowlisted|regular file/);
		assert.ok(!f.commands().some(({ command }) => command === "gh"));
	});
}

for (const [label, mutate] of [
	["repo", (v) => { v.repository = "somewhere/else"; }],
	["tag", (v) => { v.tag = "0.4.5"; }],
	["source", (v) => { v.sourceCommit = "master"; }],
	["floor", (v) => { v.minAppVersion = "1.0.0"; }],
	["metadata hash", (v) => { v.metadata["package.json"] = "a".repeat(64); }],
	["metadata omitted", (v) => { delete v.metadata["versions.json"]; }],
	["artifact omitted", (v) => { delete v.artifacts["main.js"]; }],
	["artifact hash", (v) => { v.artifacts["main.js"].sha256 = "a".repeat(64); }],
]) {
	test(`publication rejects receipt ${label}`, (t) => {
		const f = fixture(t); const directory = f.candidate();
		const path = join(directory, "receipt.json"); const receipt = parse(path); mutate(receipt); writeJSON(path, receipt); writeFileSync(f.ledger, "");
		failed(f.run("scripts/publish-release.mjs", ["0.4.4", "--prerelease"], publicationEnv(f)), /invalid|mismatch|disagree|allowlisted/);
		assert.ok(!f.commands().some(({ command }) => command === "gh"));
	});
}

for (const [label, override] of [
	["missing local tag", { FAKE_TAG: "" }],
	["wrong local tag", { TAG_SHA: "a".repeat(40) }],
	["missing remote tag", { REMOTE_SHA: "" }],
	["wrong remote tag", { REMOTE_SHA: "b".repeat(40) }],
	["existing release", { EXISTING_RELEASE: "1" }],
	["GitHub failure", { FAIL_COMMAND: "gh api" }],
]) {
	test(`publication refuses ${label}`, (t) => {
		const f = fixture(t); f.candidate(); writeFileSync(f.ledger, "");
		failed(f.run("scripts/publish-release.mjs", ["0.4.4", "--prerelease"], { ...publicationEnv(f), ...override }), /must point|Remote tag|already exists|Command failed/);
		assert.ok(!f.commands().some(({ command, args }) => command === "gh" && args[0] === "release"));
	});
}

test("optional absent styles are valid and foreign publication repo is rejected", (t) => {
	const f = fixture(t); rmSync(join(f.repo, "styles.css")); f.commit();
	const directory = f.candidate();
	assert.ok(!existsSync(join(directory, "styles.css")));
	assert.equal(f.run("scripts/publish-release.mjs", ["0.4.4", "--prerelease", "--dry-run"], publicationEnv(f)).status, 0);
	f.git("remote", "set-url", "origin", "https://github.com/other/repo.git");
	failed(f.run("scripts/publish-release.mjs", ["0.4.4", "--prerelease"], publicationEnv(f)), /origin must identify/);
});

for (const mode of ["corrupt", "extra", "missing", "incomplete"]) {
	test(`remote draft ${mode} fails before visibility with no destructive cleanup`, (t) => {
		const f = fixture(t); f.candidate(); writeFileSync(f.ledger, "");
		failed(f.run("scripts/publish-release.mjs", ["0.4.4", "--prerelease"], { ...publicationEnv(f), REMOTE_MODE: mode }), /Publication failed/);
		assert.ok(f.commands().some(({ args }) => args[0] === "release" && args[1] === "create" && args.includes("--draft")));
		assert.ok(!f.commands().some(({ args }) => ["edit", "delete", "upload"].includes(args[1])));
		assert.ok(existsSync(f.env.UPLOAD_CAPTURE));
	});
}

test("all remote bytes are checked before publishing the same draft; source may be behind HEAD", (t) => {
	const f = fixture(t); const directory = f.candidate(); const env = publicationEnv(f);
	writeFileSync(join(f.repo, "later-change.txt"), "master advanced independently"); f.commit(); writeFileSync(f.ledger, "");
	const result = f.run("scripts/publish-release.mjs", ["0.4.4", "--prerelease"], env);
	assert.equal(result.status, 0, result.stderr);
	const commands = f.commands();
	const editIndex = commands.findIndex(({ args }) => args[0] === "release" && args[1] === "edit");
	assert.ok(editIndex > 0);
	assert.equal(commands.slice(0, editIndex).filter(({ args }) => args[0] === "api" && args.at(-1).includes("/assets/")).length, 4);
	assert.ok(commands[editIndex].args.includes("--draft=false"));
	assert.ok(commands[editIndex].args.includes("--prerelease"));
	assert.ok(commands[editIndex].args.includes("--latest=false"));
	assert.equal(parse(join(directory, "receipt.json")).sourceCommit, env.TAG_SHA);
});

for (const failure of ["gh release create", "gh api --hostname github.com -H", "gh release edit"]) {
	test(`uncertain publication step ${failure} fails without automatic retry or cleanup`, (t) => {
		const f = fixture(t); f.candidate(); writeFileSync(f.ledger, "");
		failed(f.run("scripts/publish-release.mjs", ["0.4.4", "--prerelease"], { ...publicationEnv(f), FAIL_COMMAND: failure }), /publication status uncertain/);
		assert.ok(!f.commands().some(({ args }) => ["delete", "upload"].includes(args[1])));
	});
}

test("dirty candidate sources and missing notes are rejected before installing", (t) => {
	const f = fixture(t);
	writeFileSync(join(f.repo, "manifest.json"), "{}");
	failed(f.run("scripts/prepare-release-assets.mjs", ["0.4.4"]), /clean/);
	assert.ok(!f.commands().some(({ args }) => ["ci", "run"].includes(args[0])));
});

for (const failure of ["npm ci", "npm run check"]) {
	test(`candidate ${failure} failure never writes a package`, (t) => {
		const f = fixture(t);
		failed(f.run("scripts/prepare-release-assets.mjs", ["0.4.4"], { FAIL_COMMAND: failure }), /Injected failure|Command failed/);
		assert.ok(!existsSync(join(f.repo, "dist")));
		assert.ok(!f.commands().some(({ args }) => args[0] === "install"));
	});
}

test("npm preversion preflights requested notes before package or lock mutation", (t) => {
	const f = fixture(t, initialNotes);
	const before = snapshot(f.repo);
	const env = { npm_config_git_tag_version: "false", npm_new_version: "0.4.5" };
	assert.equal(f.run("version-bump.mjs", ["--preflight"], env).status, 0);
	assert.deepEqual(snapshot(f.repo), before);
	writeFileSync(join(f.repo, "CHANGELOG.md"), "# Changelog\n\n## [Unreleased]\n\n### Fixed\n- \n");
	const empty = snapshot(f.repo);
	failed(f.run("version-bump.mjs", ["--preflight"], env), /empty/);
	assert.deepEqual(snapshot(f.repo), empty);
});

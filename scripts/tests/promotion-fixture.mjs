import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { METADATA_FILES, REPOSITORY, sha256 } from "../release-utils.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
export const writeJSON = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, "\t")}\n`);

// All network commands are replaced; unknown commands fail instead of reaching the network.
const executable = `#!${process.execPath}
const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const args = process.argv.slice(2), command = path.basename(process.argv[1]);
const previous = fs.readFileSync(process.env.LEDGER, 'utf8').trim().split('\\n').filter(Boolean).map(JSON.parse);
const input = args.includes('--input') ? fs.readFileSync(0,'utf8') : undefined;
fs.appendFileSync(process.env.LEDGER, JSON.stringify({command,args,input})+'\\n');
const state = JSON.parse(fs.readFileSync(process.env.STATE));
const output = (value) => { process.stdout.write(typeof value === 'string' ? value : JSON.stringify(value)); process.exit(0); };
const fail = () => { console.error('Injected API failure (including 404)'); process.exit(19); };
if (command === 'npm') { if (args.join(' ') !== '--version') throw Error('Forbidden npm command'); output('11.19.0'); }
if (command === 'git') {
 if (args[0] === 'ls-remote') {
  if (args.includes('--tags')) output(state.tagRefs);
  output(state.defaultCommit+'\\trefs/heads/'+state.defaultBranch+'\\n');
 }
 if (!['rev-parse','remote','cat-file','ls-tree','show','tag','merge-base','check-ref-format','status'].includes(args[0]) || (args[0] === 'tag' && args[1] !== '--list')) throw Error('Forbidden Git command: '+args);
 const result = cp.spawnSync(process.env.REAL_GIT,args,{stdio:'inherit',env:process.env}); process.exit(result.status ?? 1);
}
if (command !== 'gh' || args[0] !== 'api' || args[args.indexOf('--hostname')+1] !== 'github.com') throw Error('Forbidden command');
const endpoint = args.at(-1);
if (!endpoint.startsWith('repos/gtg922r/obsidian-entities')) throw Error('Wrong API repository');
const count = previous.filter(c => c.command === 'gh' && c.args.at(-1) === endpoint).length+1;
const mutation = args.includes('PATCH');
const fault = state.faults?.find(f => f.endpoint === endpoint && f.count === count && (f.mutation === undefined || f.mutation === mutation));
if (fault?.change) {
 Object.assign(state, fault.change);
 fs.writeFileSync(process.env.STATE,JSON.stringify(state));
}
if (fault?.error) fail();
if (fault && Object.hasOwn(fault,'response')) output(fault.response);
if (mutation) {
 if (endpoint !== 'repos/gtg922r/obsidian-entities/releases/42' || input !== JSON.stringify({prerelease:false,make_latest:'true'})) throw Error('Forbidden mutation');
 state.release.prerelease = false;
 state.promoted = true;
 fs.writeFileSync(process.env.STATE,JSON.stringify(state));
 if (state.patchFailure) fail();
 output(state.release);
}
if (args.includes('--method') && args[args.indexOf('--method')+1] !== 'GET') throw Error('Forbidden method');
if (endpoint === 'repos/gtg922r/obsidian-entities') output({full_name:state.repository,default_branch:state.defaultBranch});
if (endpoint.includes('/contents/')) {
 const parsed = new URL('https://fixture.invalid/'+endpoint);
 const file = decodeURIComponent(parsed.pathname.split('/contents/')[1]);
 const commit = parsed.searchParams.get('ref');
 if (state.contentOverrides?.[commit+':'+file] !== undefined) output(state.contentOverrides[commit+':'+file]);
 const result = cp.spawnSync(process.env.REAL_GIT,['show',commit+':'+file],{encoding:null});
 if (result.status !== 0) fail();
 process.stdout.write(result.stdout); process.exit(0);
}
if (endpoint.endsWith('/releases?per_page=100')) output(state.releasePages ?? [[...state.stableReleases,state.release]]);
if (endpoint.endsWith('/releases/42/assets?per_page=100')) output(state.assetPages ?? [state.release.assets]);
if (endpoint.includes('/releases/assets/')) {
 const id = endpoint.split('/').at(-1);
 if (!state.downloads[id]) fail();
 process.stdout.write(Buffer.from(state.downloads[id],'base64')); process.exit(0);
}
if (endpoint.endsWith('/releases/latest')) {
 if (state.latestFailure || (!state.promoted && !state.stableReleases.length)) fail();
 output(state.promoted ? state.release : state.stableReleases.at(-1));
}
if (endpoint.endsWith('/releases/42')) output(state.release);
throw Error('Unexpected endpoint: '+endpoint);
`;

/** Build actual candidate/merge/evidence Git ancestry and an entirely fake GitHub. */
export function fixture(t, { styles = true, annotated = false } = {}) {
	const temp = mkdtempSync(join(tmpdir(), "entities-promotion-test-"));
	t.after(() => rmSync(temp, { recursive: true, force: true }));
	const repo = join(temp, "repo"), bin = join(temp, "bin"), statePath = join(temp, "remote.json"), ledger = join(temp, "commands.jsonl");
	mkdirSync(join(repo, "scripts"), { recursive: true });
	mkdirSync(bin);
	for (const name of ["promote-release.mjs", "promotion-utils.mjs", "release-utils.mjs", "publish-release.mjs"]) copyFileSync(join(root, "scripts", name), join(repo, "scripts", name));
	for (const name of ["git", "gh", "npm"]) { writeFileSync(join(bin, name), executable); chmodSync(join(bin, name), 0o755); }
	const git = (...args) => execFileSync(realGit, args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
	git("init", "-b", "master");
	git("config", "user.email", "promotion-tests@example.invalid");
	git("config", "user.name", "Promotion Tests");
	git("config", "commit.gpgsign", "false");
	git("config", "core.hooksPath", join(temp, "empty-hooks"));
	git("remote", "add", "origin", `https://github.com/${REPOSITORY}.git`);
	const commit = () => { git("add", "."); git("commit", "-m", "test: fixture"); return git("rev-parse", "HEAD"); };
	writeFileSync(join(repo, ".gitignore"), "dist/\nnode_modules/\n");
	writeJSON(join(repo, "package.json"), { name: "promotion-fixture", version: "0.4.3", engines: { node: "24.21.0", npm: "11.19.0" }, scripts: { "release:promote": "node scripts/promote-release.mjs" } });
	const base = commit();
	git("switch", "-c", "candidate");
	const pkg = JSON.parse(readFileSync(join(repo, "package.json"))); pkg.version = "0.4.4"; writeJSON(join(repo, "package.json"), pkg);
	writeJSON(join(repo, "package-lock.json"), { version: "0.4.4", packages: { "": { version: "0.4.4" } } });
	writeJSON(join(repo, "manifest.json"), { id: "entities", name: "Entities", version: "0.4.4", minAppVersion: "1.7.2", isDesktopOnly: false });
	writeJSON(join(repo, "versions.json"), { "0.4.4": "1.7.2" });
	const notes = "- Tested changes.\n";
	writeFileSync(join(repo, "CHANGELOG.md"), `# Changelog\n\n## [Unreleased]\n\n## [0.4.4]\n\n${notes}`);
	if (styles) writeFileSync(join(repo, "styles.css"), "/* tested styles */\n");
	const sourceCommit = commit();
	if (annotated) git("-c", "tag.gpgsign=false", "tag", "-a", "0.4.4", "-m", "tested candidate"); else git("tag", "0.4.4");
	const tagObject = git("rev-parse", "refs/tags/0.4.4");
	git("switch", "master");
	writeFileSync(join(repo, "later-runtime.js"), "newer code must never be packaged by promotion\n"); commit();
	git("merge", "--no-ff", "candidate", "-m", "test: reviewed metadata transition");
	const metadataCommit = git("rev-parse", "HEAD");
	const files = { "main.js": Buffer.from("tested production bytes\n"), "manifest.json": readFileSync(join(repo, "manifest.json")), ...(styles ? { "styles.css": readFileSync(join(repo, "styles.css")) } : {}) };
	const receipt = {
		schemaVersion: 1, repository: REPOSITORY, tag: "0.4.4", sourceCommit, minAppVersion: "1.7.2", toolchain: { node: "24.21.0", npm: "11.19.0" },
		metadata: Object.fromEntries(METADATA_FILES.map(file => [file, sha256(readFileSync(join(repo, file)))])),
		artifacts: Object.fromEntries(Object.entries(files).map(([file, bytes]) => [file, { sha256: sha256(bytes), size: bytes.length }])), notesSha256: sha256(notes),
	};
	files["receipt.json"] = Buffer.from(`${JSON.stringify(receipt, null, "\t")}\n`);
	const directory = join(repo, "dist", "release", "0.4.4"); mkdirSync(directory, { recursive: true });
	for (const [file, bytes] of Object.entries(files)) writeFileSync(join(directory, file), bytes);
	writeFileSync(join(directory, "release-notes.md"), notes);
	const reportPath = "acceptance-report.md";
	writeFileSync(join(repo, reportPath), `# Fixture evidence only\nCandidate ${sourceCommit}; receipt ${sha256(files["receipt.json"])}. No real runtime acceptance.\n`);
	const reportCommit = commit();
	const assets = Object.entries(files).map(([name, bytes], index) => ({ name, id: 100 + index, state: "uploaded", size: bytes.length, digest: `sha256:${sha256(bytes)}`, created_at: "2026-09-01T01:00:00Z", updated_at: "2026-09-01T01:00:00Z" }));
	const acceptance = {
		schemaVersion: 1, repository: REPOSITORY, tag: "0.4.4", sourceCommit, tagObject, releaseId: 42, receiptSha256: sha256(files["receipt.json"]), minAppVersion: "1.7.2", metadataCommit,
		assets: Object.fromEntries(assets.map(asset => [asset.name, { id: asset.id, size: asset.size, sha256: sha256(files[asset.name]) }])),
		review: { commit: reportCommit, path: reportPath, sha256: sha256(readFileSync(join(repo, reportPath))) },
	};
	const recordPath = "acceptance.json";
	writeJSON(join(repo, recordPath), acceptance);
	let recordCommit = commit();
	const state = { repository: REPOSITORY, defaultBranch: "master", defaultCommit: recordCommit, tagRefs: `${tagObject}\trefs/tags/0.4.4\n${annotated ? `${sourceCommit}\trefs/tags/0.4.4^{}\n` : ""}`, stableReleases: [], release: { id: 42, tag_name: "0.4.4", draft: false, prerelease: true, name: "0.4.4", body: notes, target_commitish: sourceCommit, created_at: "2026-09-01T01:00:00Z", published_at: "2026-09-01T02:00:00Z", assets }, downloads: Object.fromEntries(assets.map(asset => [asset.id, files[asset.name].toString("base64")])) };
	const save = () => writeJSON(statePath, state);
	save(); writeFileSync(ledger, "");
	const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, REAL_GIT: realGit, STATE: statePath, LEDGER: ledger, GIT_OPTIONAL_LOCKS: "0" };
	const run = (args = ["0.4.4", "--acceptance", `${recordCommit}:${recordPath}`, "--dry-run"], options = {}) => spawnSync(process.execPath, [join(repo, "scripts/promote-release.mjs"), ...args], { cwd: repo, env, encoding: "utf8", ...options });
	const record = () => { writeJSON(join(repo, recordPath), acceptance); recordCommit = commit(); state.defaultCommit = recordCommit; save(); return `${recordCommit}:${recordPath}`; };
	const commands = () => readFileSync(ledger, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
	return { repo, temp, bin, env, run, git, commit, base, sourceCommit, metadataCommit, acceptance, record, directory, files, receipt, state, save, commands, ledger, ref: () => `${recordCommit}:${recordPath}` };
}

/** Snapshot content including Git index/refs; fake-API ledgers live outside the checkout. */
export function snapshot(directory) {
	const result = {};
	for (const name of readdirSync(directory).sort()) {
		const file = join(directory, name);
		result[name] = lstatSync(file).isDirectory() ? snapshot(file) : sha256(readFileSync(file));
	}
	return result;
}

export function failed(result, pattern) {
	assert.notEqual(result.status, 0, result.stdout);
	assert.match(result.stderr, pattern);
}
export const patches = f => f.commands().filter(c => c.command === "gh" && c.args.includes("PATCH"));

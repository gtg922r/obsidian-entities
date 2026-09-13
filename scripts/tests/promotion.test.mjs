import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { failed, fixture, patches, snapshot, writeJSON } from "./promotion-fixture.mjs";

const prefix = "repos/gtg922r/obsidian-entities";
const runPromotion = f => f.run(["0.4.4", "--acceptance", f.ref()]);
const listEndpoint = `${prefix}/releases?per_page=100`;
const assetEndpoint = `${prefix}/releases/42/assets?per_page=100`;

for (const options of [{}, { styles: false, annotated: true }]) {
	test(`observational dry run downloads remote receipt and all bytes (${JSON.stringify(options)})`, t => {
		const f = fixture(t, options);
		const before = snapshot(f.repo);
		const result = f.run();
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /Planned only: one release-ID PATCH/);
		assert.deepEqual(snapshot(f.repo), before);
		assert.equal(patches(f).length, 0);
		assert.ok(f.commands().every(({ command, args }) => command !== "npm" || args.join(" ") === "--version"));
		for (const asset of f.state.release.assets) assert.equal(f.commands().filter(c => c.command === "gh" && c.args.at(-1) === `${prefix}/releases/assets/${asset.id}`).length, 2);
		assert.ok(!f.commands().some(c => c.args.at(-1) === `${prefix}/releases/latest`));
	});
}

test("first stable preserves the exact candidate despite newer code on master; only one PATCH", t => {
	const f = fixture(t);
	assert.notEqual(f.state.defaultCommit, f.sourceCommit);
	const before = snapshot(f.repo);
	const result = runPromotion(f);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /Promoted 0.4.4/);
	assert.deepEqual(snapshot(f.repo), before);
	assert.equal(patches(f).length, 1);
	assert.deepEqual(JSON.parse(patches(f)[0].input), { prerelease: false, make_latest: "true" });
	assert.equal(patches(f)[0].args.at(-1), `${prefix}/releases/42`);
	const commands = f.commands(), patchIndex = commands.findIndex(c => c.args.includes("PATCH"));
	assert.ok(commands.findIndex(c => c.args.at(-1) === `${prefix}/releases/latest`) > patchIndex);
	for (const asset of f.state.release.assets) assert.equal(commands.filter(c => c.args.at(-1) === `${prefix}/releases/assets/${asset.id}`).length, 3);
});

test("paginated releases and assets include all pages with older stable releases", t => {
	const f = fixture(t);
	f.state.stableReleases = [{ id: 12, tag_name: "0.4.3", draft: false, prerelease: false, published_at: "2026-08-01T01:00:00Z" }];
	f.state.releasePages = [f.state.stableReleases, [f.state.release]];
	f.state.assetPages = [f.state.release.assets.slice(0, 1), f.state.release.assets.slice(1)];
	f.save();
	assert.equal(f.run().status, 0);
	assert.ok(f.commands().filter(c => [listEndpoint, assetEndpoint].includes(c.args.at(-1))).every(c => c.args.includes("--paginate") && c.args.includes("--slurp")));
});

for (const args of [[], ["0.4.4"], ["0.4.4", "--prerelease"], ["0.4.4", "--acceptance"], ["0.4.4", "--acceptance", "x", "--dry-run", "--dry-run"], ["0.4.4", "--acceptance", "x", "--force"], ["--dry-run", "0.4.4", "--acceptance", "x"], ["v0.4.4", "--acceptance", "x"], ["0.4.4-beta.1", "--acceptance", "x"], ["0.4.4;touch hacked", "--acceptance", "x"]]) {
	test(`real CLI rejects arguments ${JSON.stringify(args)}`, t => {
		const f = fixture(t);
		failed(f.run(args), /Usage|Invalid release version/);
		assert.equal(f.commands().length, 0);
	});
}

for (const ref of ["acceptance.json", "master:acceptance.json", `${"a".repeat(40)}:../acceptance.json`, `${"a".repeat(40)}:/acceptance.json`, `${"a".repeat(40)}:acceptance.json?ref=master`]) {
	test(`reject nonimmutable/hostile acceptance reference ${ref}`, t => {
		const f = fixture(t);
		const actualRef = ref.replace("a".repeat(40), f.ref().split(":")[0]);
		failed(f.run(["0.4.4", "--acceptance", actualRef, "--dry-run"]), /acceptance|Evidence|Expected|Command failed/);
		assert.equal(patches(f).length, 0);
	});
}

for (const [label, mutate] of [
	["schema", a => { a.schemaVersion = 2; }],
	["boolean approval", a => { a.approved = true; }],
	["repository", a => { a.repository = "other/repo"; }],
	["tag", a => { a.tag = "0.4.5"; }],
	["source", a => { a.sourceCommit = "a".repeat(40); }],
	["floor", a => { a.minAppVersion = "1.13.4"; }],
	["receipt", a => { a.receiptSha256 = "a".repeat(64); }],
	["release ID", a => { a.releaseId = 0; }],
	["release ID string", a => { a.releaseId = "42"; }],
	["missing asset", a => { delete a.assets["main.js"]; }],
	["duplicate asset ID", a => { a.assets["main.js"].id = a.assets["manifest.json"].id; }],
	["negative asset ID", a => { a.assets["main.js"].id = -1; }],
	["unsafe asset ID", a => { a.assets["main.js"].id = Number.MAX_SAFE_INTEGER + 1; }],
	["asset bytes", a => { a.assets["main.js"].sha256 = "a".repeat(64); }],
	["report hash", a => { a.review.sha256 = "a".repeat(64); }],
	["report traversal", a => { a.review.path = "../report.md"; }],
	["missing report", a => { a.review.path = "missing.md"; }],
]) {
	test(`reject malformed/mismatched acceptance: ${label}`, t => {
		const f = fixture(t); mutate(f.acceptance); f.record();
		failed(f.run(), /Acceptance|Evidence|Expected|Command failed/);
		assert.equal(patches(f).length, 0);
	});
}

for (const [label, mutate] of [
	["wrong schema", r => { r.schemaVersion = 2; }],
	["wrong repo", r => { r.repository = "other/repo"; }],
	["wrong tag", r => { r.tag = "0.4.5"; }],
	["wrong source", r => { r.sourceCommit = "master"; }],
	["wrong floor", r => { r.minAppVersion = "1.13.4"; }],
	["wrong toolchain", r => { r.toolchain.node = "24.12.0"; }],
	["metadata hash", r => { r.metadata["manifest.json"] = "a".repeat(64); }],
	["notes hash", r => { r.notesSha256 = "a".repeat(64); }],
	["artifact hash", r => { r.artifacts["main.js"].sha256 = "a".repeat(64); }],
	["artifact size", r => { r.artifacts["main.js"].size = -1; }],
	["extra artifact", r => { r.artifacts["data.json"] = {}; }],
]) {
	test(`reject local receipt: ${label}`, t => {
		const f = fixture(t); mutate(f.receipt); writeJSON(join(f.directory, "receipt.json"), f.receipt);
		failed(f.run(), /Receipt|Expected|notes|artifact/);
		assert.equal(patches(f).length, 0);
	});
}

test("reject invalid JSON, symlink, extra local file and changed local bytes", t => {
	const f = fixture(t);
	writeFileSync(join(f.directory, "receipt.json"), "{"); failed(f.run(), /JSON/);
	writeFileSync(join(f.directory, "receipt.json"), f.files["receipt.json"]);
	writeFileSync(join(f.directory, "data.json"), "private"); failed(f.run(), /allowlist/); rmSync(join(f.directory, "data.json"));
	writeFileSync(join(f.directory, "main.js"), "different"); failed(f.run(), /hash\/size/);
	rmSync(join(f.directory, "main.js")); symlinkSync("manifest.json", join(f.directory, "main.js")); failed(f.run(), /regular file/);
	assert.equal(patches(f).length, 0);
});

for (const [label, mutate] of [
	["wrong repository", s => { s.repository = "elsewhere/repo"; }],
	["tag missing", s => { s.tagRefs = ""; }],
	["tag drift", s => { s.tagRefs = `${"a".repeat(40)}\trefs/tags/0.4.4\n`; }],
	["annotated tag recreated", s => { s.tagRefs = `${"a".repeat(40)}\trefs/tags/0.4.4\n${s.release.target_commitish}\trefs/tags/0.4.4^{}\n`; }],
	["draft", s => { s.release.draft = true; }],
	["already stable", s => { s.release.prerelease = false; }],
	["untyped status", s => { s.release.prerelease = "true"; }],
	["wrong release ID", s => { s.release.id = 43; }],
	["negative release ID", s => { s.release.id = -1; }],
	["changed body", s => { s.release.body = "other notes"; }],
	["malformed candidate date", s => { s.release.published_at = "2026-02-31T00:00:00Z"; }],
	["missing asset", s => { s.release.assets.pop(); }],
	["extra asset", s => { s.release.assets.push({ id: 500, name: "data.json", size: 10, state: "uploaded" }); }],
	["duplicate asset name", s => { s.release.assets[0].name = s.release.assets[1].name; }],
	["duplicate asset ID", s => { s.release.assets[0].id = s.release.assets[1].id; }],
	["replaced asset ID", s => { s.release.assets[0].id = 999; }],
	["incomplete asset", s => { s.release.assets[0].state = "new"; }],
	["asset size", s => { s.release.assets[0].size++; }],
	["asset digest", s => { s.release.assets[0].digest = `sha256:${"a".repeat(64)}`; }],
]) {
	test(`reject remote candidate: ${label}`, t => {
		const f = fixture(t); mutate(f.state); f.save();
		failed(f.run(), /repository|tag|release|asset|timestamp/);
		assert.equal(patches(f).length, 0);
	});
}

for (const name of ["main.js", "manifest.json", "styles.css", "receipt.json"]) {
	test(`actually download and reject corrupted remote ${name}`, t => {
		const f = fixture(t); const id = f.acceptance.assets[name].id;
		f.state.downloads[id] = Buffer.from("different bytes").toString("base64"); f.save();
		failed(f.run(), new RegExp(`Remote asset bytes.*${name.replaceAll(".", "\\.")}`));
		assert.equal(patches(f).length, 0);
	});
}

for (const [tag, date] of [["0.4.4", "2026-08-01T01:00:00Z"], ["0.4.10", "2026-08-01T01:00:00Z"], ["1.0.0", "2026-08-01T01:00:00Z"], ["0.4.3", "2026-09-02T01:00:00Z"], ["v0.4.3", "2026-08-01T01:00:00Z"], ["0.4.3", "invalid"]]) {
	test(`stable release ${tag} published ${date} blocks stale/ambiguous promotion on later page`, t => {
		const f = fixture(t);
		f.state.releasePages = [[f.state.release], [{ id: 55, tag_name: tag, draft: false, prerelease: false, published_at: date }]]; f.save();
		failed(f.run(), /stable|duplicate|Invalid release version|timestamp/);
		assert.equal(patches(f).length, 0);
	});
}

for (const response of [{}, [], [null], [[null]], [[{ id: 0 }]]]) {
	test(`malformed paginated release response ${JSON.stringify(response)} fails closed`, t => {
		const f = fixture(t); f.state.faults = [{ endpoint: listEndpoint, count: 1, response }]; f.save();
		failed(f.run(), /Malformed|Missing/); assert.equal(patches(f).length, 0);
	});
}

test("missing/duplicate release, malformed assets and extra assets on a later page fail closed", t => {
	const f = fixture(t);
	for (const response of [[[]], [[f.state.release], [f.state.release]]]) {
		writeFileSync(f.ledger, ""); f.state.faults = [{ endpoint: listEndpoint, count: 1, response }]; f.save();
		failed(f.run(), /Missing|duplicate/);
	}
	for (const response of [{}, [null], [f.state.release.assets, [{ id: 999, name: "extra" }]]]) {
		writeFileSync(f.ledger, ""); f.state.faults = [{ endpoint: assetEndpoint, count: 1, response }]; f.save();
		failed(f.run(), /Malformed|asset/);
	}
	assert.equal(patches(f).length, 0);
});

test("local-vs-remote committed evidence and metadata mismatch fails", t => {
	const f = fixture(t);
	for (const target of [f.ref(), `${f.acceptance.review.commit}:${f.acceptance.review.path}`, `${f.metadataCommit}:manifest.json`, `${f.state.defaultCommit}:versions.json`]) {
		f.state.contentOverrides = { [target]: "remote bytes differ" }; f.save();
		failed(f.run(), /Local\/remote committed content mismatch/);
	}
	assert.equal(patches(f).length, 0);
});

test("metadata transition must itself descend from the tested candidate", t => {
	const f = fixture(t); f.acceptance.metadataCommit = f.base; f.record();
	failed(f.run(), /must be an ancestor/); assert.equal(patches(f).length, 0);
});

test("bad metadata transition cannot be hidden by later repaired default metadata", t => {
	const f = fixture(t);
	const original = readFileSync(join(f.repo, "manifest.json"));
	writeFileSync(join(f.repo, "manifest.json"), original.toString()+" "); const bad = f.commit();
	writeFileSync(join(f.repo, "manifest.json"), original); f.commit();
	f.acceptance.metadataCommit = bad; f.record();
	failed(f.run(), /metadata differs from candidate/); assert.equal(patches(f).length, 0);
});

for (const path of ["package.json", "package-lock.json", "manifest.json", "versions.json", "CHANGELOG.md"]) {
	test(`current default metadata ${path} must still match tested bytes`, t => {
		const f = fixture(t);
		writeFileSync(join(f.repo, path), readFileSync(join(f.repo, path)).toString()+" "); f.state.defaultCommit = f.commit(); f.save();
		failed(f.run(), /metadata differs from candidate/); assert.equal(patches(f).length, 0);
	});
}

test("default branch must contain evidence ancestry and unchanged pinned record", t => {
	const f = fixture(t);
	f.state.defaultCommit = f.metadataCommit; f.save(); failed(f.run(), /must be an ancestor/);
	writeFileSync(join(f.repo, "acceptance.json"), "{}\n"); f.state.defaultCommit = f.commit(); f.save();
	failed(f.run(), /superseded/); assert.equal(patches(f).length, 0);
});

test("local origin and local tag drift fail before mutation", t => {
	const f = fixture(t);
	f.git("remote", "set-url", "origin", "https://github.com/other/repo.git"); failed(f.run(), /origin must/);
	f.git("remote", "set-url", "origin", `https://github.com/gtg922r/obsidian-entities.git`);
	f.git("tag", "-f", "0.4.4", f.metadataCommit); failed(f.run(), /tag object/); assert.equal(patches(f).length, 0);
});

for (const [label, fault] of [
	["API list failure", () => ({ endpoint: listEndpoint, count: 1, error: true })],
	["late candidate status", f => ({ endpoint: listEndpoint, count: 2, change: { release: { ...f.state.release, prerelease: false } } })],
	["late body change", f => ({ endpoint: listEndpoint, count: 2, change: { release: { ...f.state.release, body: "changed" } } })],
	["late raw tag drift", () => ({ endpoint: listEndpoint, count: 2, change: { tagRefs: `${"a".repeat(40)}\trefs/tags/0.4.4\n` } })],
	["late default head drift", f => ({ endpoint: listEndpoint, count: 2, change: { defaultCommit: f.metadataCommit } })],
	["same-ID bytes drift", f => ({ endpoint: listEndpoint, count: 2, change: { downloads: { ...f.state.downloads, 100: Buffer.from("changed").toString("base64") } } })],
	["late higher stable", () => ({ endpoint: listEndpoint, count: 3, change: { stableReleases: [{ id: 50, tag_name: "0.4.5", draft: false, prerelease: false, published_at: "2026-09-02T00:00:00Z" }] } })],
	["asset timestamp race", f => ({ endpoint: listEndpoint, count: 3, change: { release: { ...f.state.release, assets: f.state.release.assets.map(a => ({ ...a, updated_at: "2026-09-02T00:00:00Z" })) } } })],
]) {
	test(`pre-PATCH rechecks reject ${label}`, t => {
		const f = fixture(t); f.state.faults = [fault(f)]; f.save();
		failed(runPromotion(f), /failure|mismatch|drift|changed|bytes|stable/); assert.equal(patches(f).length, 0);
	});
}

for (const mode of ["patchFailure", "latestFailure", "postcheck-bytes", "postcheck-tag", "postcheck-assets", "postcheck-body", "postcheck-latest-other", "postcheck-latest-body", "postcheck-latest-assets", "patch-response-body"]) {
	test(`uncertain mutation ${mode} is reported with exactly one PATCH and no retry`, t => {
		const f = fixture(t);
		if (mode === "patchFailure" || mode === "latestFailure") f.state[mode] = true;
		if (mode === "postcheck-bytes") f.state.faults = [{ endpoint: listEndpoint, count: 4, change: { downloads: { ...f.state.downloads, 100: Buffer.from("changed").toString("base64") } } }];
		if (mode === "postcheck-tag") f.state.faults = [{ endpoint: listEndpoint, count: 4, change: { tagRefs: `${"a".repeat(40)}\trefs/tags/0.4.4\n` } }];
		if (mode === "postcheck-assets") f.state.faults = [{ endpoint: assetEndpoint, count: 4, response: [[]] }];
		if (mode === "postcheck-body") f.state.faults = [{ endpoint: listEndpoint, count: 4, change: { release: { ...f.state.release, prerelease: false, body: "changed" } } }];
		if (mode === "postcheck-latest-other") f.state.faults = [{ endpoint: `${prefix}/releases/latest`, count: 1, response: { id: 999, tag_name: "0.4.5", draft: false, prerelease: false } }];
		if (mode === "patch-response-body") f.state.faults = [{ endpoint: `${prefix}/releases/42`, count: 4, mutation: true, response: { ...f.state.release, prerelease: false, body: "changed" } }];
		if (mode === "postcheck-latest-body") f.state.faults = [{ endpoint: `${prefix}/releases/latest`, count: 1, response: { ...f.state.release, prerelease: false, body: "changed" } }];
		if (mode === "postcheck-latest-assets") f.state.faults = [{ endpoint: `${prefix}/releases/latest`, count: 1, response: { ...f.state.release, prerelease: false, assets: f.state.release.assets.map(a => ({ ...a, id: a.id + 1000 })) } }];
		f.save();
		failed(runPromotion(f), /Promotion outcome uncertain/); assert.equal(patches(f).length, 1);
		if (mode === "patchFailure") {
			failed(runPromotion(f), /identity\/status\/body mismatch/);
			assert.equal(patches(f).length, 1);
		}
		assert.ok(!f.commands().some(c => c.args.includes("DELETE") || c.args.includes("POST") || c.args.includes("release")));
	});
}

test("real npm routing preserves explicit promotion arguments and publisher still rejects stable", t => {
	const f = fixture(t);
	const realNpm = join(process.execPath, "..", "npm");
	const result = spawnSync(realNpm, ["run", "release:promote", "--", "0.4.4", "--acceptance", f.ref(), "--dry-run"], { cwd: f.repo, env: f.env, encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /Dry run: verified candidate/);
	const publisher = spawnSync(process.execPath, [join(f.repo, "scripts/publish-release.mjs"), "0.4.4"], { cwd: f.repo, env: f.env, encoding: "utf8" });
	failed(publisher, /Explicit --prerelease is required/);
	assert.equal(patches(f).length, 0);
});

#!/usr/bin/env node
import { cli, REPOSITORY, run, validateRepository, validateToolchain, version } from "./release-utils.mjs";
import { acceptance, ancestor, api, candidate, refs, releaseState, remoteFile, unchanged, verifyDownloads, verifyMetadata } from "./promotion-utils.mjs";

cli(() => {
	const args = process.argv.slice(2);
	const dryRun = args.at(-1) === "--dry-run";
	if (dryRun) args.pop();
	if (args.length !== 3 || args[1] !== "--acceptance") throw new Error("Usage: promote-release.mjs <version> --acceptance <commit>:<path.json> [--dry-run]");
	const tag = version(args[0]);
	// Replacement refs cannot redefine the candidate or evidence ancestry for this process.
	process.env.GIT_NO_REPLACE_OBJECTS = "1";
	validateRepository();
	validateToolchain();
	const c = candidate(tag);
	const a = acceptance(args[2], c);
	const initialRefs = refs(c, a);
	ancestor(a.commit, initialRefs.head);
	verifyMetadata(initialRefs.head, c);
	if (!remoteFile(initialRefs.head, a.path).equals(a.bytes)) throw new Error("Pinned acceptance record has been superseded on the default branch.");
	const initial = releaseState(c, a);
	verifyDownloads(initial, c);
	const recheck = (stable = false, download = false) => {
		unchanged(refs(c, a), initialRefs, "Default branch/tag");
		const state = releaseState(c, a, stable);
		for (const field of ["identity", "assetSnapshot", "others", ...(!stable ? ["updatedAt"] : [])]) unchanged(state[field], initial[field], `Release ${field}`);
		if (download) verifyDownloads(state, c);
	};
	// Re-download to catch same-ID byte changes, then close the read window with fresh inventories/refs.
	recheck(false, true);
	recheck();
	if (dryRun) {
		process.stdout.write(`Dry run: verified candidate ${tag} (${c.commit}), acceptance ${args[2]}, default ${initialRefs.branch}@${initialRefs.head}, release ${a.record.releaseId} and every remote asset byte.\nPlanned only: one release-ID PATCH with prerelease=false and make_latest=true. No writes/builds/uploads/ref changes or promotion performed. Human acceptance remains the owner's responsibility.\n`);
		return;
	}
	try {
		const result = run("gh", ["api", "--hostname", "github.com", "--method", "PATCH", "--input", "-", `repos/${REPOSITORY}/releases/${a.record.releaseId}`], {
			input: JSON.stringify({ prerelease: false, make_latest: "true" }), stdio: ["pipe", "pipe", "pipe"],
		});
		const updated = JSON.parse(result);
		if (updated.id !== a.record.releaseId || updated.tag_name !== tag || updated.draft !== false || updated.prerelease !== false) throw new Error("Unexpected promotion response.");
		recheck(true, true);
		recheck(true);
		const latest = JSON.parse(api("releases/latest"));
		if (latest.id !== a.record.releaseId || latest.tag_name !== tag || latest.draft !== false || latest.prerelease !== false) throw new Error("Latest release does not identify the promoted candidate.");
		process.stdout.write(`Promoted ${tag} from ${c.commit}; preserved release ${a.record.releaseId}, tag object ${a.record.tagObject}, asset IDs and downloaded bytes. Verified latest and default ${initialRefs.branch}@${initialRefs.head}.\n`);
	} catch (error) {
		throw new Error(`Promotion outcome uncertain; PATCH may already have succeeded. Inspect release ${a.record.releaseId}, latest, assets and refs manually before any further action. No retry, rollback, asset replacement or deletion attempted.\n${error.message}`);
	}
});

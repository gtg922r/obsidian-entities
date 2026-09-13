import { SettingsStore } from "../src/SettingsStore";
import { claimSettingsHandoff } from "../src/settingsHandoff";

test("the app/plugin handoff survives a module reload", async () => {
	const app = {};
	let disk: unknown = { schemaVersion: 1, providerSettings: [{ providerTypeID: "test", providerInstanceId: "a", enabled: true, icon: "old" }] };
	let finish!: () => void;
	const previous = new SettingsStore(settings => new Promise<void>(done => {
		finish = () => { disk = settings; done(); };
	}), async () => {});
	claimSettingsHandoff(app, "entities", previous);
	await previous.load(async () => disk);
	previous.updateProvider("a", { icon: "pending" });
	await Promise.resolve();
	void previous.close();
	let reloadedClaim!: typeof claimSettingsHandoff;
	jest.isolateModules(() => {
		reloadedClaim = require("../src/settingsHandoff").claimSettingsHandoff;
	});
	const next = new SettingsStore(async settings => { disk = settings; }, async () => {});
	const wait = reloadedClaim(app, "entities", next);
	const read = jest.fn(async () => disk);
	const loading = next.load(async () => { await wait(); return read(); });
	await Promise.resolve();
	expect(read).not.toHaveBeenCalled();
	finish();
	expect(await loading).toBe(true);
	expect(next.settings.providerSettings[0].icon).toBe("pending");
	next.updateProvider("a", { icon: "newest" });
	await next.close();
	expect(disk).toMatchObject({ providerSettings: [{ icon: "newest" }] });
});

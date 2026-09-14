import { Plugin, TFile, TFolder } from "obsidian";
import { FolderEntityProvider } from "../../src/Providers/FolderEntityProvider";
import { DataviewEntityProvider } from "../../src/Providers/DataviewEntityProvider";
import { normalizeSettings } from "../../src/SettingsStore";

jest.mock("obsidian", () => ({ ...jest.requireActual("../__mocks__/obsidian") }));
jest.mock("../../src/userComponents", () => ({}));

const file = (path: string) => Object.assign(new TFile(), { path, basename: path.split("/").pop()!.replace(/\.[^.]+$/, "") });
const folder = (path: string, children: (TFile | TFolder)[]) => Object.assign(new TFolder(), { path, children });
const bob = file("People/Bob Hope.md"), nested = file("People/Sub/Deep/Child.md"), attachment = file("People/photo.png");
const peer = file("People Archive/Bob Hope.md"), rootFile = file("Root.md");
function harness(frontmatter: unknown) {
	const people = folder("People", [bob, attachment, folder("People/Sub", [folder("People/Sub/Deep", [nested])])]);
	const root = folder("/", [rootFile, people, folder("People Archive", [peer])]);
	const files = new Map([bob, nested, attachment, peer, rootFile].map(f => [f.path, f]));
	const folders = new Map([["People", people], ["/", root]]);
	const pages = jest.fn(() => ({ *[Symbol.iterator]() { yield { file: { path: bob.path, name: "Computed name", aliases: ["Computed alias"] } }; } }));
	const integrations: Record<string, unknown> = { dataview: { api: { pages } } };
	const plugin = { app: {
		vault: { getRoot: () => root, getFolderByPath: (path: string) => folders.get(path) ?? null, getAbstractFileByPath: (path: string) => files.get(path) ?? null },
		metadataCache: { getFileCache: (f: TFile) => f === bob ? { frontmatter } : null },
		plugins: { getPlugin: (id: string) => integrations[id] },
	} } as unknown as Plugin;
	return { plugin, folders, files, pages, integrations };
}
const types = [FolderEntityProvider, DataviewEntityProvider];

describe.each(types.map(Provider => [Provider.providerTypeID, Provider] as const))("%s file semantics", (_name, Provider) => {
	const source = (frontmatter: unknown, settings: Record<string, unknown> = {}) => {
		const h = harness(frontmatter);
		if (Provider === FolderEntityProvider) h.folders.set("People", folder("People", [bob]));
		const provider = new Provider(h.plugin, { providerInstanceId: "source", path: "People", ...settings });
		return { ...h, provider, results: () => provider.getEntityList("") };
	};
	test.each([true, false])("native toggle %p is independent of property aliases", enabled => {
		const r = source({ aliases: ["Bobby"], ldap: " hopeb@ " }, { shouldCreateEntitiesForAliases: enabled, propertyToCreateEntitiesFor: "ldap" });
		expect(r.results().map(r => r.suggestionText)).toEqual(["Bob Hope", ...(enabled ? ["Bobby"] : []), "hopeb@"]);
		expect(r.results().at(-1)!.target).toEqual({ kind: "file", file: bob, alias: "hopeb@" });
	});
	test.each([
		[{ Aliases: [" Native ", null, 42, false, ["nested"], {}, ""] }, ["Native"]],
		[{ ALIASES: "Ali, Bob" }, ["Ali, Bob"]],
		[{ alias: "singular" }, []],
		[{ aliases: 42 }, []],
		[{ aliases: null }, []],
		[{ aliases: { bad: true } }, []],
		[{ aliases: ["First", "First", "second"] }, ["First", "First", "second"]],
		[{ Aliases: "first", aliases: "second" }, ["first"]],
	])("native aliases use host parsing for %p", (frontmatter, expected) => {
		expect(source(frontmatter, { shouldCreateEntitiesForAliases: true }).results().map(r => r.suggestionText)).toEqual(["Bob Hope", ...expected]);
	});
	test.each([
		[" hopeb@ ", ["hopeb@"]], [[" 0 ", false, 42, ["nested"], "", " A, B ", "a  b"], ["0", "A, B", "a  b"]],
		[0, []], [false, []], [null, []], [{ nested: "no" }, []],
	])("custom strings remain narrow for %p", (ldap, aliases) => {
		expect(source({ ldap }, { propertyToCreateEntitiesFor: "ldap" }).results().map(r => r.suggestionText)).toEqual(["Bob Hope", ...aliases]);
	});
	test.each([undefined, "", null, 42, false, ["ldap"], { key: "ldap" }, "LDAP", " ldap", "constructor", "toString"])("selector %p cannot coerce or inherit", selector => {
		const r = source({ aliases: "Native", ldap: "hopeb@" }, { shouldCreateEntitiesForAliases: true, propertyToCreateEntitiesFor: selector });
		expect(r.results().map(r => r.suggestionText)).toEqual(["Bob Hope", "Native"]);
	});
	test("dotted own keys are literal; inherited metadata never supplies aliases", () => {
		expect(source({ "a.b": "literal", a: { b: "nested" } }, { propertyToCreateEntitiesFor: "a.b" }).results().map(r => r.suggestionText)).toEqual(["Bob Hope", "literal"]);
		expect(source(Object.create({ aliases: "Inherited", ldap: "Inherited" }), { shouldCreateEntitiesForAliases: true, propertyToCreateEntitiesFor: "ldap" }).results().map(r => r.suggestionText)).toEqual(["Bob Hope"]);
	});
	test.each([
		[undefined, ".*", false], [null, ".*", false], [false, "^false$", true], [true, "^true$", true], [0, "^0$", true],
		[2, "^2$", true], ["", "^$", true], [" Active ", "^ Active $", true], ["ACTIVE", "^active$", true],
		[[], ".*", false], [["active", "pending"], "^active$", true], [["active", "pending"], "active,pending", false],
		[[null, {}, ["nested"], 0, false, "active"], "^false$", true], [[["active"]], "active", false],
		[{}, "Object", false], [Infinity, ".*", false],
	])("include/exclude are complements for value %p and regex %s", (value, pattern, matches) => {
		for (const type of ["include", "exclude"]) {
			const r = source({ value, ldap: "hopeb@" }, { propertyToCreateEntitiesFor: "ldap", entityFilters: [{ type, property: "value", value: pattern }] });
			expect(r.results().map(r => r.suggestionText)).toEqual((type === "include" ? matches : !matches) ? ["Bob Hope", "hopeb@"] : []);
		}
	});
	test.each([undefined, null, "invalid", 42, [], Object.create({ value: "inherited" })])("missing/malformed frontmatter %p passes excludes", frontmatter => {
		expect(source(frontmatter, { entityFilters: [{ type: "exclude", property: "value", value: ".*" }] }).results()).toHaveLength(1);
	});
	test.each(["include", "exclude"])("invalid active %s fails closed, inactive rows pass", type => {
		expect(source({ value: "yes" }, { entityFilters: [{ type, property: "value", value: "[" }] }).results()).toEqual([]);
		for (const filter of [{ type, property: "", value: "[" }, { type, property: "value", value: "" }]) {
			expect(source(undefined, { entityFilters: [filter] }).results()).toHaveLength(1);
		}
	});
	test.each([null, {}, "bad", [null], [{ type: "other", property: "p", value: "a" }], [{ type: "include", property: "p", value: 1 }]])("malformed filters %p fail defensively", entityFilters => {
		expect(source({ value: "yes" }, { entityFilters }).results()).toEqual([]);
	});
	test("AND composition and whitespace regex preserve exact constraints", () => {
		const filters = [{ type: "include", property: "status", value: "^active$" }, { type: "exclude", property: "blocked", value: "^true$" }, { type: "include", property: "space", value: " " }];
		expect(source({ status: ["pending", "active"], blocked: false, space: " " }, { entityFilters: filters }).results()).toHaveLength(1);
		expect(source({ status: "active", blocked: true, space: " " }, { entityFilters: filters }).results()).toEqual([]);
	});
	test("legacy selector values/defaults remain loadable without a schema migration", () => {
		for (const selector of [null, 42, false, ["ldap"]]) {
			const result = normalizeSettings({ providerSettings: [{ providerTypeID: Provider.providerTypeID, propertyToCreateEntitiesFor: selector, shouldCreateEntitiesForAliases: false }] }, () => Provider.getDefaultSettings(), () => "id");
			if (!result.ok) throw result.error;
			expect(result.settings.providerSettings[0]).toMatchObject({ propertyToCreateEntitiesFor: selector, shouldCreateEntitiesForAliases: false });
		}
		expect((Provider.getDefaultSettings() as { propertyToCreateEntitiesFor?: string }).propertyToCreateEntitiesFor).toBeUndefined();
	});
});

test("Folder traverses real descendants, root and all TFiles without prefix siblings", () => {
	const h = harness(null);
	const paths = (path: string, recursive: boolean) => new FolderEntityProvider(h.plugin, { providerInstanceId: "folder", path, shouldLoadSubFolders: recursive }).getEntityList("").map(r => r.target.kind === "file" && r.target.file.path);
	expect(paths("People", false)).toEqual([bob.path, attachment.path]);
	expect(paths("People", true)).toEqual([bob.path, attachment.path, nested.path]);
	expect(paths("", false)).toEqual([rootFile.path]);
	expect(paths("/", false)).toEqual([rootFile.path]);
	expect(paths(" ", false)).toEqual([]);
	expect(paths("", true)).toEqual([rootFile.path, bob.path, attachment.path, nested.path, peer.path]);
	expect(paths("Missing", true)).toEqual([]);
	h.folders.get("People")!.children = [peer];
	expect(paths("People", true)).toEqual([peer.path]);
});

test("Dataview resolves iterable pages once, skips malformed neighbors and uses cached real files", () => {
	const h = harness({ ldap: "hopeb@" });
	h.pages.mockReturnValue({ *[Symbol.iterator]() { yield null; yield {}; yield { file: null }; yield { file: { path: "Missing.md" } }; yield { file: { path: bob.path } }; yield { file: { path: bob.path } }; } } as ReturnType<typeof h.pages>);
	const provider = new DataviewEntityProvider(h.plugin, { ...{ providerInstanceId: "dv", propertyToCreateEntitiesFor: "ldap" } });
	expect(provider.getEntityList("").map(r => r.suggestionText)).toEqual(["Bob Hope", "hopeb@"]);
	expect(h.pages).toHaveBeenCalledTimes(1);
	h.pages.mockImplementation(() => { throw new Error("Invalid source"); });
	expect(provider.getEntityList("")).toEqual([]);
	delete h.integrations.dataview;
	expect(provider.getEntityList("")).toEqual([]);
});

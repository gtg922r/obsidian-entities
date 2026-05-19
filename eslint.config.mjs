import js from "@eslint/js";
import globals from "globals";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

const sourceFiles = ["src/**/*.{ts,tsx}"];
const testFiles = ["tests/**/*.{ts,tsx}"];
const scriptFiles = [
	"*.config.js",
	"*.config.mjs",
	"eslint.config.mjs",
	"esbuild.config.mjs",
	"jest.config.js",
	"version-bump.mjs",
	"scripts/**/*.{js,mjs,ts}",
];

const obsidianCompatibilityRules = {
	"obsidianmd/commands/no-command-in-command-id": "error",
	"obsidianmd/commands/no-command-in-command-name": "error",
	"obsidianmd/commands/no-default-hotkeys": "error",
	"obsidianmd/commands/no-plugin-id-in-command-id": "error",
	"obsidianmd/commands/no-plugin-name-in-command-name": "error",
	"obsidianmd/detach-leaves": "error",
	"obsidianmd/editor-drop-paste": "error",
	"obsidianmd/hardcoded-config-path": "error",
	"obsidianmd/no-forbidden-elements": "error",
	"obsidianmd/no-global-this": "error",
	"obsidianmd/no-sample-code": "error",
	"obsidianmd/no-tfile-tfolder-cast": "error",
	"obsidianmd/object-assign": "error",
	"obsidianmd/platform": "error",
	"obsidianmd/prefer-get-language": "error",
	"obsidianmd/regex-lookbehind": "error",
	"obsidianmd/sample-names": "error",
	"obsidianmd/vault/iterate": "error",
};

const obsidianAdvisoryRules = {
	"obsidianmd/no-static-styles-assignment": "error",
	"obsidianmd/prefer-abstract-input-suggest": "error",
	"obsidianmd/prefer-active-doc": "warn",
	"obsidianmd/prefer-window-timers": "error",
	"obsidianmd/settings-tab/no-manual-html-headings": "error",
	"obsidianmd/settings-tab/no-problematic-settings-headings": "error",
	"obsidianmd/ui/sentence-case": "error",
};

export default tseslint.config(
	{
		ignores: [
			"node_modules/",
			".agents/",
			"main.js",
			"dist/",
			"coverage/",
			"docs/",
			"entities/",
			"entities.zip",
			"*.zip",
			"*.tgz",
			"*.tar.gz",
			"package-lock.json",
		],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: [...sourceFiles, ...testFiles, ...scriptFiles],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				sourceType: "module",
			},
		},
		rules: {
			"no-empty": "warn",
			"no-unused-vars": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unused-vars": ["warn", { args: "none" }],
			"@typescript-eslint/ban-ts-comment": "off",
			"@typescript-eslint/no-empty-function": "off",
			"@typescript-eslint/no-require-imports": "off",
		},
	},
	{
		files: sourceFiles,
		plugins: {
			obsidianmd,
		},
		languageOptions: {
			globals: {
				...globals.browser,
				DomElementInfo: "readonly",
				SvgElementInfo: "readonly",
				activeDocument: "readonly",
				activeWindow: "readonly",
				ajax: "readonly",
				ajaxPromise: "readonly",
				createDiv: "readonly",
				createEl: "readonly",
				createFragment: "readonly",
				createSpan: "readonly",
				createSvg: "readonly",
				fish: "readonly",
				fishAll: "readonly",
				isBoolean: "readonly",
				nextFrame: "readonly",
				ready: "readonly",
				sleep: "readonly",
			},
		},
		rules: {
			...obsidianCompatibilityRules,
			...obsidianAdvisoryRules,
		},
	},
	{
		files: testFiles,
		languageOptions: {
			globals: {
				...globals.jest,
				...globals.node,
			},
		},
	},
	{
		files: scriptFiles,
		languageOptions: {
			globals: globals.node,
		},
		rules: {
			"no-useless-escape": "off",
		},
	}
);

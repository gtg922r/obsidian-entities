import { App, Editor, EditorSuggestContext, Plugin } from "obsidian";
import { HelperEntityProvider } from "../../src/Providers/HelperActionsProvider";
import { TriggerCharacter } from "../../src/entities.types";

jest.mock("src/userComponents", () => ({
    IconPickerModal: jest.fn(),
}), { virtual: true });

jest.mock("src/entities.types", () => ({
    TriggerCharacter: { Slash: "/" }
}), { virtual: true });

jest.mock("obsidian", () => {
    return {
        Plugin: class {
            app: App;
            constructor(app: App) {
                this.app = app;
            }
        }
    };
});

const mockPlugin = { app: {} } as unknown as Plugin;

describe("HelperEntityProvider callout suggestions", () => {
    test("getEntityList includes callout suggestion", () => {
        const provider = new HelperEntityProvider(mockPlugin, {});
        const list = provider.getEntityList("quo", TriggerCharacter.Slash);
        const hasQuote = list.some(i => i.suggestionText === "Callout: Quote");
        expect(hasQuote).toBe(true);
    });

    test("callout action inserts template", () => {
        const provider = new HelperEntityProvider(mockPlugin, {});
        const suggestions = provider.getEntityList("quo", TriggerCharacter.Slash);
        const item = suggestions.find(i => i.suggestionText === "Callout: Quote")!;

        const mockEditor = {
            replaceRange: jest.fn(),
            getLine: jest.fn().mockReturnValue("this is a quote"),
            getRange: jest.fn().mockReturnValue("this is a quote"),
            setCursor: jest.fn(),
        } as unknown as jest.Mocked<Editor>;

        const context = {
            editor: mockEditor,
            start: { line: 0, ch: 16 },
            end: { line: 0, ch: 19 },
            query: "/quo",
        } as unknown as EditorSuggestContext;

        item.action!(item, context);

        expect(mockEditor.replaceRange).toHaveBeenNthCalledWith(1, "", { line: 0, ch: 15 }, { line: 0, ch: 19 });
        expect(mockEditor.replaceRange).toHaveBeenNthCalledWith(2, "> [!quote]\n> this is a quote", { line: 0, ch: 0 }, { line: 0, ch: mockEditor.getLine(0).length });
        expect(mockEditor.setCursor).toHaveBeenCalledWith({ line: 1, ch: 17 });
    });
});

describe("HelperEntityProvider icons", () => {
    test("checkbox suggestions use checkboxIcon", () => {
        const provider = new HelperEntityProvider(mockPlugin, { 
            checkboxIcon: "test-checkbox-icon",
            calloutIcon: "test-callout-icon"
        });
        const list = provider.getEntityList("done", TriggerCharacter.Slash);
        const checkboxSuggestion = list.find(i => i.suggestionText === "Checkbox: Done");
        expect(checkboxSuggestion?.icon).toBe("test-checkbox-icon");
    });

    test("callout suggestions use calloutIcon", () => {
        const provider = new HelperEntityProvider(mockPlugin, { 
            checkboxIcon: "test-checkbox-icon",
            calloutIcon: "test-callout-icon"
        });
        const list = provider.getEntityList("note", TriggerCharacter.Slash);
        const calloutSuggestion = list.find(i => i.suggestionText === "Callout: Note");
        expect(calloutSuggestion?.icon).toBe("test-callout-icon");
    });

    test("uses default icons when not specified", () => {
        const provider = new HelperEntityProvider(mockPlugin, {});
        const list = provider.getEntityList("done", TriggerCharacter.Slash);
        
        const checkboxSuggestion = list.find(i => i.suggestionText === "Checkbox: Done");
        expect(checkboxSuggestion?.icon).toBe("square-asterisk");
        
        const calloutSuggestion = list.find(i => i.suggestionText === "Callout: Note");
        expect(calloutSuggestion?.icon).toBe("square-chevron-right");
    });
});

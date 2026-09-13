import { actionContext, getAction } from "../suggestionTestHelpers";
import { App, Plugin } from "obsidian";
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
        const provider = new HelperEntityProvider(mockPlugin, { providerInstanceId: "test-instance" });
        const list = provider.getEntityList("quo", TriggerCharacter.Slash);
        const hasQuote = list.some(i => i.suggestionText === "Callout: Quote");
        expect(hasQuote).toBe(true);
    });

    test("callout action inserts template", () => {
        const provider = new HelperEntityProvider(mockPlugin, { providerInstanceId: "test-instance" });
        const suggestions = provider.getEntityList("quo", TriggerCharacter.Slash);
        const item = suggestions.find(i => i.suggestionText === "Callout: Quote")!;

        const context = actionContext(undefined, "this is a quote/quo", "/quo");
        expect(getAction(item)!(context)).toEqual({ status: "edit", edit: {
            from: 0, to: 19, text: "> [!quote]\n> this is a quote", cursor: 28,
        } });
    });
});

describe("HelperEntityProvider icons", () => {
    test("checkbox suggestions use checkboxIcon", () => {
        const provider = new HelperEntityProvider(mockPlugin, {
            providerInstanceId: "test-instance",
            checkboxIcon: "test-checkbox-icon",
            calloutIcon: "test-callout-icon"
        });
        const list = provider.getEntityList("done", TriggerCharacter.Slash);
        const checkboxSuggestion = list.find(i => i.suggestionText === "Checkbox: Done");
        expect(checkboxSuggestion?.icon).toBe("test-checkbox-icon");
    });

    test("callout suggestions use calloutIcon", () => {
        const provider = new HelperEntityProvider(mockPlugin, {
            providerInstanceId: "test-instance",
            checkboxIcon: "test-checkbox-icon",
            calloutIcon: "test-callout-icon"
        });
        const list = provider.getEntityList("note", TriggerCharacter.Slash);
        const calloutSuggestion = list.find(i => i.suggestionText === "Callout: Note");
        expect(calloutSuggestion?.icon).toBe("test-callout-icon");
    });

    test("uses default icons when not specified", () => {
        const provider = new HelperEntityProvider(mockPlugin, { providerInstanceId: "test-instance" });
        const list = provider.getEntityList("done", TriggerCharacter.Slash);
        
        const checkboxSuggestion = list.find(i => i.suggestionText === "Checkbox: Done");
        expect(checkboxSuggestion?.icon).toBe("square-asterisk");
        
        const calloutSuggestion = list.find(i => i.suggestionText === "Callout: Note");
        expect(calloutSuggestion?.icon).toBe("square-chevron-right");
    });
});

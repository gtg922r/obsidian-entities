import { TFile, Plugin } from "obsidian";
import { AppWithPlugins } from "src/entities.types";
import { TemplaterPlugin } from "src/entities.types";

// New function to get the Templater plugin
function getTemplaterPlugin(plugin: Plugin): TemplaterPlugin | null {
    const templaterPlugin = (plugin.app as AppWithPlugins).plugins?.getPlugin(
        "templater-obsidian"
    ) as TemplaterPlugin;
    if (!templaterPlugin || !templaterPlugin.templater?.append_template_to_active_file) {
        console.error("Templater plugin not found!");
        return null;
    }
    return templaterPlugin;
}

export function insertTemplateUsingTemplater(plugin: Plugin, template: TFile): Promise<void> {
    const templaterPlugin = getTemplaterPlugin(plugin);
	if (
		!templaterPlugin ||
		!templaterPlugin.templater?.append_template_to_active_file
	) {
		console.error("Templater plugin not found!");
		return Promise.reject("Templater plugin not found!");
	}
    return templaterPlugin.templater.append_template_to_active_file(template);
}
export function createNewNoteFromTemplate(plugin: Plugin, template: TFile | string, folderSetting: string, newTemplateName: string, openNewNote: boolean): void {
    const templaterPlugin = getTemplaterPlugin(plugin);
    if (!templaterPlugin || !templaterPlugin.templater?.create_new_note_from_template) {
        console.error("Templater plugin not found!");
        return;
    }
    templaterPlugin.templater.create_new_note_from_template(template, folderSetting, newTemplateName, openNewNote);
}

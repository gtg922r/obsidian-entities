import { TFile, Plugin, TFolder } from "obsidian";
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
export async function createNewNoteFromTemplate(
    plugin: Plugin,
    template: TFile | string,
    folder: TFolder | string,
    newTemplateName: string,
    openNewNote: boolean
): Promise<TFile | undefined> {
    const templaterPlugin = getTemplaterPlugin(plugin);
    if (typeof template === 'string') {
        const templateFile = plugin.app.vault.getAbstractFileByPath(template);
        if (templateFile instanceof TFile) {
            template = templateFile;
        } else {
            console.error(`Template file: "${template}" not found or is not a valid TFile.`);
            return;
        }
    }

    let targetFolder: TFolder;
    if (typeof folder === "string") {
        if (folder === "") {
            targetFolder = plugin.app.vault.getRoot();
        } else {
            const folderFile = plugin.app.vault.getAbstractFileByPath(folder);
            if (folderFile instanceof TFolder) {
                targetFolder = folderFile;
            } else {
                console.error(`Folder: "${folder}" not found or is not a valid TFolder.`);
                return;
            }
        }
    } else {
        targetFolder = folder;
    }

    if (!templaterPlugin || !templaterPlugin.templater?.create_new_note_from_template) {
        console.error("Templater plugin not found!");
        return;
    }
    return templaterPlugin.templater.create_new_note_from_template(
        template,
        targetFolder,
        newTemplateName,
        openNewNote
    );
}

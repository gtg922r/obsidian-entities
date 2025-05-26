# TODOs

## Feature Requests & Architecture

- [ ] Make `newNoteTemplate` field settable in plugin settings. *(src/Providers/MetadataMenuProvider.ts)*
- [ ] Add support for both Template and Templater plugins when creating notes. *(src/Providers/MetadataMenuProvider.ts)*
- [ ] Add support for multiple template paths, including subfolders, and watch for new files. *(src/Providers/TemplateProvider.ts)*
- [ ] Detect Metadata Menu and Templater plugins in settings builder. *(src/Providers/MetadataMenuProvider.ts)*
- [ ] Allow providers to declare multiple trigger types with suggestion caching. *(src/EntitiesSuggestor.ts)*

## File‑Specific TODOs

### src/Providers/ProviderRegistry.ts
- Clarify generic type usage around `ProviderClass<EntityProviderUserSettings>`.

### src/Providers/HelperActionsProvider.ts
- Remove the `-2` offset hack used to account for the space between a checkbox and its text.

### src/Providers/MetadataMenuProvider.ts
- Decide on folder path when calling `createNewNoteFromTemplate` (marked `TODO THINK ABOUT FOLDER`).

### src/Providers/EntityProvider.ts
- Replace placeholder `"TODO FIX FOLDER"` with an actual destination folder.

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
### Fixed
- Github Actions not releasing correctly
- Github releases set as pre-release by default

### Changed
### Deprecated
### Removed
### Security

## [0.4.0] - 2025-08-31

### Added
- Automated release workflows

## [0.3.9] - 2025-08-30

### Added
- Agents Guide for provider authors and contributors.

### Changed
- Suggestor: prioritize `@` over `/` and `:`; support multi‑word `@` queries; tokenize `:` and `/` at token start.

## [0.3.8] - 2025-07-29

### Added
- Optional template folder path for new notes created from templates.

### Changed
- Emoji suggestions now require a non‑space character after `:` to trigger.

## [0.3.7] - 2025-06-18

### Added
- Distinct icons for Helper provider functions (checkboxes vs. callouts).

## [0.3.6] - 2025-06-18

### Added
- Callouts helper action in Helper provider.

## [0.3.5] - 2025-05-19

### Fixed
- Cursor placement after multiline insertion.
- Handle empty capture groups in `onTrigger`.

### Changed
- Expanded provider registry documentation.

## [0.3.4] - 2025-08-28

### Added
- Autocomplete for property names when configuring entity property filters.

## [0.3.3] - 2025-08-25

### Added
- Entity filtering based on frontmatter property values (Dataview and Folder providers).

### Fixed
- Validation and robustness improvements for property filter regex; case‑insensitive matching.

## [0.3.2] - 2025-08-05

### Added
- Option to include a `created` tag for the checkbox helper utility.

### Changed
- Improved trigger and query logic: only the last trigger in a line is considered; better suggestor cancel handling via Esc.

## [0.3.1] - 2025-08-03

### Added
- Entity counts in settings for Dataview and Folder providers.
- Option to choose which trigger the Template provider uses.

### Changed
- Refresh behavior tweaks for more responsive suggestions.

## [0.3.0] - 2025-08-01

### Added
- Support for multiple triggers: `/` for actions and `:` for symbols alongside `@` for entities.

### Changed
- Query parsing includes trigger context; tests and provider interfaces updated accordingly.

## [0.2.13] - 2024-07-24

### Added
- All free Font Awesome icons in the Character provider.

## [0.2.12] - 2024-07-23

### Added
- Character provider with Emoji support.

### Fixed
- Checkbox helper created‑metadata behavior.

## [0.2.11] - 2024-07-23

### Added
- Checkbox helper now adds or updates a `created` tag.

## [0.2.10] - 2024-07-21

### Fixed
- Checkbox helper works on lines that start with bullets.

## [0.2.9] - 2024-07-21

### Added
- Helper Actions provider with a checkbox utility for Minimal theme checkboxes.

## [0.2.8] - 2024-07-14

### Added
- Week suggestions and a week option in Date provider.

### Fixed
- Minor bugs and linter issues.

## [0.2.7] - 2024-07-14

### Added
- Week suggestions (including semantic weeks such as “this week”) and week‑number support in Date provider.

## [0.2.6] - 2024-06-22

### Added
- `newEntityIcon` support in Metadata Menu provider for new files from templates (falls back to fileClass icon).

## [0.2.5] - 2024-06-20

### Fixed
- File‑class template handling when a template note is defined.

## [0.2.4] - 2024-06-19

### Changed
- Metadata Menu provider loads templates from `fileClass` (e.g., `newNoteTemplate`).

## [0.2.3] - 2024-06-19

### Added
- First implementation of Metadata Menu provider.
- Summary config for providers.

### Changed
- More efficient dataview query suggestions; remove duplicate results across providers based on insertion text.

## [0.2.2] - 2024-05-24

### Fixed
- New provider creation bug.

## [0.2.1] - 2024-05-24

### Added
- Provider registry and related settings.

### Fixed
- Mock provider issues.

## [0.2.0] - 2024-05-24

### Changed
- Plugin architecture re‑write: introduce base `EntityProvider` class, provider registry, and standardized settings UI; broad internal refactors with tests.

## [0.1.9] - 2024-04-16

### Added
- Alias support in Dataview provider.

## [0.1.8] - 2024-04-13

### Added
- Lucide icon fuzzy search modal and settings.
- Folder/file suggests in provider settings.

## [0.1.7] - 2024-04-09

### Fixed
- Alias links insert correctly.

## [0.1.6] - 2024-04-08

### Added
- Alias support in Folder provider.
- Initial popover support.

### Fixed
- Settings update bug.

## [0.1.5] - 2024-03-29

### Added
- Icon setting for providers.

### Changed
- Settings improvements and fixes.

### Fixed
- Major bugs and duplicate template entries.

## [0.1.4] - 2024-03-28

### Added
- Create new entities from a template based on the current query (Dataview and Folder providers).

## [0.1.3] - 2024-03-14

### Changed
- Entity suggestion search uses fuzzy matching; font defaults tweaked.

## [0.1.2] - 2024-03-13

### Changed
- Initial version metadata and setup updates.

## [0.1.1] - 2024-03-13

### Added
- Initial build configuration and packaging.

## [0.1.0] - 2024-03-13

### Added
- Initial suggestor prototype, providers (Dataview, NLDates), and test infrastructure.

[0.3.9]: https://github.com/gtg922r/obsidian-entities/compare/0.3.8...0.3.9
[0.3.8]: https://github.com/gtg922r/obsidian-entities/compare/0.3.7...0.3.8
[0.3.7]: https://github.com/gtg922r/obsidian-entities/compare/0.3.6...0.3.7
[0.3.6]: https://github.com/gtg922r/obsidian-entities/compare/0.3.5...0.3.6
[0.3.5]: https://github.com/gtg922r/obsidian-entities/compare/0.3.4...0.3.5
[0.3.4]: https://github.com/gtg922r/obsidian-entities/compare/0.3.3...0.3.4
[0.3.3]: https://github.com/gtg922r/obsidian-entities/compare/0.3.2...0.3.3
[0.3.2]: https://github.com/gtg922r/obsidian-entities/compare/0.3.1...0.3.2
[0.3.1]: https://github.com/gtg922r/obsidian-entities/compare/0.3.0...0.3.1
[0.3.0]: https://github.com/gtg922r/obsidian-entities/compare/0.2.13...0.3.0
[0.2.13]: https://github.com/gtg922r/obsidian-entities/compare/0.2.12...0.2.13
[0.2.12]: https://github.com/gtg922r/obsidian-entities/compare/0.2.11...0.2.12
[0.2.11]: https://github.com/gtg922r/obsidian-entities/compare/0.2.10...0.2.11
[0.2.10]: https://github.com/gtg922r/obsidian-entities/compare/0.2.9...0.2.10
[0.2.9]: https://github.com/gtg922r/obsidian-entities/compare/0.2.8...0.2.9
[0.2.8]: https://github.com/gtg922r/obsidian-entities/compare/0.2.7...0.2.8
[0.2.7]: https://github.com/gtg922r/obsidian-entities/compare/0.2.6...0.2.7
[0.2.6]: https://github.com/gtg922r/obsidian-entities/compare/0.2.5...0.2.6
[0.2.5]: https://github.com/gtg922r/obsidian-entities/compare/0.2.4...0.2.5
[0.2.4]: https://github.com/gtg922r/obsidian-entities/compare/0.2.3...0.2.4
[0.2.3]: https://github.com/gtg922r/obsidian-entities/compare/0.2.2...0.2.3
[0.2.2]: https://github.com/gtg922r/obsidian-entities/compare/0.2.1...0.2.2
[0.2.1]: https://github.com/gtg922r/obsidian-entities/compare/0.2.0...0.2.1
[0.2.0]: https://github.com/gtg922r/obsidian-entities/compare/0.1.9...0.2.0
[0.1.9]: https://github.com/gtg922r/obsidian-entities/compare/0.1.8...0.1.9
[0.1.8]: https://github.com/gtg922r/obsidian-entities/compare/0.1.7...0.1.8
[0.1.7]: https://github.com/gtg922r/obsidian-entities/compare/0.1.6...0.1.7
[0.1.6]: https://github.com/gtg922r/obsidian-entities/compare/0.1.5...0.1.6
[0.1.5]: https://github.com/gtg922r/obsidian-entities/compare/0.1.4...0.1.5
[0.1.4]: https://github.com/gtg922r/obsidian-entities/compare/0.1.3...0.1.4
[0.1.3]: https://github.com/gtg922r/obsidian-entities/compare/0.1.2...0.1.3
[0.1.2]: https://github.com/gtg922r/obsidian-entities/compare/0.1.1...0.1.2
[0.1.1]: https://github.com/gtg922r/obsidian-entities/compare/0.1.0...0.1.1
[0.1.0]: https://github.com/gtg922r/obsidian-entities/tree/0.1.0

[Unreleased]: https://github.com/gtg922r/obsidian-entities/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/gtg922r/obsidian-entities/compare/v0.3.9...v0.4.0

# Entities

<p align="center">
<img src="https://img.shields.io/github/v/release/gtg922r/obsidian-entities?label=Release">
<img src="https://github.com/gtg922r/obsidian-entities/actions/workflows/release.yml/badge.svg">
<img src="https://img.shields.io/github/license/gtg922r/obsidian-entities">
</p>

> [!IMPORTANT]
> This plugin is in very early development and is not intended for public usage.
> Note that at this time, all rights are reserved.

**Entities** is an advanced autocomplete plugin for [Obsidian](https://obsidian.md) that provides context-aware suggestions for notes, templates and helper actions.

<p align="center">
  <img width="700" src="https://raw.githubusercontent.com/gtg922r/obsidian-entities/refs/heads/master/.github/entities-screenshot.png">
</p>

## Features

- ✨ Autocomplete triggered by `@`, `:` or `/`
- 📦 Multiple pluggable providers
- 🤝 Works with popular Obsidian plugins
- 🎛 Customizable provider settings
- 📱 Desktop and mobile support

## Entity Providers

Each provider offers suggestions from a different source or performs actions:

- 📁 **Folder** – notes from a specific folder
- 📊 **Dataview** – results from a Dataview query
- 📄 **Template** – create or insert using template files
- 📅 **Date** – natural language date completion (requires Natural Language Dates)
- 🗂️ **Metadata Menu** – create notes from Metadata Menu file class templates
- ⚡ **Helper Actions** – quick checkboxes and utilities triggered by `/`
- 😀 **Character** – emoji and Font Awesome look‑ups triggered by `:`

See [ARCHITECTURE.md](ARCHITECTURE.md) for implementation details.

## Installation

1. Download the latest release from the [Releases page](https://github.com/gtg922r/obsidian-entities/releases).
2. Extract the folder into your `.obsidian/plugins/` directory.
3. Enable **Entities** in Obsidian’s *Community Plugins* settings.

To build from source:

```bash
npm install
npm run build
```

## Usage

Open **Settings → Entities** to add providers and configure their options. Start typing `@`, `:` or `/` to see the autocomplete menu.

## Development

Run tests with:

```bash
npm test
```

Contributions are welcome via pull requests.

## License

Released under the MIT License.

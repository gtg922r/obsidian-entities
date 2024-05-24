# Obsidian Entities Plugin

> [!IMPORTANT]
> This plugin is in very early development and is not intended for public usage.
> Note that at this time, all rights are reserved.

## Overview

The Obsidian Entities Plugin enhances your Obsidian experience by adding autocomplete functionality for "Entities" such as files, templates, and more. It supports various providers like folders, templates, and Dataview queries.

For example, perhaps you have a folder called "People". Entities allows you trigger autocomplete of all your "People" notes, once you type "@". 

## Features

- Autocomplete for entities from specified folders.
- Integration with Dataview for dynamic entity suggestions.
- Template-based entity creation and insertion.
- Customizable settings for each provider.

## Installation

1. Download the latest release from the [Releases](https://github.com/gtg922r/obsidian-entities/releases) page.
2. Extract the contents into your Obsidian plugins folder.
3. Enable the plugin from the Obsidian settings.

## Usage

### Adding a New Provider

1. Go to the plugin settings.
2. Click on "Add New Provider".
3. Select the provider type and configure its settings.

### Reloading Providers

For debugging purposes, you can manually reload all entity providers from the settings.

## Development

### Building the Plugin

To build the plugin, run the following commands:

```bash
npm install
npm run build
```

### Running Tests

To run the tests, use:

```bash
npm test
```

## Contributing

Contributions are welcome! Please fork the repository and submit a pull request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Contact

Author: RyanC  
GitHub: [gtg922r](https://github.com/gtg922r)
```

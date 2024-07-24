// Define the interface for the SVG data
interface SVGData {
	last_modified: number;
	raw: string;
	viewBox: [number, number, number, number];
	width: number;
	height: number;
	path: string;
}

// Define the interface for the SVG object with different styles
interface SVG {
	[style: string]: SVGData;
}

// Define the interface for the search terms
interface Search {
	terms: string[];
}

// Define the interface for each dictionary entry
interface DictionaryItem {
	changes: string[];
	ligatures: string[];
	search: Search;
	styles: string[];
	unicode: string;
	label: string;
	voted: boolean;
	svg: SVG;
	free: string[];
}

// Define the interface for the dictionary itself
export type Dictionary = { [key: string]: DictionaryItem };

// eslint-disable-next-line @typescript-eslint/no-var-requires
const faLibrary = require("./icons.json") as Dictionary;

// Create a dictionary mapping Unicode values to their corresponding characters
const unicodeToCharDictionary: { [key: string]: string } = {};

for (const [key, value] of Object.entries(faLibrary)) {
    if (value.unicode) {
        // Convert the Unicode string to a character
        const char = String.fromCodePoint(parseInt(value.unicode, 16));
        unicodeToCharDictionary[key] = char;
    }
}

// console.log(unicodeToCharDictionary);

// Import necessary types
interface CharacterEntry {
	char: string;
	name: string;
}

interface CharacterKeywordDictionary {
	[key: string]: CharacterEntry[];
}

// Create a CharacterKeywordDictionary for Font Awesome icons
const fontAwesomeDictionary: CharacterKeywordDictionary = {};

for (const [iconName, iconData] of Object.entries(faLibrary)) {
    if (iconData.unicode && iconData.free && iconData.free.length > 0) {
        const char = String.fromCodePoint(parseInt(iconData.unicode, 16));
        const entry: CharacterEntry = { char, name: iconName };

        // Add the icon name itself as a search term
        if (!fontAwesomeDictionary[iconName]) {
            fontAwesomeDictionary[iconName] = [entry];
        } else {
            fontAwesomeDictionary[iconName].push(entry);
        }

        // Add all search terms if they exist
        if (iconData.search && iconData.search.terms) {
            for (const term of iconData.search.terms) {
                if (!fontAwesomeDictionary[term]) {
                    fontAwesomeDictionary[term] = [entry];
                } else {
                    fontAwesomeDictionary[term].push(entry);
                }
            }
        }
    }
}

console.log(`Loaded ${Object.keys(fontAwesomeDictionary).length} icons`);

// Export the dictionary to a JSON file
import * as fs from 'fs';
import * as path from 'path';

const outputPath = path.join(__dirname, '..', 'scripts', 'fontAwesomeDictionary.json');

fs.writeFile(outputPath, JSON.stringify(fontAwesomeDictionary, null, 2), (err) => {
    if (err) {
        console.error('Error writing Font Awesome dictionary to file:', err);
    } else {
        console.log('Font Awesome dictionary successfully exported to:', outputPath);
    }
});


// Export the dictionary
export { fontAwesomeDictionary };




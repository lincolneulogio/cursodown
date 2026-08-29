const fs = require('fs');
const path = require('path');

const DIR_LOCALES = './app/locale';

// Cores ANSI
const RESET = "\x1b[0m";
const BRIGHT_GREEN = "\x1b[32m";
const BRIGHT_BLUE = "\x1b[34m";
const BRIGHT_GRAY = "\x1b[90m";


function areKeyOrdersDifferent(obj1, obj2) {
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    return keys1.length !== keys2.length || keys1.join('') !== keys2.join('');
}

function updateLocaleFile(localeFile) {
    const templatePath = path.join(DIR_LOCALES, 'template.json');
    const localeFilePath = path.join(DIR_LOCALES, localeFile);

    const templateData = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const localeData = JSON.parse(fs.readFileSync(localeFilePath, 'utf8'));

    const updatedLocaleData = {};
    
    let hasUpdated = false;
    for (const key in templateData) {
        if (localeData.hasOwnProperty(key)) {
            updatedLocaleData[key] = localeData[key];
        } else {
            updatedLocaleData[key] = templateData[key];
            hasUpdated = true;
        }
    }

    if (!hasUpdated) {
        //compare updatedLocalData vs localeData
        hasUpdated = areKeyOrdersDifferent(updatedLocaleData, localeData);
    }

    if (hasUpdated) {
        fs.writeFileSync(localeFilePath, JSON.stringify(updatedLocaleData, null, 2), 'utf8');
    }
    return hasUpdated;
}

// Main function to sync locales
(function main() {
    const files = fs.readdirSync(DIR_LOCALES);
    console.log(`${BRIGHT_BLUE}Starting Sync Locales...${RESET}`);
    console.log(`${BRIGHT_BLUE}Searching for files in ${DIR_LOCALES}${RESET}`);
    console.log(`${BRIGHT_BLUE}Found ${files.length} files in ${DIR_LOCALES}${RESET}`);

    files.forEach((file) => {
        if (file.endsWith('.json') && file !== 'template.json' && file !== 'meta.json') {
            if (updateLocaleFile(file))
                console.log(`${BRIGHT_GREEN}Updating ${file}${RESET}`);
            else
                console.log(`${BRIGHT_GRAY}Skipping ${file}: already synchronized${RESET}`);
        }
    });
})();

const fs = require('fs'),
    xml2js = require('xml2js'),
    argv = require('yargs')
        .usage('Usage: node $0 --file [string] --folder [folder-id] --subdirectories [boolean]')
        .demandOption(['file', 'folder'])
        .boolean('subdirectories')
        .default('subdirectories', true)
        .alias('folder', 'd')
        .alias('file', 'f')
        .alias('subdirectories', 's')
        .argv;

async function readFile(file) {
    return new Promise((resolve, reject) => fs.readFile(__dirname + file, (err, data) => resolve(data)))
    .catch((e) => console.error(e.message));
}

async function parseFile(file) {
    var parser = new xml2js.Parser();
    return new Promise( (resolve, reject) => parser.parseString(file, (err, data) => resolve(data)))
    .catch((e) => console.log(e.message))
}

function generateFolderPath (allFolders, targetId) {
    // TODO: Get subdirectory folders;
    let path = [];
    let currentId = targetId;
    let currentFolder = {};

    while (currentId !== 'root') {
        path.push(currentId);
        currentFolder = getFoldersById(allFolders, currentId)[0];
        currentId = getParentFolderId(currentFolder);
    }
    path.push('root');
    return path;
}

function getParentFolderId(element) {
    return element['parent'][0];
}

function getFoldersById(folders, targetId) {
    var filtered = folders.filter((element, index) => {
        return (element['$']['folder-id'] === targetId);
    });
    return filtered;
}

async function copyFolderContent(allContent, targetId) {
    const filtered = allContent.filter((element, index) => {
        return isInFolder(element, targetId);
    });
    return Promise.resolve(filtered); // TODO: Get subdirectory content;
}

function isInFolder(content, targetId) {
    if (content['folder-links']) {
        return content['folder-links'].reduce((outerAcc, curr) => {
            return outerAcc || curr['classification-link'].reduce((innerAcc, curr) => {
                return innerAcc || (curr['$']['folder-id'] === targetId);
            }, outerAcc);
        }, false);
    }
    return false;
}

async function copyFolderDefinitions(allFolders, folderPath) {
    const filtered = allFolders.filter((element, index) => {
        const folderId = element['$']['folder-id'];
        return folderPath.indexOf(folderId) > -1;
    });
    return Promise.resolve(filtered);
}

async function processFile(library, targetId) {
    const folderPath = generateFolderPath(library['folder'], targetId);
    const folders = copyFolderDefinitions(library['folder'], folderPath);
    const targetContent = copyFolderContent(library['content'], targetId);

    return Promise.all([folders, targetContent]).then((values) => {
        return {
            "folder": values[0],
            "content": values[1]
        }
    })
    .catch((e) => console.log(e.message));
}

async function buildFile(xmlAsJson, library) {
    var builder = new xml2js.Builder();
    const fileName = await getLegalFileName(argv.file, argv.folder);
    xmlAsJson['library']['folder'] = library['folder'];
    xmlAsJson['library']['content'] = library['content'];
    xml = builder.buildObject(xmlAsJson);
    return new Promise((resolve, reject) => fs.writeFile(fileName, xml, (err) => {
        if (err) { 
            reject(err);
        } else {
            resolve(fileName);
        }
    }));
}

async function getLegalFileName (file, folder) {
    file = file.split('/').slice(-1)[0].split('.')[0];
    let base = `./${Date.now()}__${file}_${folder}`;
    let fileName = `${base}.xml`;
    let index = 0;
    let fileExists = await doesFileExist(fileName);
    while (fileExists) {
        fileName = `${base}_${index++}.xml`;
        fileExists = await doesFileExist(fileName);
    }
    return fileName;
}

async function doesFileExist(fileName) {
    return new Promise((resolve, reject) => fs.stat(fileName, (err, status) => {
        if (err) {
            if (err['code'] === 'ENOENT') {
                resolve(false);
            } else {
                reject(err);
            }
        } else if (status) {
            resolve(true);
        }
    }))
}

async function main() {
    console.info(`Looking for input file: ${argv.file}`);
    const xmlBuffer = await readFile(argv.file);
    console.info('Done.');
    console.info(`Parsing XML input from file: ${argv.file}`);
    const xmlAsJson = await parseFile(xmlBuffer);
    console.info('Done.');
    console.info(`Processing file: ${argv.file} for content in the ${argv.folder} folder`);
    const processedLibrary = await processFile(xmlAsJson['library'], argv.folder);
    console.info('Done.');
    console.log(`Exporting contents of ${argv.folder} to a new file.`);
    buildFile(xmlAsJson, processedLibrary)
    .then((fileName) => {
        console.log(`Done. 
Content from the ${argv.folder} folder in ${argv.file} has been successfully exported to ${fileName}.`);
    })
    .catch(console.log);
    console.warn('______WARNING: This script does not yet export content from the folder argument\'s subdirectories. ________')
}

main();
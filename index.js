#!/usr/bin/env node

const { isEmpty } = require('lodash');
const { readFileSync, lstat, statSync, readdirSync, writeFileSync } = require('fs');
const { join } = require('path');

var argv = require('yargs/yargs')(process.argv.slice(2))
  .default({
    css: '',
    content: '',
    safelist: '',
  })
  .argv;

const nextSeparator = [
  ',',
  '>',
  // '+',
  '~',
  '.',
  '#'
];

const parseSafeList = (argSafelist) => {
  let safelist = [];
  if (!isEmpty(argSafelist)) {
    safelist = argSafelist.split(',');
  }

  return safelist;
}

const walk = async (dir) => {
  let files = readdirSync(dir);
  files = await Promise.all(files.map(async file => {
    const filePath = join(dir, file);
    const stats = statSync(filePath);
    if (stats.isDirectory()) {
      return await walk(filePath);
    } else if (stats.isFile()) {
      return filePath
    };
  }));

  return files.reduce((all, folderContents) => all.concat(folderContents), []);
}

const isDir = async (dirPath) => {
  return new Promise((resolve, reject) => {
    try {
      lstat(dirPath, (error, stats) => {
        if (stats) {
          resolve(stats.isDirectory());
        } else {
          reject(`ERROR: ${dirPath} file/path doesn't exists`);
        }
      });
    } catch (error) {
      console.log(error);
      reject(`ERROR: ${dirPath} file/path doesn't exists`);
    }
  })
}

const hasClassAtLeftSide = ({ classNameIndex, cssContent }) => {
  let classAtLeftSide = false;
  let leftClassSeparatorIndex = 0;
  for (let index = classNameIndex - 1; index > -1; index--) {
    const currentChar = cssContent[index];

    if (nextSeparator.includes(currentChar)) {
      classAtLeftSide = true;
      leftClassSeparatorIndex = index;
      break;
    } else if (currentChar === '}') {
      break;
    }
  }

  return { classAtLeftSide, leftClassSeparatorIndex };
}

const hasClassAtRightSide = ({ classNameIndex, className, cssContent }) => {
  let classAtRightSide = false;
  let rightClassSeparatorIndex = 0;
  for (let index = classNameIndex + className.length - 1; index < cssContent.length - 1; index++) {
    const currentChar = cssContent[index];

    if (nextSeparator.includes(currentChar)) {
      classAtRightSide = true;
      rightClassSeparatorIndex = index;
      break;
    } else if (currentChar === '{') {
      break;
    }
  }

  return { classAtRightSide, rightClassSeparatorIndex };
}

const getClass = (classLine) => {
  const classRegex = /\.-?[_a-zA-Z]+[_a-zA-Z0-9-]*\s*(\{|\,|\:)/g;
  const matches = classLine.match(classRegex);
  let cssClass = '';
  if (matches) {
    cssClass = matches[0];
    const charsToDelete = ['.', '{', ',', ':'];
    for (const chatToDelete of charsToDelete) {
      cssClass = cssClass.replace(chatToDelete, '');
    }
  }
  
  return cssClass.trim();
}

const main = async () => {
  try {
    const safeList = parseSafeList(argv.safelist);
    // console.log(safeList);
    // process.exit();
    const cssIsDir = await isDir(argv.css);
    const contentIsDir = await isDir(argv.content);
    const allowedContentExtFiles = ['html', 'js', 'json', 'txt'];
    let cssFiles = [argv.css];
    let contentFiles = [argv.content];

    if (cssIsDir) {
      cssFiles = await walk(argv.css);
    }
    if (contentIsDir) {
      contentFiles = await walk(argv.content);
    }

    cssFiles = cssFiles.filter((file) => file.endsWith('css'));
    contentFiles = contentFiles.filter((file) => {
      let keepFile = false;
      for (const validExt of allowedContentExtFiles) {
        keepFile = file.endsWith(validExt);
        if (keepFile) {
          break;
        }
      }
      return keepFile;
    });

    // console.log('cssFiles');
    // console.log(cssFiles);
    // console.log('contentFiles');
    // console.log(contentFiles);
    // process.exit();

    for (const cssFile of cssFiles) {
      let cssContent = readFileSync(cssFile, { encoding: 'utf-8' });
      // const classRegex = /\.-?[_a-zA-Z]+[_a-zA-Z0-9-]*\s*(\{|\,|\:)/g;
      const classRegex = /([^\r\n,{}]+)(,(?=[^}]*{)|\s*{)/g;
      const classes = [...cssContent.matchAll(classRegex)].map((arr) => arr[0]).map((cssClass) => {
        return cssClass.trim();
      }).filter((classLine) => !classLine.includes('@media'));

      const classesToDelete = [];
      let fullContent = '';
      for (const contentFile of contentFiles) {
        const content = readFileSync(contentFile, { encoding: 'utf-8' });
        fullContent += content;
      }

      for (const classLine of classes) {
        const cleanCssClass = getClass(classLine);
        if (!isEmpty(cleanCssClass)) {
          if (fullContent.indexOf(cleanCssClass) < 0) {
            if (!safeList.includes(cleanCssClass)) {
              classesToDelete.push({
                line: classLine,
                class: cleanCssClass
                // class: `.${cleanCssClass}`
              });
            }
          }
        }
      }
      // console.log('classesToDelete:');
      // console.log(classesToDelete);

      for (const classObj of classesToDelete) {
        const classNameIndex = cssContent.indexOf(classObj.line);
        const { classAtLeftSide, leftClassSeparatorIndex } = hasClassAtLeftSide({
          cssContent,
          classNameIndex,
        });

        const { classAtRightSide, rightClassSeparatorIndex } = hasClassAtRightSide({
          cssContent,
          classNameIndex,
          className: classObj.line
        });

        if (!classAtLeftSide && classAtRightSide) {
          cssContent = cssContent.substring(0, classNameIndex) + cssContent.substring(rightClassSeparatorIndex + 1);
        } else if (classAtLeftSide && classAtRightSide) {
          cssContent = cssContent.substring(0, classNameIndex) + cssContent.substring(rightClassSeparatorIndex + 1);
        } else if (classAtLeftSide && !classAtRightSide) {
          cssContent = cssContent.substring(0, leftClassSeparatorIndex) + cssContent.substring(classNameIndex + classObj.line.replace('{', '').trim().length);
        } else if (!classAtLeftSide && !classAtRightSide) {
          let openingBracketCount = 0;
          let startChecking = false;
          let lastClosingBracketIndex = 0;
          const classLine = classObj.line.replace('{', '').trim();
          for (let index = classNameIndex + classLine.length; index < cssContent.length; index++) {
            const currentChar = cssContent[index];
            if (currentChar === '{') {
              openingBracketCount += 1;
              startChecking = true;
            } else if (currentChar === '}') {
              openingBracketCount -= 1;
            }

            if (startChecking && openingBracketCount === 0) {
              lastClosingBracketIndex = index;
              break;
            }
          }
          cssContent = cssContent.substring(0, classNameIndex) + cssContent.substring(lastClosingBracketIndex + 1, cssContent.length);
        }
      }

      const mediaRegex = /(\@)(.*)(\s*)(\{*)(\})/g;
      const lineBreakRegex = /[\n\r]+/g;
      const spaceRegex = /[ ]{2,}/g;
      cssContent = cssContent.replace(mediaRegex, '');
      cssContent = cssContent.replace(lineBreakRegex, '');
      cssContent = cssContent.replace(spaceRegex, '');
      // const contentFileName = cssFile.replace('.css', '');
      // writeFileSync(`${contentFileName}.mod.css`, cssContent);
      writeFileSync(cssFile, cssContent);
    }
  } catch (error) {
    console.log(error);
  }
};

main();

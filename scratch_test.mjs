import fs from 'fs';
import path from 'path';
import vm from 'vm';

function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getFiles(fullPath));
    } else if (file.endsWith('.js') || file.endsWith('.mjs')) {
      results.push(fullPath);
    }
  }
  return results;
}

const files = getFiles('node_modules/vitest');
console.log('Total files in vitest:', files.length);

for (const f of files) {
  const code = fs.readFileSync(f, 'utf8');
  try {
    new vm.SourceTextModule(code, {
      identifier: f,
      initializeImportMeta: () => {},
      importModuleDynamically: () => {}
    });
  } catch (err) {
    if (err.name === 'SyntaxError') {
      console.error('*** SYNTAX ERROR IN FILE:', f);
      console.error(err.message);
      console.error(err.stack);
    }
  }
}
console.log('Done scanning all vitest files!');

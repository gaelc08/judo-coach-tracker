const fs = require('fs');
const acorn = require('acorn');
try {
  acorn.parse(fs.readFileSync('public/app-modular.js', 'utf8'), {sourceType: 'module', ecmaVersion: 'latest'});
  console.log('No syntax error');
} catch (e) {
  console.error(e.message, 'at', e.loc);
}
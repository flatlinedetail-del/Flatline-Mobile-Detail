import fs from 'fs';
import * as parser from '@babel/parser';
import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;

const content = fs.readFileSync('src/pages/Settings.tsx', 'utf8');
const ast = parser.parse(content, { sourceType: 'module', plugins: ['typescript', 'jsx'] });

const imports = [];
traverse(ast, {
  ImportDeclaration(path) {
    imports.push(path.node.source.value);
    const specifiers = path.node.specifiers.map(s => {
      if (s.type === 'ImportSpecifier') return s.imported.name || s.imported.value;
      if (s.type === 'ImportDefaultSpecifier') return 'default:' + s.local.name;
      return s.type;
    });
    console.log(`Import from ${path.node.source.value}: ${specifiers.join(', ')}`);
  }
});

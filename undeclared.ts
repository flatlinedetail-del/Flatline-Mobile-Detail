import fs from 'fs';
import * as parser from '@babel/parser';
import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;

const content = fs.readFileSync('src/pages/Settings.tsx', 'utf8');
const ast = parser.parse(content, { sourceType: 'module', plugins: ['typescript', 'jsx'] });

const declared = new Set(['console', 'process', 'window', 'document', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Math', 'JSON', 'Date', 'Number', 'String', 'Boolean', 'Object', 'Array', 'Promise', 'Error', 'undefined', 'NaN', 'Infinity', 'require', 'module', 'exports', 'global', 'Buffer', 'Map', 'Set', 'sessionStorage', 'localStorage', 'File']);

let undeclared = new Set();
let tags = new Set();

traverse(ast, {
  Program(path) {
    const scope = path.scope;
    for (const binding in scope.bindings) {
      declared.add(binding);
    }
  },
  Identifier(path) {
    if (path.parent.type === 'MemberExpression' && path.key === 'property') return;
    if (path.parent.type === 'ObjectProperty' && path.key === 'key') return;
    const name = path.node.name;
    if (!path.scope.hasBinding(name) && !declared.has(name)) {
      undeclared.add(name);
    }
  },
  JSXIdentifier(path) {
    if (path.parent.type === 'JSXOpeningElement' || path.parent.type === 'JSXClosingElement') {
      const name = path.node.name;
      // standard html tags
      if (/^[a-z]+$/.test(name)) return;
      if (!path.scope.hasBinding(name) && !declared.has(name)) {
        undeclared.add(name);
      }
      tags.add(name);
    }
  }
});

console.log('Undeclared Variables: ', Array.from(undeclared));
console.log('React Tags Used: ', Array.from(tags).filter(t => /^[A-Z]/.test(t)));

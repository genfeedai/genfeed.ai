#!/usr/bin/env node
/**
 * Migration script: ModelKey.X → MODEL_KEYS.X
 * Uses recast + @babel/parser for full AST fidelity including decorators.
 */

const fs = require('node:fs');
const path = require('node:path');

// Resolve paths
const root = path.join(__dirname, '../..');
const bunModules = path.join(root, 'node_modules/.bun/node_modules');

const recast = require(path.join(bunModules, 'recast'));
const babelParser = require(path.join(bunModules, '@babel/parser'));

function getParserOptions(filePath) {
  const isTsx = filePath.endsWith('.tsx');
  return {
    sourceType: 'module',
    allowImportExportEverywhere: true,
    allowReturnOutsideFunction: true,
    startLine: 1,
    tokens: true,
    plugins: [
      'asyncGenerators',
      'bigInt',
      'classPrivateMethods',
      'classPrivateProperties',
      'classProperties',
      'decorators-legacy',
      'doExpressions',
      'dynamicImport',
      'exportDefaultFrom',
      'exportNamespaceFrom',
      'functionBind',
      'importMeta',
      'nullishCoalescingOperator',
      'numericSeparator',
      'objectRestSpread',
      'optionalCatchBinding',
      'optionalChaining',
      ['pipelineOperator', { proposal: 'minimal' }],
      'throwExpressions',
      'typescript',
      ...(isTsx ? ['jsx'] : []),
    ],
  };
}

function makeParser(filePath) {
  return {
    parse(source) {
      return babelParser.parse(source, getParserOptions(filePath));
    },
  };
}

let transformed = 0;
let skipped = 0;
let errors = 0;

function walk(node, visitor) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) walk(n, visitor);
    return;
  }
  if (node.type) {
    visitor(node);
  }
  for (const key of Object.keys(node)) {
    if (['loc', 'start', 'end', 'tokens', 'extra', 'comments'].includes(key))
      continue;
    const child = node[key];
    if (child && typeof child === 'object') {
      walk(child, visitor);
    }
  }
}

function transformFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');

  let ast;
  try {
    ast = recast.parse(source, { parser: makeParser(filePath) });
  } catch (e) {
    console.error(`PARSE ERROR: ${filePath}: ${e.message}`);
    errors++;
    return;
  }

  let hasChanges = false;

  // Walk all nodes
  walk(ast.program, (node) => {
    // Replace ModelKey.X → MODEL_KEYS.X
    if (
      node.type === 'MemberExpression' &&
      node.object &&
      node.object.type === 'Identifier' &&
      node.object.name === 'ModelKey'
    ) {
      node.object.name = 'MODEL_KEYS';
      hasChanges = true;
    }

    // Replace Object.values(ModelKey) → Object.values(MODEL_KEYS)
    if (
      node.type === 'CallExpression' &&
      node.callee &&
      node.callee.type === 'MemberExpression' &&
      node.callee.object &&
      node.callee.object.name === 'Object' &&
      node.callee.property &&
      node.callee.property.name === 'values' &&
      node.arguments.length > 0 &&
      node.arguments[0].type === 'Identifier' &&
      node.arguments[0].name === 'ModelKey'
    ) {
      node.arguments[0].name = 'MODEL_KEYS';
      hasChanges = true;
    }

    // Replace TSTypeReference{ typeName: ModelKey } → TSStringKeyword
    if (
      node.type === 'TSTypeReference' &&
      node.typeName &&
      node.typeName.type === 'Identifier' &&
      node.typeName.name === 'ModelKey' &&
      !node.typeParameters
    ) {
      // Mark for replacement - we can't replace in-place with walk, handle separately
      node.__replaceWithString = true;
      hasChanges = true;
    }

    // Replace `as ModelKey` → `as string`
    if (
      node.type === 'TSAsExpression' &&
      node.typeAnnotation &&
      node.typeAnnotation.type === 'TSTypeReference' &&
      node.typeAnnotation.typeName &&
      node.typeAnnotation.typeName.name === 'ModelKey'
    ) {
      node.typeAnnotation = { type: 'TSStringKeyword' };
      hasChanges = true;
    }
  });

  if (!hasChanges) {
    skipped++;
    return;
  }

  // Second pass: replace TSTypeReference marked nodes
  // We need to do this via string replacement for TSTypeReference since we can't
  // easily replace a node with a different type in a walk
  let output = recast.print(ast, { quote: 'single' }).code;

  // Handle TSTypeReference → string replacement via source manipulation
  // The walk above marked them but couldn't replace in-place; use regex as fallback
  // for type positions (safe since ModelKey as type can only mean the enum type)
  // Pattern: `: ModelKey` or `<ModelKey>` or `ModelKey[]` in type positions
  // We already handled TSAsExpression above, and MemberExpression above.
  // For type annotations like `key: ModelKey` → `key: string`, use targeted regex
  // BUT only if there were TSTypeReference changes flagged
  const hasTypeRef =
    source.includes(': ModelKey') ||
    source.includes('<ModelKey>') ||
    source.includes('ModelKey[]') ||
    source.includes('ModelKey |') ||
    source.includes('| ModelKey') ||
    source.includes('ModelKey,') ||
    source.includes('Promise<ModelKey>');
  if (hasTypeRef) {
    // Replace type annotations - safe patterns only
    output = output
      .replace(/:\s*ModelKey(\s*[;,)\]>{}|])/g, ': string$1')
      .replace(/:\s*ModelKey(\s*\|)/g, ': string$1')
      .replace(/\|\s*ModelKey(\s*[;,)\]>{}|])/g, '| string$1')
      .replace(/\[\]\s*=\s*ModelKey/g, ': string[] = MODEL_KEYS') // array init
      .replace(/<ModelKey>/g, '<string>')
      .replace(/ModelKey\[\]/g, 'string[]')
      .replace(/Promise<ModelKey>/g, 'Promise<string>');
  }

  // Now fix imports:
  // Remove ModelKey from @genfeedai/enums import
  output = output.replace(
    /import\s*\{([^}]*)\}\s*from\s*['"]@genfeedai\/enums['"]/g,
    (_match, specifiers) => {
      const parts = specifiers
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== '' && s !== 'ModelKey');
      if (parts.length === 0) return '';
      return `import { ${parts.join(', ')} } from '@genfeedai/enums'`;
    },
  );
  // Clean up empty lines from removed imports
  output = output.replace(/^[\t ]*\n/gm, '\n').replace(/\n{3,}/g, '\n\n');

  // Add MODEL_KEYS import from @genfeedai/constants if not present
  const hasModelKeysImport =
    /from\s*['"]@genfeedai\/constants['"]/.test(output) &&
    /MODEL_KEYS/.test(
      output.match(
        /import\s*\{[^}]*\}\s*from\s*['"]@genfeedai\/constants['"]/,
      )?.[0] || '',
    );

  if (!hasModelKeysImport && output.includes('MODEL_KEYS')) {
    const constImportMatch = output.match(
      /import\s*\{([^}]*)\}\s*from\s*['"]@genfeedai\/constants['"]/,
    );
    if (constImportMatch) {
      output = output.replace(
        constImportMatch[0],
        `import { ${constImportMatch[1].trim()}, MODEL_KEYS } from '@genfeedai/constants'`,
      );
    } else {
      // Add new import after the last complete import statement
      // Find last line that ends an import (ends with ; after a from '...' pattern)
      const lines = output.split('\n');
      let lastImportEndLine = -1;
      // Track if we're inside a multi-line import block
      let inImportBlock = false;
      lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.match(/^import\s+\{/)) {
          inImportBlock = true;
        }
        if (
          inImportBlock &&
          trimmed.match(/\}\s*from\s*['"][^'"]+['"]\s*;?\s*$/)
        ) {
          lastImportEndLine = i;
          inImportBlock = false;
        } else if (
          trimmed.match(/^import\s+(?!type\s*\{|\{)/) &&
          trimmed.match(/from\s*['"][^'"]+['"]\s*;?\s*$/)
        ) {
          // Single-line import
          lastImportEndLine = i;
          inImportBlock = false;
        }
      });
      if (lastImportEndLine >= 0) {
        lines.splice(
          lastImportEndLine + 1,
          0,
          `import { MODEL_KEYS } from '@genfeedai/constants';`,
        );
        output = lines.join('\n');
      } else {
        output = `import { MODEL_KEYS } from '@genfeedai/constants';\n${output}`;
      }
    }
  }

  // Final check: any ModelKey references remaining in non-import/non-type context?
  const remainingModelKeyUsages = (output.match(/ModelKey\./g) || []).length;
  if (remainingModelKeyUsages > 0) {
    console.warn(
      `  WARN: ${remainingModelKeyUsages} ModelKey. references remaining in ${filePath}`,
    );
  }

  fs.writeFileSync(filePath, output, 'utf8');
  transformed++;
  console.log(`OK: ${path.relative(root, filePath)}`);
}

// Get files to process
function getFiles(dir, extensions, ignore) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (ignore.some((p) => full.includes(p))) continue;
    if (entry.isDirectory()) {
      results.push(...getFiles(full, extensions, ignore));
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

const IGNORE = [
  '/node_modules/',
  '/dist/',
  '/model-keys.constant.ts',
  '/model.enum.ts',
  '/.next/',
  '/build/',
];

const DIRS = [path.join(root, 'apps'), path.join(root, 'packages')];

const EXTS = ['.ts', '.tsx'];

// Filter to only files with ModelKey references
const allFiles = DIRS.flatMap((d) => getFiles(d, EXTS, IGNORE));
const targetFiles = allFiles.filter((f) => {
  const content = fs.readFileSync(f, 'utf8');
  return content.includes('ModelKey');
});

console.log(
  `Processing ${targetFiles.length} files with ModelKey references...`,
);

for (const file of targetFiles) {
  try {
    transformFile(file);
  } catch (e) {
    console.error(`ERROR: ${file}: ${e.message}`);
    errors++;
  }
}

console.log(`\nDone.`);
console.log(`  Transformed: ${transformed}`);
console.log(`  Skipped (no changes): ${skipped}`);
console.log(`  Errors: ${errors}`);

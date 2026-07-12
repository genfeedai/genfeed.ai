import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const entryFiles = [
  'canvas.mjs',
  'hooks.mjs',
  'index.mjs',
  'lib.mjs',
  'nodes.mjs',
  'panels.mjs',
  'provider.mjs',
  'stores.mjs',
  'toolbar.mjs',
  'ui.mjs',
];

const directive = '"use client";';
const distRoot = join(import.meta.dir, '..', 'dist', 'ui');

for (const fileName of entryFiles) {
  const filePath = join(distRoot, fileName);
  const source = readFileSync(filePath, 'utf8');

  if (source.startsWith(directive)) {
    continue;
  }

  writeFileSync(filePath, `${directive}\n${source}`);
}

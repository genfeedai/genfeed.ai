import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixEsmRelativeImports } from '../fix-esm-relative-imports.mjs';

describe('fix-esm-relative-imports', () => {
  let root = '';
  let outputDir = '';

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'fix-esm-imports-'));
    outputDir = path.join(root, 'dist');
    mkdirSync(outputDir);
  });

  afterEach(() => {
    rmSync(root, { force: true, recursive: true });
  });

  it('extends only relative modules and preserves colliding bare packages', () => {
    writeOutput('client.js', 'export const client = true;\n');
    writeOutput('react.js', 'export const localReact = true;\n');
    writeOutput('folder/index.js', 'export const folder = true;\n');
    writeOutput('internal.js', 'export const internal = true;\n');
    writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@fixture/*': ['./src/*'],
            '@workspace/*': ['../workspace/*'],
          },
          rootDir: './src',
        },
      }),
    );
    writeOutput(
      'session.js',
      [
        "import { useCallback } from 'react';",
        "import { internal } from '@fixture/internal';",
        "import { workspace } from '@workspace/module';",
        "import { client } from './client';",
        "export { folder } from './folder';",
        "const lazy = import('./client?worker');",
        `const message = "load from './client' now";`,
        "const template = `import './client'`;",
        "// export { client } from './client';",
        '',
      ].join('\n'),
    );
    writeOutput(
      'types.d.ts',
      [
        "export type { Client } from './client';",
        "type Folder = import('./folder').Folder;",
        "import Client = require('./client');",
        '',
      ].join('\n'),
    );

    expect(
      fixEsmRelativeImports([outputDir], {
        projectPath: path.join(root, 'tsconfig.json'),
      }),
    ).toEqual({
      changedFiles: 2,
      checkedFiles: 6,
    });
    expect(readFileSync(path.join(outputDir, 'session.js'), 'utf8')).toBe(
      [
        "import { useCallback } from 'react';",
        "import { internal } from './internal.js';",
        "import { workspace } from '@workspace/module';",
        "import { client } from './client.js';",
        "export { folder } from './folder/index.js';",
        "const lazy = import('./client.js?worker');",
        `const message = "load from './client' now";`,
        "const template = `import './client'`;",
        "// export { client } from './client';",
        '',
      ].join('\n'),
    );
    expect(readFileSync(path.join(outputDir, 'types.d.ts'), 'utf8')).toBe(
      [
        "export type { Client } from './client.js';",
        "type Folder = import('./folder/index.js').Folder;",
        "import Client = require('./client.js');",
        '',
      ].join('\n'),
    );
  });

  function writeOutput(relativePath: string, content: string) {
    const filePath = path.join(outputDir, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }
});

import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createResolver,
  isTestSupport,
  selectSourceContracts,
  sourceImports,
} from './source-contracts.mjs';

test('recognizes static, CommonJS, dynamic and Bun filesystem access', () => {
  for (const source of [
    "import { readFileSync } from 'node:fs'",
    "import fs from 'fs'; fs.readFileSync('source.ts')",
    "const fs = require('fs/promises')",
    "const fs = await import('node:fs/promises')",
    "const source = await Bun.file('source.ts').text()",
  ])
    assert.equal(sourceImports(source).filesystem, true, source);
  assert.equal(sourceImports("import { sum } from './sum'").filesystem, false);
});

test('includes direct source guards and transitive helper readers, excludes pure unit tests', () => {
  const sources = {
    'guard.test.ts': "import fs from 'node:fs';",
    'transitive.test.ts': "import { source } from './helpers';",
    helpers: "export { source } from './reader';",
    reader: "const fs = require('node:fs');",
    'unit.test.ts': "import { sum } from './sum';",
    sum: 'export const sum = (a, b) => a + b;',
    'excluded.integration.test.ts': "import fs from 'node:fs';",
  };
  const files = ['guard.test.ts', 'transitive.test.ts', 'unit.test.ts'];
  assert.deepEqual(
    selectSourceContracts(files, {
      readSource: (file) => sources[file],
      resolveImport: (specifier) =>
        specifier.startsWith('./') ? specifier.slice(2) : undefined,
    }),
    ['guard.test.ts', 'transitive.test.ts'],
  );
});

test('propagates filesystem dependencies through cyclic helpers without caching false', () => {
  const sources = {
    'a.test.ts': "import './a'",
    'b.test.ts': "import './b'",
    a: "import './b'; import './reader'",
    b: "import './a'",
    reader: "import fs from 'node:fs'",
  };
  assert.deepEqual(
    selectSourceContracts(['a.test.ts', 'b.test.ts'], {
      readSource: (file) => sources[file],
      resolveImport: (specifier) =>
        specifier.startsWith('./') ? specifier.slice(2) : undefined,
    }),
    ['a.test.ts', 'b.test.ts'],
  );
});

test('fails closed when reading an eligible source fails', () => {
  assert.throws(
    () =>
      selectSourceContracts(['guard.test.ts'], {
        readSource: () => {
          throw new Error('unreadable source');
        },
        resolveImport: () => undefined,
      }),
    /unreadable source/,
  );
});

test('follows conventional shared test helpers while leaving product dependencies to Vitest', () => {
  for (const file of [
    '/repo/apps/api/test/source.ts',
    '/repo/apps/app/tests/helpers/reader.ts',
    '/repo/packages/helpers/src/testing/files.ts',
    '/repo/apps/api/src/collection/collection.test-utils.ts',
    '/repo/scripts/source-reader.mjs',
  ])
    assert.equal(isTestSupport(file), true, file);
  for (const file of [
    '/repo/apps/api/src/config/service.ts',
    '/repo/packages/libs/config/config.module.ts',
    '/repo/apps/app/src/helpers/config.ts',
  ])
    assert.equal(isTestSupport(file), false, file);
});

test('resolves aliased helpers with tsconfig inheritance without executing their code', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'source-contract-fixture-'));
  try {
    mkdirSync(path.join(root, 'tests/helpers'), { recursive: true });
    writeFileSync(
      path.join(root, 'base.json'),
      JSON.stringify({
        compilerOptions: {
          moduleResolution: 'bundler',
          module: 'esnext',
          paths: { '@fixtures/*': ['./tests/helpers/*'] },
        },
      }),
    );
    writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({ extends: './base.json' }),
    );
    const guard = path.join(root, 'tests/guard.test.ts');
    const pure = path.join(root, 'tests/pure.test.ts');
    writeFileSync(guard, "import { readSource } from '@fixtures/reader'");
    writeFileSync(pure, 'export const pure = true;');
    writeFileSync(
      path.join(root, 'tests/helpers/reader.ts'),
      "import fs from 'node:fs'; throw new Error('must never execute during discovery');",
    );
    assert.deepEqual(
      selectSourceContracts([guard, pure], {
        readSource: (file) => readFileSync(file, 'utf8'),
        resolveImport: createResolver(root, root),
      }),
      [guard],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

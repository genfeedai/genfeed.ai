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
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  CONNECTED_SOURCE_CONTRACT_FILES,
  createResolver,
  isTestSupport,
  partitionSourceContracts,
  runSourceContracts,
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

test('classifies only the three exact connected roots after traversing their complete source graph', () => {
  const root = '/repo';
  const connected = path.join(root, CONNECTED_SOURCE_CONTRACT_FILES[0]);
  const guard = path.join(root, 'tests/source-guard.test.ts');
  const helper = path.join(root, 'tests/reader.ts');
  const pure = path.join(root, 'tests/pure.test.ts');
  const sources = new Map([
    [connected, "import './reader'"],
    [guard, "import './reader'"],
    [helper, "import fs from 'node:fs'"],
    [pure, 'export const value = 1;'],
  ]);
  const visited = new Set();
  const selected = selectSourceContracts([connected, guard, pure], {
    readSource: (file) => {
      visited.add(file);
      return sources.get(file);
    },
    resolveImport: (specifier) =>
      specifier === './reader' ? helper : undefined,
  });
  assert.deepEqual(visited, new Set([connected, guard, helper, pure]));
  assert.deepEqual(partitionSourceContracts(selected, root), {
    sourceOnly: [guard],
    connected: [connected],
  });
  const sameName = path.join(root, 'tests/crun-image-flow.integration.spec.ts');
  const otherPostgres = path.join(root, 'tests/source.postgres.spec.ts');
  assert.deepEqual(partitionSourceContracts([sameName, otherPostgres], root), {
    sourceOnly: [sameName, otherPostgres],
    connected: [],
  });
});

test('connected classification cannot hide an unreadable selected source or transitive dependency', () => {
  const root = '/repo';
  const connected = path.join(root, CONNECTED_SOURCE_CONTRACT_FILES[1]);
  const helper = path.join(root, 'tests/reader.ts');
  for (const unreadable of [connected, helper])
    assert.throws(
      () =>
        partitionSourceContracts(
          selectSourceContracts([connected], {
            readSource: (file) => {
              if (file === unreadable)
                throw new Error('unreadable connected graph');
              return "import './reader'";
            },
            resolveImport: (specifier) =>
              specifier === './reader' ? helper : undefined,
          }),
          root,
        ),
      /unreadable connected graph/,
    );
});

function literalCaseCount(source, file) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  assert.equal(ast.parseDiagnostics.length, 0);
  let count = 0;
  function visit(node) {
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === 'it')
        count++;
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.expression.getText(ast) === 'it' &&
        node.expression.name.text === 'each'
      ) {
        let cases = node.arguments[0];
        while (ts.isAsExpression(cases)) cases = cases.expression;
        assert.ok(
          ts.isArrayLiteralExpression(cases),
          'Connected case rows must remain explicit',
        );
        count += cases.elements.length;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return count;
}

test('retains all connected Crun cases and their real fixture-owning API job', () => {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const workflow = readFileSync(
    path.join(root, '.github/workflows/ci.yml'),
    'utf8',
  );
  const apiJob = workflow.split('  test-api:')[1]?.split('  build:')[0];
  assert.ok(apiJob);
  assert.match(apiJob, /postgres:[\s\S]*redis:/);
  assert.match(apiJob, /WORKFLOW_BILLING_TEST_DATABASE_URL: postgresql:/);
  assert.match(apiJob, /CRUN_TEST_REDIS_URL: redis:/);
  assert.match(
    apiJob,
    /cd apps\/server\/api && bunx vitest run --config vitest\.config\.ts/,
  );
  const config = readFileSync(
    path.join(root, 'apps/server/api/vitest.config.ts'),
    'utf8',
  );
  assert.match(config, /include: \[.*'src\/\*\*\/\*\.spec\.ts'/);
  for (const [index, file] of CONNECTED_SOURCE_CONTRACT_FILES.entries()) {
    const source = readFileSync(path.join(root, file), 'utf8');
    assert.equal(literalCaseCount(source, file), [18, 23, 10][index]);
    assert.doesNotMatch(
      source,
      /\b(?:it|describe)\.(?:skip|todo|only|skipIf|runIf)\b/,
    );
    assert.match(source, /WORKFLOW_BILLING_TEST_DATABASE_URL/);
    assert.match(source, /CRUN_TEST_REDIS_URL/);
    assert.match(source, /throw new Error\(\s*'Dedicated /);
    assert.equal(config.includes(path.basename(file)), false);
  }
});

test('overlaps surfaces within two workers, executes every discovered reader, and awaits all failures', async () => {
  const surfaces = [
    { directory: 'app', config: 'app.config' },
    { directory: 'api', config: 'api.config' },
  ];
  const calls = [];
  const pending = [];
  const execution = runSourceContracts({
    root: '/repo',
    surfaces,
    discover: (surface) => [`/repo/${surface.directory}/guard.test.ts`],
    execute: (command, args, options) => {
      calls.push({ command, args, options });
      return new Promise((resolve, reject) =>
        pending.push({ resolve, reject }),
      );
    },
  });
  assert.equal(calls.length, 2, 'both surfaces start before either finishes');
  for (const call of calls) {
    assert.equal(call.command, 'bunx');
    assert.ok(call.args.includes('--maxWorkers=1'));
    assert.ok(call.args.includes('guard.test.ts'));
    assert.ok(!call.args.includes('--changed'));
    assert.equal(call.options.env.CI, 'true');
  }
  let finished = false;
  const outcome = execution.catch((error) => {
    finished = true;
    return error;
  });
  pending[0].reject(new Error('app contract failed'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(finished, false, 'one failure cannot abandon another surface');
  pending[1].reject(new Error('API contract failed'));
  const error = await outcome;
  assert.ok(error instanceof AggregateError);
  assert.equal(error.errors.length, 2);
});

test('source-contract listing discovers all surfaces without executing tests', async () => {
  const results = await runSourceContracts({
    root: '/repo',
    listOnly: true,
    surfaces: [{ directory: 'app', config: 'app.config' }],
    discover: () => ['/repo/app/guard.test.ts'],
    execute: () => {
      throw new Error('listing must not execute');
    },
  });
  assert.deepEqual(results, [
    { surface: 'app', files: ['guard.test.ts'], connectedFiles: [] },
  ]);
});

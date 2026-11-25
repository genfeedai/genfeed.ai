import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ensureClient } from '../../packages/prisma/prisma/generate-client.mjs';
import {
  decodeGraph,
  encodeGraph,
  keptDepth,
  pruneGraph,
  slimClassSource,
} from '../../packages/prisma/prisma/slim-parameterization-schema.mjs';

const require = createRequire(
  new URL('../../apps/server/api/package.json', import.meta.url),
);
const { parse } = require('yaml');

const REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SCRIPT = path.join(
  REPOSITORY_ROOT,
  'packages/prisma/prisma/generate-client.mjs',
);
const SLIM_SCRIPT = path.join(
  REPOSITORY_ROOT,
  'packages/prisma/prisma/slim-parameterization-schema.mjs',
);

function repositoryFile(relativePath) {
  return readFileSync(path.join(REPOSITORY_ROOT, relativePath), 'utf8');
}

function writePackageFile(packageRoot, relativePath, content) {
  const target = path.join(packageRoot, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function writeManifest(packageRoot, dependencies) {
  writePackageFile(
    packageRoot,
    'package.json',
    `${JSON.stringify({ dependencies })}\n`,
  );
}

// A package shaped like packages/prisma, with a generator that writes which
// run produced the client. The tests read that file, so they prove what is on
// disk after each install instead of counting calls.
function createPackage(t) {
  const packageRoot = mkdtempSync(path.join(tmpdir(), 'prisma-stamp-'));
  t.after(() => rmSync(packageRoot, { force: true, recursive: true }));
  writeManifest(packageRoot, { '@prisma/client': '7.10.1', prisma: '7.10.1' });
  writePackageFile(packageRoot, 'prisma.config.mjs', 'export default {};\n');
  writePackageFile(packageRoot, 'prisma/schema.prisma', 'model A {}\n');
  writePackageFile(
    packageRoot,
    'prisma/slim-parameterization-schema.mjs',
    'export {};\n',
  );
  const state = { runs: 0 };
  const generate = () => {
    state.runs += 1;
    writePackageFile(
      packageRoot,
      'generated/prisma/client/client.ts',
      `// run ${state.runs}\n`,
    );
    writePackageFile(
      packageRoot,
      'generated/prisma/client/models/A.ts',
      'export {};\n',
    );
  };
  return { generate, packageRoot };
}

function generatedBy(packageRoot) {
  return readFileSync(
    path.join(packageRoot, 'generated/prisma/client/client.ts'),
    'utf8',
  );
}

const STAMP = 'generated/prisma/client-stamp.json';

test('the first install generates the client and stamps it', (t) => {
  const { generate, packageRoot } = createPackage(t);

  assert.equal(ensureClient({ generate, packageRoot }), 'generated');
  assert.equal(generatedBy(packageRoot), '// run 1\n');
  assert.deepEqual(
    Object.keys(
      JSON.parse(readFileSync(path.join(packageRoot, STAMP), 'utf8')),
    ),
    ['client', 'format', 'inputs'],
  );
});

test('an install with nothing changed keeps the client it has', (t) => {
  const { generate, packageRoot } = createPackage(t);
  ensureClient({ generate, packageRoot });

  assert.equal(ensureClient({ generate, packageRoot }), 'current');
  assert.equal(generatedBy(packageRoot), '// run 1\n');
});

test('the stamp depends only on the inputs and the generated files', (t) => {
  const first = createPackage(t);
  const second = createPackage(t);
  ensureClient(first);
  ensureClient(second);

  assert.equal(
    readFileSync(path.join(first.packageRoot, STAMP), 'utf8'),
    readFileSync(path.join(second.packageRoot, STAMP), 'utf8'),
  );
});

const CHANGES_THAT_REGENERATE = [
  [
    'an edited schema',
    (root) => writePackageFile(root, 'prisma/schema.prisma', 'model B {}\n'),
  ],
  [
    'an edited Prisma config',
    (root) =>
      writePackageFile(root, 'prisma.config.mjs', 'export default { a: 1 };\n'),
  ],
  [
    'an edited parameterization cut',
    (root) =>
      writePackageFile(
        root,
        'prisma/slim-parameterization-schema.mjs',
        'export const edited = true;\n',
      ),
  ],
  [
    'a new prisma version',
    (root) =>
      writeManifest(root, { '@prisma/client': '7.10.1', prisma: '7.11.0' }),
  ],
  [
    'a new @prisma/client version',
    (root) =>
      writeManifest(root, { '@prisma/client': '7.11.0', prisma: '7.10.1' }),
  ],
  [
    'an edited generated file',
    (root) =>
      writePackageFile(root, 'generated/prisma/client/models/A.ts', 'edited\n'),
  ],
  [
    'a deleted generated file',
    (root) => rmSync(path.join(root, 'generated/prisma/client/models/A.ts')),
  ],
  [
    'an extra file in the client',
    (root) =>
      writePackageFile(root, 'generated/prisma/client/models/Old.ts', 'old\n'),
  ],
  [
    'a deleted client',
    (root) =>
      rmSync(path.join(root, 'generated/prisma/client'), { recursive: true }),
  ],
  ['a deleted stamp', (root) => rmSync(path.join(root, STAMP))],
  ['an unreadable stamp', (root) => writePackageFile(root, STAMP, '{')],
];

for (const [label, change] of CHANGES_THAT_REGENERATE) {
  test(`${label} generates the client again`, (t) => {
    const { generate, packageRoot } = createPackage(t);
    ensureClient({ generate, packageRoot });
    change(packageRoot);

    assert.equal(ensureClient({ generate, packageRoot }), 'generated');
    assert.equal(generatedBy(packageRoot), '// run 2\n');
    assert.equal(ensureClient({ generate, packageRoot }), 'current');
  });
}

test('force generates even when the client is current', (t) => {
  const { generate, packageRoot } = createPackage(t);
  ensureClient({ generate, packageRoot });

  assert.equal(
    ensureClient({ force: true, generate, packageRoot }),
    'generated',
  );
  assert.equal(generatedBy(packageRoot), '// run 2\n');
  assert.equal(ensureClient({ generate, packageRoot }), 'current');
});

test('a Prisma dependency given as a range is never trusted to be current', (t) => {
  const { generate, packageRoot } = createPackage(t);
  writeManifest(packageRoot, { '@prisma/client': '7.10.1', prisma: '^7.10.1' });
  ensureClient({ generate, packageRoot });

  assert.equal(ensureClient({ generate, packageRoot }), 'generated');
  assert.equal(generatedBy(packageRoot), '// run 2\n');
  assert.equal(existsSync(path.join(packageRoot, STAMP)), false);
});

test('a missing schema is left for Prisma to report and leaves no stamp', (t) => {
  const { generate, packageRoot } = createPackage(t);
  rmSync(path.join(packageRoot, 'prisma/schema.prisma'));

  assert.equal(ensureClient({ generate, packageRoot }), 'generated');
  assert.equal(ensureClient({ generate, packageRoot }), 'generated');
  assert.equal(existsSync(path.join(packageRoot, STAMP)), false);
});

test('a generation that fails leaves no stamp, so the next install generates', (t) => {
  const { generate, packageRoot } = createPackage(t);
  ensureClient({ generate, packageRoot });
  writePackageFile(packageRoot, 'prisma/schema.prisma', 'model B {}\n');

  assert.throws(
    () =>
      ensureClient({
        generate: () => {
          throw new Error('schema is invalid');
        },
        packageRoot,
      }),
    /schema is invalid/,
  );
  assert.equal(existsSync(path.join(packageRoot, STAMP)), false);
  assert.equal(ensureClient({ generate, packageRoot }), 'generated');
  assert.equal(generatedBy(packageRoot), '// run 2\n');
});

// The command line, as `bun install` runs it: the real script in a package of
// its own, with a stand-in `prisma` first on PATH.
// What `prisma generate` leaves in `internal/class.ts` for the parameterization
// schema: a read root and a write root of a model. The read root reaches a
// relation filter two levels down, which the cut drops.
function writeGeneratedClassFixture(file) {
  const strings = ['User.findMany', 'User.createOne', 'where'];
  const graph = encodeGraph({
    inputNodes: [
      [{ name: 2, scalarMask: 0, flags: 32, childNodeId: 2 }],
      [{ name: 2, scalarMask: 1, flags: 1 }],
      [{ name: 2, scalarMask: 0, flags: 32, childNodeId: 3 }],
      // A related model's where-input has relations of its own below it.
      [
        { name: 2, scalarMask: 1, flags: 1 },
        { name: 2, scalarMask: 0, flags: 32, childNodeId: 1 },
      ],
    ],
    outputNodes: [],
    roots: [
      { name: 0, argsNodeId: 0 },
      { name: 1, argsNodeId: 1 },
    ],
    strings,
  });
  writeFileSync(
    file,
    `config.parameterizationSchema = {\n  strings: JSON.parse(${JSON.stringify(JSON.stringify(strings))}),\n  graph: "${graph}"\n}\n`,
  );
}

function createCliPackage(t, prismaScript) {
  const { packageRoot } = createPackage(t);
  copyFileSync(SCRIPT, path.join(packageRoot, 'prisma/generate-client.mjs'));
  copyFileSync(
    SLIM_SCRIPT,
    path.join(packageRoot, 'prisma/slim-parameterization-schema.mjs'),
  );
  const fixture = path.join(packageRoot, 'class-fixture.ts');
  writeGeneratedClassFixture(fixture);
  const bin = path.join(packageRoot, 'bin');
  mkdirSync(bin);
  writeFileSync(path.join(bin, 'prisma'), prismaScript);
  chmodSync(path.join(bin, 'prisma'), 0o755);
  const run = (...args) =>
    spawnSync(process.execPath, ['prisma/generate-client.mjs', ...args], {
      cwd: packageRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        CLASS_FIXTURE: fixture,
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      },
    });
  return { packageRoot, run };
}

const PRISMA_THAT_GENERATES = `#!/bin/sh
test "$1" = generate || exit 64
mkdir -p generated/prisma/client/internal
echo generated >> generated/prisma/client/client.ts
cp "$CLASS_FIXTURE" generated/prisma/client/internal/class.ts
`;
const SLIMMED =
  'Slimmed the query parameterization graph: 5 to 3 input edges.\n';
const PRISMA_THAT_FAILS = '#!/bin/sh\nexit 3\n';

test('the postinstall command generates once and then skips', (t) => {
  const { packageRoot, run } = createCliPackage(t, PRISMA_THAT_GENERATES);

  const first = run();
  const second = run();

  assert.equal(first.status, 0);
  assert.equal(first.stdout, SLIMMED);
  assert.equal(second.status, 0);
  assert.equal(
    second.stdout,
    'Prisma client is current for this schema; skipped generation.\n',
  );
  assert.equal(generatedBy(packageRoot), 'generated\n');
});

test('db:generate forces a new client through the same command', (t) => {
  const { packageRoot, run } = createCliPackage(t, PRISMA_THAT_GENERATES);
  run();

  const forced = run('--force');

  assert.equal(forced.status, 0);
  assert.equal(forced.stdout, SLIMMED);
  assert.equal(generatedBy(packageRoot), 'generated\ngenerated\n');
});

test('the postinstall command fails when prisma generate fails', (t) => {
  const { run } = createCliPackage(t, PRISMA_THAT_FAILS);

  const result = run();

  assert.equal(result.status, 1);
  assert.equal(result.stderr, 'prisma generate exited with 3\n');
});

test('@genfeedai/prisma generates through the stamp on install and on db:generate', () => {
  const { scripts } = JSON.parse(
    repositoryFile('packages/prisma/package.json'),
  );

  assert.equal(scripts.postinstall, 'node prisma/generate-client.mjs');
  assert.equal(
    scripts['db:generate'],
    'node prisma/generate-client.mjs --force && node scripts/generate-model-metadata.mjs && bunx biome check --write src/enum-field-map.ts',
  );
});

test('the stamp hashes the schema file that prisma.config.mjs generates from', () => {
  assert.match(
    repositoryFile('packages/prisma/prisma.config.mjs'),
    /^ {2}schema: '\.\/prisma\/schema\.prisma',$/m,
  );
  assert.match(
    repositoryFile('packages/prisma/prisma/generate-client.mjs'),
    /^const GENERATION_INPUT_FILES = \[\n {2}'prisma\.config\.mjs',\n {2}'prisma\/schema\.prisma',\n {2}'prisma\/slim-parameterization-schema\.mjs',\n\];$/m,
  );
});

for (const dockerfile of [
  'docker/Dockerfile.server',
  'docker/Dockerfile.selfhosted',
]) {
  test(`${dockerfile} copies the generator script with the schema before it installs`, () => {
    assert.match(
      repositoryFile(dockerfile),
      /COPY packages\/prisma\/prisma\.config\.mjs \.\/packages\/prisma\/prisma\.config\.mjs\nCOPY packages\/prisma\/prisma\/ \.\/packages\/prisma\/prisma\/\n[\s\S]*?bun install /,
    );
  });
}

const action = parse(
  repositoryFile('.github/actions/setup-bun-env/action.yml'),
);
const actionSteps = action.runs.steps;
const stepNames = actionSteps.map((step) => step.name);

test('the setup action restores the generated client before the install, only when asked', () => {
  const restore = actionSteps.find(
    (step) => step.name === 'Restore generated Prisma client',
  );

  assert.equal(action.inputs['cache-prisma-client'].default, 'false');
  assert.equal(restore.if, "${{ inputs.cache-prisma-client == 'true' }}");
  assert.equal(restore.with.path, 'packages/prisma/generated');
  assert.equal(
    restore.with.key,
    "${{ runner.os }}-prisma-client-${{ hashFiles('packages/prisma/package.json', 'packages/prisma/prisma.config.mjs', 'packages/prisma/prisma/schema.prisma', 'packages/prisma/prisma/generate-client.mjs', 'packages/prisma/prisma/slim-parameterization-schema.mjs') }}",
  );
  assert.equal(restore.with['restore-keys'], undefined);
  assert.equal(
    stepNames.indexOf('Restore generated Prisma client') <
      stepNames.indexOf('Install dependencies'),
    true,
  );
});

test('the setup action saves a newly generated client straight after the install', () => {
  const save = actionSteps.find(
    (step) => step.name === 'Save generated Prisma client',
  );

  assert.equal(
    save.if,
    "${{ inputs.cache-prisma-client == 'true' && steps.prisma-client-cache.outputs.cache-hit != 'true' }}",
  );
  assert.equal(save.with.path, 'packages/prisma/generated');
  assert.equal(
    save.with.key,
    '${{ steps.prisma-client-cache.outputs.cache-primary-key }}',
  );
  assert.equal(
    stepNames.indexOf('Save generated Prisma client'),
    stepNames.indexOf('Install dependencies') + 1,
  );
});

const validationJobs = parse(
  repositoryFile('.github/workflows/_ci-validation.yml'),
).jobs;
const bundleSizeJobs = parse(
  repositoryFile('.github/workflows/_bundle-size.yml'),
).jobs;

function setupStep(job) {
  return job.steps.find(
    (step) => step.uses === './.github/actions/setup-bun-env',
  );
}

for (const jobId of ['plan', 'static-checks', 'source-contracts']) {
  test(`the ${jobId} validation job reuses the generated client`, () => {
    assert.deepEqual(setupStep(validationJobs[jobId]).with, {
      'cache-prisma-client': 'true',
    });
  });
}

// These jobs install through the start action, which keeps the same cache.
const startActionSteps = parse(
  repositoryFile('.github/actions/start-test-leg/action.yml'),
).runs.steps;

test('the start action reuses the generated client', () => {
  assert.deepEqual(setupStep({ steps: startActionSteps }).with, {
    'cache-prisma-client': 'true',
  });
});

for (const jobId of [
  'spec-typecheck',
  'test-workspaces',
  'test-app',
  'test-api',
  'cloud-tenant-guard',
  'build',
  'mcp-auth-runtime',
]) {
  test(`the ${jobId} validation job installs through the start action`, () => {
    const job = validationJobs[jobId];
    assert.equal(setupStep(job), undefined);
    assert.ok(
      job.steps.some(
        (step) => step.uses === './.github/actions/start-test-leg',
      ),
    );
  });
}

test('the bundle size build reuses the generated client', () => {
  assert.deepEqual(setupStep(bundleSizeJobs.measure).with, {
    'cache-prisma-client': 'true',
  });
});

// The parameterization graph Prisma keeps in memory (#11147).

const STRINGS_IN_CLASS = /strings: JSON\.parse\(("(?:[^"\\]|\\.)*")\),/u;
const GRAPH_IN_CLASS = /graph: "([A-Za-z0-9_-]*)"/u;

function readClassGraph(source) {
  return decodeGraph(
    GRAPH_IN_CLASS.exec(source)[1],
    JSON.parse(JSON.parse(STRINGS_IN_CLASS.exec(source)[1])),
  );
}

// User.findMany -> where (a filter node below it) and a relation filter;
// User.createOne and Cold.findMany are roots the cut keeps as well.
function sampleGraph() {
  return {
    inputNodes: [
      [
        { name: 3, scalarMask: 0, flags: 32, childNodeId: 1 },
        { name: 4, scalarMask: 0, flags: 32, childNodeId: 2 },
      ],
      [
        { name: 5, scalarMask: 1, flags: 33, childNodeId: 3 },
        { name: 6, scalarMask: 0, flags: 32, childNodeId: 4 },
      ],
      [{ name: 5, scalarMask: 1, flags: 1 }],
      [{ name: 7, scalarMask: 1, flags: 5 }],
      [
        { name: 5, scalarMask: 1, flags: 1 },
        { name: 6, scalarMask: 0, flags: 32, childNodeId: 5 },
      ],
      [{ name: 5, scalarMask: 1, flags: 1 }],
    ],
    outputNodes: [[{ name: 8, argsNodeId: 5, outputNodeId: undefined }]],
    roots: [
      { name: 0, argsNodeId: 0, outputNodeId: 0 },
      { name: 1, argsNodeId: 2 },
      { name: 2, argsNodeId: 5 },
    ],
    strings: [
      'User.findMany',
      'User.createOne',
      'Cold.findMany',
      'where',
      'orderBy',
      'id',
      'brand',
      'in',
      'posts',
    ],
  };
}

test('the parameterization graph encodes and decodes without loss', () => {
  const graph = sampleGraph();

  const decoded = decodeGraph(encodeGraph(graph), graph.strings);

  // JSON drops the `undefined` of an absent child or enum.
  assert.deepEqual(
    JSON.parse(JSON.stringify(decoded)),
    JSON.parse(JSON.stringify(graph)),
  );
});

test('the cut keeps every root, so a write stays a plan too', () => {
  const graph = sampleGraph();

  const slim = pruneGraph(graph, keptDepth);

  assert.deepEqual(
    slim.roots.map((root) => slim.strings[root.name]),
    ['User.findMany', 'User.createOne', 'Cold.findMany'],
  );
});

test("the cut follows scalar filters and leaves a related model's where-input literal", () => {
  const slim = pruneGraph(sampleGraph(), keptDepth);

  const where = slim.inputNodes[slim.roots[0].argsNodeId];
  const byName = Object.fromEntries(
    where.map((edge) => [slim.strings[edge.name], edge]),
  );
  // `where` and `orderBy` are the root's own arguments: kept, with their nodes.
  assert.notEqual(byName.where.childNodeId, undefined);
  assert.notEqual(byName.orderBy.childNodeId, undefined);
  const whereInput = slim.inputNodes[byName.where.childNodeId];
  const fields = Object.fromEntries(
    whereInput.map((edge) => [slim.strings[edge.name], edge]),
  );
  // A scalar field keeps its filter node, so `{ id: { in: [...] } }` stays a plan.
  assert.notEqual(fields.id.childNodeId, undefined);
  assert.equal(
    slim.strings[slim.inputNodes[fields.id.childNodeId][0].name],
    'in',
  );
  // A relation field keeps its flags but loses its child: the value stays literal.
  assert.equal(fields.brand.childNodeId, undefined);
  assert.equal(fields.brand.flags, 32);
});

test('the cut keeps the filter of a Json field, which takes no bare value', () => {
  // Thing.updateMany -> where -> { payload: JsonFilter, owner: related where }.
  // A Json field has an empty scalar mask, like a relation, but its filter has
  // only value edges below it. Cut, `{ payload: { equals: {...} } }` matched no
  // row, so an optimistic write on a Json column never applied.
  const graph = {
    inputNodes: [
      [{ name: 1, scalarMask: 0, flags: 32, childNodeId: 1 }],
      [
        { name: 2, scalarMask: 0, flags: 32, childNodeId: 2 },
        { name: 3, scalarMask: 0, flags: 32, childNodeId: 3 },
      ],
      [{ name: 4, scalarMask: 128, flags: 1 }],
      [{ name: 2, scalarMask: 1, flags: 33, childNodeId: 4 }],
      [{ name: 4, scalarMask: 1, flags: 1 }],
    ],
    outputNodes: [],
    roots: [{ name: 0, argsNodeId: 0 }],
    strings: ['Thing.updateMany', 'where', 'payload', 'owner', 'equals'],
  };

  const slim = pruneGraph(graph, keptDepth);

  const where =
    slim.inputNodes[slim.inputNodes[slim.roots[0].argsNodeId][0].childNodeId];
  const fields = Object.fromEntries(
    where.map((edge) => [slim.strings[edge.name], edge]),
  );
  assert.notEqual(fields.payload.childNodeId, undefined);
  assert.equal(
    slim.strings[slim.inputNodes[fields.payload.childNodeId][0].name],
    'equals',
  );
  // A relation's where-input has a child below it, so it is still cut.
  assert.equal(fields.owner.childNodeId, undefined);
});

test('cutting a cut graph changes nothing', () => {
  const once = pruneGraph(sampleGraph(), keptDepth);

  const twice = pruneGraph(once, keptDepth);

  assert.deepEqual(twice, once);
});

test('a generated class with an unexpected layout fails instead of keeping the whole graph', () => {
  assert.throws(
    () => slimClassSource('config.parameterizationSchema = {}\n'),
    /update prisma\/slim-parameterization-schema\.mjs/,
  );
  assert.throws(
    () =>
      slimClassSource(
        'config.parameterizationSchema = {\n  strings: JSON.parse("[]"),\n  graph: ""\n}\n',
      ),
    /update prisma\/slim-parameterization-schema\.mjs/,
  );
});

test('the generated client carries the cut graph, not the one Prisma writes', (t) => {
  const file = path.join(
    REPOSITORY_ROOT,
    'packages/prisma/generated/prisma/client/internal/class.ts',
  );
  if (!existsSync(file)) {
    t.skip('no generated client in this checkout');
    return;
  }

  const graph = readClassGraph(readFileSync(file, 'utf8'));

  const roots = graph.roots.map((root) => graph.strings[root.name]);
  assert.notEqual(roots.length, 0, 'the cut graph keeps the roots');
  assert.deepEqual(
    roots.filter((root) => keptDepth(root) === undefined),
    [],
    'the generated client has a root the cut does not know: run `bun run db:generate` in packages/prisma, not a bare `prisma generate`',
  );
  const roots2 = new Map(
    graph.roots.map((root) => [graph.strings[root.name], root]),
  );
  const updateMany = roots2.get('VisualRevision.updateMany');
  const rootArgs = graph.inputNodes[updateMany.argsNodeId];
  const whereEdge = rootArgs.find(
    (edge) => graph.strings[edge.name] === 'where',
  );
  const receipts = graph.inputNodes[whereEdge.childNodeId].find(
    (edge) => graph.strings[edge.name] === 'receipts',
  );
  assert.notEqual(
    receipts.childNodeId,
    undefined,
    'a Json field keeps its filter: `receipts: { equals }` is the visual-code optimistic write',
  );
  const edges = graph.inputNodes.reduce((sum, node) => sum + node.length, 0);
  assert.ok(
    edges < 100_000,
    `${edges} input edges in the generated client (Prisma writes 559,421); each costs about 150 bytes of heap in every server`,
  );
});

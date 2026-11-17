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

const require = createRequire(
  new URL('../../apps/server/api/package.json', import.meta.url),
);
const { parse } = require('yaml');

const REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SCRIPT = path.join(
  REPOSITORY_ROOT,
  'packages/prisma/prisma/generate-client.mjs',
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
function createCliPackage(t, prismaScript) {
  const { packageRoot } = createPackage(t);
  copyFileSync(SCRIPT, path.join(packageRoot, 'prisma/generate-client.mjs'));
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
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      },
    });
  return { packageRoot, run };
}

const PRISMA_THAT_GENERATES = `#!/bin/sh
test "$1" = generate || exit 64
mkdir -p generated/prisma/client
echo generated >> generated/prisma/client/client.ts
`;
const PRISMA_THAT_FAILS = '#!/bin/sh\nexit 3\n';

test('the postinstall command generates once and then skips', (t) => {
  const { packageRoot, run } = createCliPackage(t, PRISMA_THAT_GENERATES);

  const first = run();
  const second = run();

  assert.equal(first.status, 0);
  assert.equal(first.stdout, '');
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
  assert.equal(forced.stdout, '');
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
    /^const GENERATION_INPUT_FILES = \['prisma\.config\.mjs', 'prisma\/schema\.prisma'\];$/m,
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
    "${{ runner.os }}-prisma-client-${{ hashFiles('packages/prisma/package.json', 'packages/prisma/prisma.config.mjs', 'packages/prisma/prisma/schema.prisma', 'packages/prisma/prisma/generate-client.mjs') }}",
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

for (const jobId of [
  'plan',
  'static-checks',
  'source-contracts',
  'spec-typecheck',
  'test-workspaces',
  'test-app',
  'test-api',
  'cloud-tenant-guard',
  'build',
  'mcp-auth-runtime',
]) {
  test(`the ${jobId} validation job reuses the generated client`, () => {
    assert.deepEqual(setupStep(validationJobs[jobId]).with, {
      'cache-prisma-client': 'true',
    });
  });
}

test('the bundle size build reuses the generated client', () => {
  assert.deepEqual(setupStep(bundleSizeJobs.measure).with, {
    'cache-prisma-client': 'true',
  });
});

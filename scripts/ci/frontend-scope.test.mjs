import assert from 'node:assert/strict';
import test from 'node:test';
import { affectedFrontends } from './frontend-scope.mjs';

const workspaces = [
  {
    name: '@genfeedai/app',
    directory: 'apps/app',
    dependencies: ['@genfeedai/ui'],
  },
  {
    name: '@genfeedai/website',
    directory: 'apps/website',
    dependencies: ['@genfeedai/marketing'],
  },
  {
    name: '@genfeedai/ui',
    directory: 'packages/ui',
    dependencies: ['@genfeedai/utils'],
  },
  {
    name: '@genfeedai/utils',
    directory: 'packages/utils',
    dependencies: ['@genfeedai/ui'],
  },
  {
    name: '@genfeedai/marketing',
    directory: 'packages/marketing',
    dependencies: [],
  },
  {
    name: '@genfeedai/server-only',
    directory: 'packages/server-only',
    dependencies: [],
  },
];

test('selects transitive consumers without rebuilding unrelated frontends', () => {
  assert.deepEqual(affectedFrontends(['packages/utils/src/a.ts'], workspaces), [
    'app',
  ]);
  assert.deepEqual(
    affectedFrontends(['packages/marketing/src/a.ts'], workspaces),
    ['website'],
  );
  assert.deepEqual(
    affectedFrontends(['packages/server-only/src/a.ts'], workspaces),
    [],
  );
  assert.deepEqual(
    affectedFrontends(['packages/deleted/package.json'], workspaces),
    ['app', 'website'],
  );
  assert.deepEqual(affectedFrontends(['apps/app-other/a.ts'], workspaces), []);
});

test('root build inputs and the detector itself conservatively select both apps', () => {
  for (const file of [
    'bun.lock',
    'package.json',
    'turbo.json',
    '.bun-version',
    'tsconfig.json',
    '.github/actions/setup-bun-env/action.yml',
    'scripts/ci/frontend-scope.mjs',
    'configs/build.ts',
  ]) {
    assert.deepEqual(
      affectedFrontends([file], workspaces),
      ['app', 'website'],
      file,
    );
  }
});

test('missing manifests and duplicate workspace names fail rather than suppress checks', () => {
  assert.throws(
    () =>
      affectedFrontends(
        [],
        workspaces.filter((w) => w.name !== '@genfeedai/app'),
      ),
    /Missing frontend/,
  );
  assert.throws(
    () => affectedFrontends([], [...workspaces, workspaces[0]]),
    /Duplicate/,
  );
});

test('multiple changed consumers and scoped build helpers retain both signals', () => {
  assert.deepEqual(
    affectedFrontends(['apps/app/a.ts', 'apps/website/b.ts'], workspaces),
    ['app', 'website'],
  );
  assert.deepEqual(
    affectedFrontends(['scripts/collect-bundle-manifest.ts'], workspaces),
    ['app', 'website'],
  );
});

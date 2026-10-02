import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
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

for (const event of ['push', 'pull_request']) {
  for (const destination of ['apps/website/moved.ts', 'apps/server/moved.ts']) {
    test(`actual CLI retains the deleted frontend source for ${event} rename to ${destination}`, (t) => {
      const root = mkdtempSync(path.join(os.tmpdir(), 'frontend-rename-'));
      t.after(() => rmSync(root, { recursive: true, force: true }));
      const env = {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_SYSTEM: '/dev/null',
      };
      const git = (...args) =>
        execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
          cwd: root,
          env,
          encoding: 'utf8',
        }).trim();
      git('init', '--quiet', '--template=');
      git('config', 'user.name', 'Frontend fixture');
      git('config', 'user.email', 'frontend-fixture@example.invalid');
      git('config', 'diff.renames', 'true');
      writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({ workspaces: ['apps/*'] }),
      );
      for (const name of ['app', 'website', 'server']) {
        mkdirSync(path.join(root, 'apps', name), { recursive: true });
        writeFileSync(
          path.join(root, 'apps', name, 'package.json'),
          JSON.stringify({ name: `@genfeedai/${name}` }),
        );
      }
      writeFileSync(
        path.join(root, 'apps/app/original.ts'),
        'export const unchangedPayload = "rename fixture";\n',
      );
      git('add', '.');
      git('commit', '--quiet', '-m', 'initial fixture');
      const base = git('rev-parse', 'HEAD');
      renameSync(
        path.join(root, 'apps/app/original.ts'),
        path.join(root, destination),
      );
      git('add', '-A');
      git('commit', '--quiet', '-m', 'move identical source');
      assert.match(
        git('diff', '--name-status', '--find-renames=100%', `${base}..HEAD`),
        /^R100\s+apps\/app\/original\.ts\s+/m,
      );
      const output = path.join(root, 'scope-output');
      execFileSync(
        process.execPath,
        [fileURLToPath(new URL('./frontend-scope.mjs', import.meta.url))],
        {
          cwd: root,
          env: {
            ...env,
            EVENT_NAME: event,
            BASE_SHA: base,
            GITHUB_OUTPUT: output,
          },
          encoding: 'utf8',
        },
      );
      const lines = Object.fromEntries(
        readFileSync(output, 'utf8')
          .trim()
          .split('\n')
          .map((line) => {
            const separator = line.indexOf('=');
            return [line.slice(0, separator), line.slice(separator + 1)];
          }),
      );
      const website = destination.startsWith('apps/website/');
      assert.deepEqual(
        JSON.parse(lines.apps),
        website ? ['app', 'website'] : ['app'],
      );
      assert.equal(lines.app, 'true');
      assert.equal(lines.website, String(website));
      assert.equal(lines.frontend, 'true');
    });
  }
}

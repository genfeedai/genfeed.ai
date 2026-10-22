import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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

const root = fileURLToPath(new URL('../..', import.meta.url));
const turbo = path.join(root, 'node_modules/.bin/turbo');

test('cached graph scans invalidate on source, bridge nodes, configuration, baseline and toolchain changes', (t) => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'import-cycle-cache-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet'], { cwd: fixture });
  const write = (file, contents) => {
    mkdirSync(path.dirname(path.join(fixture, file)), { recursive: true });
    writeFileSync(path.join(fixture, file), contents);
  };
  write(
    'package.json',
    JSON.stringify({
      name: 'fixture',
      private: true,
      packageManager: 'bun@1.4.2',
      workspaces: ['packages/*'],
      scripts: { 'check:import-cycles': 'echo checked' },
    }),
  );
  write('bun.lock', readFileSync(path.join(root, 'bun.lock')));
  write('turbo.json', readFileSync(path.join(root, 'turbo.json')));
  write('.gitignore', '.turbo\nnode_modules\n');
  write(
    'packages/example/package.json',
    JSON.stringify({ name: '@genfeedai/example', version: '1.0.0' }),
  );
  const files = [
    'packages/example/src/a.ts',
    'packages/example/src/a.test.ts',
    'packages/example/generated/bridge.ts',
    'apps/server/api/src/a.ts',
    'apps/server/tsconfig.base.json',
    'tsconfig.json',
    'scripts/check-import-cycles.ts',
    'scripts/import-cycle-baseline.json',
  ];
  for (const file of files)
    write(file, file.endsWith('.json') ? '{}' : '// initial\n');
  const hash = (runtime = 'Linux/X64/1.4.2/v24') => {
    const output = execFileSync(
      turbo,
      ['run', 'check:import-cycles', '--dry=json'],
      {
        cwd: fixture,
        encoding: 'utf8',
        env: { ...process.env, CI_CHECK_RUNTIME: runtime },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    return JSON.parse(output).tasks.find(
      ({ taskId }) => taskId === '//#check:import-cycles',
    ).hash;
  };
  const original = hash();
  assert.equal(hash(), original);
  for (const file of files) {
    const before = readFileSync(path.join(fixture, file));
    write(file, '// changed\n');
    assert.notEqual(hash(), original, file);
    write(file, before);
    assert.equal(hash(), original, `${file} restored`);
  }
  write('packages/example/src/new.ts', '// new graph node\n');
  assert.notEqual(hash(), original, 'new files invalidate');
  rmSync(path.join(fixture, 'packages/example/src/new.ts'));
  assert.equal(hash(), original);
  assert.notEqual(
    hash('Linux/X64/1.4.3/v24'),
    original,
    'rolling Bun updates invalidate',
  );
});

test('app builds invalidate on shared UI source while ignoring generated UI artifacts', (t) => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'app-ui-cache-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet'], { cwd: fixture });
  const write = (file, contents) => {
    mkdirSync(path.dirname(path.join(fixture, file)), { recursive: true });
    writeFileSync(path.join(fixture, file), contents);
  };
  const appConfig = readFileSync(path.join(root, 'apps/app/turbo.json'));
  const dependencies = JSON.parse(appConfig)
    .tasks.build.dependsOn.filter((task) => task.startsWith('@genfeedai/'))
    .map((task) => task.split('#')[0]);
  write(
    'package.json',
    JSON.stringify({
      name: 'fixture',
      private: true,
      packageManager: 'bun@1.4.2',
      workspaces: ['apps/*', 'packages/*'],
      scripts: { 'env:check': 'echo checked' },
    }),
  );
  write('bun.lock', readFileSync(path.join(root, 'bun.lock')));
  write('turbo.json', readFileSync(path.join(root, 'turbo.json')));
  write('.gitignore', '.turbo\nnode_modules\n**/dist\n**/*.tsbuildinfo\n');
  write(
    'apps/app/package.json',
    JSON.stringify({
      name: '@genfeedai/app',
      version: '1.0.0',
      dependencies: { '@genfeedai/ui': 'workspace:*' },
      scripts: { build: 'echo built' },
    }),
  );
  write('apps/app/turbo.json', appConfig);
  for (const name of [...dependencies, '@genfeedai/ui']) {
    write(
      `packages/${name.split('/')[1]}/package.json`,
      JSON.stringify({
        name,
        version: '1.0.0',
        scripts: { build: 'echo built' },
      }),
    );
  }
  const sources = [
    'packages/ui/src/components/dropdowns/generation-setup/GenerationSetupSectionChips.tsx',
    'packages/ui/src/primitives/dropdown-menu.tsx',
    'packages/ui/web-tokens.css',
  ];
  for (const file of sources) write(file, '// initial\n');
  const hash = () => {
    const output = execFileSync(
      turbo,
      ['run', 'build', '--filter=@genfeedai/app', '--dry=json'],
      {
        cwd: fixture,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    return JSON.parse(output).tasks.find(
      ({ taskId }) => taskId === '@genfeedai/app#build',
    ).hash;
  };
  const original = hash();
  assert.equal(hash(), original);
  for (const file of sources) {
    write(file, '// changed\n');
    assert.notEqual(hash(), original, `${file} invalidates the app build`);
    write(file, '// initial\n');
    assert.equal(hash(), original, `${file} restored`);
  }
  for (const file of [
    'packages/ui/dist/index.js',
    'packages/ui/.turbo/turbo-build.log',
    'packages/ui/node_modules/example/index.js',
    'packages/ui/tsconfig.tsbuildinfo',
  ]) {
    write(file, '// generated\n');
    assert.equal(hash(), original, `${file} does not invalidate the app build`);
  }
  write('packages/ui/src/new-control.tsx', '// new source\n');
  assert.notEqual(
    hash(),
    original,
    'new shared UI source invalidates the app build',
  );
});

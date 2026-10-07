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

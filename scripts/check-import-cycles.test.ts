import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const checker = path.join(import.meta.dirname, 'check-import-cycles.ts');
const fixtures: string[] = [];
// Frozen from the legacy CLI contract; keep the comparison independent of the worker.
const LEGACY_EXCLUDE_REGEX = String.raw`(^|/)(node_modules|dist|coverage|public|docs|e2e|__tests__|__mocks__|\.next|generated)(/|$)|\.(spec|test)\.[jt]sx?$|\.d\.ts$`;

function fixture(
  files: Record<string, string>,
  paths: Record<string, string[]> = {},
): string {
  const root = mkdtempSync(path.join(tmpdir(), 'genfeed-import-cycles-'));
  fixtures.push(root);
  writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        baseUrl: '.',
        paths,
        module: 'commonjs',
        target: 'es2022',
      },
    }),
  );
  for (const [file, content] of Object.entries(files)) {
    const absolute = path.join(root, file);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
  }
  return root;
}

function scan(root: string, args: string[] = [], checkerPath = checker) {
  return spawnSync('bun', [checkerPath, '--json', ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 15_000,
  });
}

afterEach(() => {
  for (const root of fixtures.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('import-cycle scanner', () => {
  it('fails closed when the direct worker fails without a JSON report', () => {
    const root = fixture({
      'packages/example/src/main.ts': 'export const main = 1;',
      'node_modules/madge/package.json': JSON.stringify({
        main: 'index.cjs',
        name: 'madge',
        version: '0.0.0-fixture',
      }),
      'node_modules/madge/index.cjs':
        "module.exports = () => { throw new Error('fixture madge failure'); };",
    });
    const fixtureChecker = path.join(root, 'check-import-cycles.ts');
    copyFileSync(checker, fixtureChecker);
    const result = scan(root, [], fixtureChecker);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout.trim()).toBe('');
    expect(result.stderr).toContain('packages/example');
    expect(result.stderr).toContain('fixture madge failure');
  });

  it('preserves production cycles, workspace selection and canonical paths', () => {
    const root = fixture({
      'packages/example/src/a.ts':
        "import { b } from './b'; export const a = b;",
      'packages/example/src/b.ts':
        "import { a } from './a'; export const b = a;",
      'packages/other/src/main.ts': 'export const unrelated = 1;',
    });
    const result = scan(root, ['--files', 'packages/example/src/a.ts']);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({
      baselinedCount: 0,
      detectedCount: 1,
      newCycles: [
        {
          workspace: 'packages/example',
          files: ['packages/example/src/a.ts', 'packages/example/src/b.ts'],
          key: 'packages/example/src/a.ts -> packages/example/src/b.ts',
        },
      ],
      scannedWorkspaces: ['packages/example'],
    });
  });

  it('keeps spec, declaration and generated nodes out of final cycles', () => {
    const exclusions = Array.from(
      readFileSync(checker, 'utf8').matchAll(
        /const EXCLUDE_REGEX = String\.raw`([^`]+)`;/g,
      ),
      (match) => match[1],
    );
    expect(exclusions).toEqual([LEGACY_EXCLUDE_REGEX]);
    const root = fixture({
      'packages/example/src/main.ts':
        "import './generated/a'; export const main = 1;",
      'packages/example/src/generated/a.ts': "import './b';",
      'packages/example/src/generated/b.ts': "import './a';",
      'packages/example/src/a.spec.ts': "import './b.spec';",
      'packages/example/src/b.spec.ts': "import './a.spec';",
      'packages/example/src/a.test.tsx': "import './b.test';",
      'packages/example/src/b.test.tsx': "import './a.test';",
      'packages/example/src/a.d.ts': "import './b.d';",
      'packages/example/src/b.d.ts': "import './a.d';",
      'apps/app/.next/src/a.ts': "import './b';",
      'apps/app/.next/src/b.ts': "import './a';",
    });
    const result = scan(root);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      baselinedCount: 0,
      detectedCount: 0,
      newCycles: [],
      scannedWorkspaces: ['packages/example'],
    });
  });

  it('keeps production dependency cycles crossing workspace boundaries', () => {
    const root = fixture({
      'packages/left/src/left.ts': "import '../../right/src/right';",
      'packages/right/src/right.ts': "import '../../left/src/left';",
    });
    const result = scan(root, ['--files', 'packages/left/src/left.ts']);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report.detectedCount).toBe(1);
    expect(report.newCycles[0].files).toEqual([
      'packages/left/src/left.ts',
      'packages/right/src/right.ts',
    ]);
  });

  it.each(['bridge.ts', 'bridge.spec.ts', 'generated/bridge.ts'])(
    'preserves alias-resolved downstream production cycles through %s',
    (bridge) => {
      const root = fixture(
        {
          'packages/entry/src/main.ts': `import './${bridge.replace(/\.ts$/, '')}';`,
          [`packages/entry/src/${bridge}`]: "import '@genfeedai/remote';",
          'packages/entry/src/a.spec.ts': "import './b.spec';",
          'packages/entry/src/b.spec.ts': "import './a.spec';",
          'packages/remote/src/a.ts': "import '@genfeedai/remote/b';",
          'packages/remote/src/b.ts': "import './a';",
        },
        {
          '@genfeedai/remote': ['packages/remote/src/a.ts'],
          '@genfeedai/remote/*': ['packages/remote/src/*'],
        },
      );
      const result = scan(root, ['--files', 'packages/entry/src/main.ts']);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      const report = JSON.parse(result.stdout);
      expect(report.scannedWorkspaces).toEqual(['packages/entry']);
      expect(report.newCycles).toEqual([
        {
          files: ['packages/remote/src/a.ts', 'packages/remote/src/b.ts'],
          key: 'packages/remote/src/a.ts -> packages/remote/src/b.ts',
          workspace: 'packages/remote',
        },
      ]);

      const madgeCli = path.join(
        path.dirname(
          createRequire(import.meta.url).resolve('madge/package.json'),
        ),
        'bin/cli.js',
      );
      const legacy = spawnSync(
        'node',
        [
          madgeCli,
          '--json',
          '--circular',
          '--extensions',
          'ts,tsx',
          '--ts-config',
          path.join(root, 'tsconfig.json'),
          '--exclude',
          LEGACY_EXCLUDE_REGEX,
          path.join(root, 'packages/entry/src'),
        ],
        { cwd: root, encoding: 'utf8', timeout: 15_000 },
      );
      expect(legacy.error).toBeUndefined();
      expect(JSON.parse(legacy.stdout)).toEqual([
        ['../../remote/src/a.ts', '../../remote/src/b.ts'],
      ]);
    },
  );

  it('retains production cycles discovered from an excluded-only entry workspace', () => {
    const root = fixture({
      'packages/entry/src/entry.spec.ts': "import '../../remote/src/a';",
      'packages/remote/src/a.ts': "import './b';",
      'packages/remote/src/b.ts': "import './a';",
    });
    const result = scan(root, ['--files', 'packages/entry/src/entry.spec.ts']);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).newCycles[0].files).toEqual([
      'packages/remote/src/a.ts',
      'packages/remote/src/b.ts',
    ]);
  });

  it('handles an acyclic workspace and a workspace containing only excluded entries', () => {
    const root = fixture({
      'packages/example/src/main.ts': "import './leaf';",
      'packages/example/src/leaf.ts': 'export const leaf = 1;',
      'packages/excluded/src/a.spec.ts': "import './b.spec';",
      'packages/excluded/src/b.spec.ts': "import './a.spec';",
    });
    const result = scan(root);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).newCycles).toEqual([]);
  });

  it('fails closed and reaps the direct worker at the explicit timeout', () => {
    const root = fixture({
      'packages/example/src/main.ts': 'export const main = 1;',
    });
    const result = scan(root, ['--timeout-ms', '1']);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'madge timed out after 1ms while scanning packages/example',
    );
  });
});

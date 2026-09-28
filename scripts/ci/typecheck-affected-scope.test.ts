import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  parseTurboTypecheckPackages,
  queryTypecheckScope,
  type RunProcess,
  readHashGlobsByWorkspace,
  resolveTypecheckScope,
} from './typecheck-affected-scope';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

const HASH_GLOBS = new Map([
  ['@genfeedai/agent', ['packages/agent/**']],
  ['@genfeedai/props', ['packages/props/**', 'packages/agent/**']],
  ['@genfeedai/api', ['apps/server/api/**', 'apps/server/**/src/**']],
]);

describe('alias-aware type-check scope', () => {
  it('adds a workspace whose type-check hashes a changed alias target', () => {
    expect(
      resolveTypecheckScope({
        changedFiles: ['packages/agent/src/index.ts'],
        hashGlobsByWorkspace: HASH_GLOBS,
        turboAffected: ['@genfeedai/agent'],
      }),
    ).toEqual({
      added: ['@genfeedai/props'],
      workspaces: ['@genfeedai/agent', '@genfeedai/props'],
    });
  });

  it('keeps turbo selection untouched when no alias target changed', () => {
    expect(
      resolveTypecheckScope({
        changedFiles: ['packages/props/admin/analytics.props.ts'],
        hashGlobsByWorkspace: HASH_GLOBS,
        turboAffected: ['@genfeedai/app', '@genfeedai/props'],
      }),
    ).toEqual({
      added: [],
      workspaces: ['@genfeedai/app', '@genfeedai/props'],
    });
  });

  it('selects nothing for a change no type-check hashes', () => {
    expect(
      resolveTypecheckScope({
        changedFiles: ['README.md'],
        hashGlobsByWorkspace: HASH_GLOBS,
        turboAffected: [],
      }),
    ).toEqual({ added: [], workspaces: [] });
  });

  it('reads type-check packages from a turbo dry run', () => {
    expect(
      parseTurboTypecheckPackages(
        JSON.stringify({
          tasks: [
            { package: '@genfeedai/ui', task: 'build' },
            { package: '@genfeedai/ui', task: 'type-check' },
            { package: '@genfeedai/agent', task: 'type-check' },
          ],
        }),
      ),
    ).toEqual(['@genfeedai/agent', '@genfeedai/ui']);
    expect(() => parseTurboTypecheckPackages('{}')).toThrow(/tasks array/);
  });

  it('diffs against the base and asks turbo for its affected type-checks', () => {
    const calls: { args: readonly string[]; base?: string }[] = [];
    const runner: RunProcess = (command, args, options) => {
      calls.push({
        args: [command, ...args],
        base: options.env.TURBO_SCM_BASE,
      });
      return command === 'git'
        ? { status: 0, stdout: 'packages/agent/src/index.ts\0' }
        : {
            status: 0,
            stdout: JSON.stringify({
              tasks: [{ package: '@genfeedai/agent', task: 'type-check' }],
            }),
          };
    };

    const scope = queryTypecheckScope(repositoryRoot, 'base-sha', runner);

    expect(calls).toEqual([
      {
        args: [
          'git',
          'diff',
          '--name-only',
          '--no-renames',
          '-z',
          'base-sha',
          'HEAD',
        ],
        base: undefined,
      },
      {
        args: [
          'bunx',
          'turbo',
          'run',
          'type-check',
          '--affected',
          '--dry=json',
        ],
        base: 'base-sha',
      },
    ]);
    expect(scope.workspaces).toContain('@genfeedai/agent');
    expect(scope.added).toContain('@genfeedai/props');
  });

  it('fails closed when turbo cannot compute the affected set', () => {
    const runner: RunProcess = (command) =>
      command === 'git'
        ? { status: 0, stdout: '' }
        : { status: 1, stderr: 'invalid base', stdout: '' };

    expect(() =>
      queryTypecheckScope(repositoryRoot, 'base-sha', runner),
    ).toThrow(/invalid base/);
  });

  // Measured with `turbo run type-check --dry=json` hash diffs: each changed
  // file changes these consumers' hashes although the package graph never
  // selects them.
  it.each([
    [
      'packages/agent/src/index.ts',
      [
        '@genfeedai/mobile',
        '@genfeedai/models',
        '@genfeedai/props',
        '@genfeedai/services',
      ],
    ],
    ['packages/fonts/fonts.ts', ['@genfeedai/app', '@genfeedai/website']],
    [
      'apps/server/discord/src/app.module.ts',
      ['@genfeedai/api', '@genfeedai/workers'],
    ],
  ])(
    'selects the repository alias consumers of %s',
    (changedFile, consumers) => {
      const hashGlobsByWorkspace = readHashGlobsByWorkspace(repositoryRoot);
      const { added } = resolveTypecheckScope({
        changedFiles: [changedFile],
        hashGlobsByWorkspace,
        turboAffected: [],
      });

      expect(added).toEqual(expect.arrayContaining(consumers));
    },
  );

  it('runs the scope in the PR typecheck step', () => {
    const workflow = readFileSync(
      path.join(repositoryRoot, '.github/workflows/ci.yml'),
      'utf8',
    );

    expect(workflow).toContain(
      'filters="$(bun run scripts/ci/typecheck-affected-scope.ts)"',
    );
    expect(workflow).toMatch(/bunx turbo run type-check \$\{filters\}/);
  });
});

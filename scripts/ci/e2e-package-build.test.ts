import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const actionPath = '.github/actions/build-e2e-packages';
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

function jobBlock(workflow: string, job: string): string {
  const block = workflow.match(
    new RegExp(`^ {2}${job}:\\n((?: {4}.*(?:\\n|$)|\\n)+)`, 'm'),
  )?.[1];
  expect(block, `${job} must exist`).toBeDefined();
  return block ?? '';
}

describe('E2E package build setup', () => {
  it('keeps dependency installation before the exact package build command', () => {
    const action = read(`${actionPath}/action.yml`);
    expect(action).toContain('using: composite');
    expect(action).toMatch(
      /install-command:\n[\s\S]*?default: 'bun install --frozen-lockfile'/,
    );
    expect(action).toContain('uses: ./.github/actions/setup-bun-env');
    expect(action).toMatch(
      /install-command: \$\{\{ inputs\.install-command \}\}/,
    );
    expect(action).not.toMatch(
      /cache-dependencies:|cache-playwright:|working-directory:|continue-on-error:|\n\s+if:/,
    );
    expect(
      action.indexOf('uses: ./.github/actions/setup-bun-env'),
    ).toBeLessThan(
      action.indexOf('run: bunx turbo run build --filter="./packages/*"'),
    );
    expect(action.match(/\n {4}- /g)).toHaveLength(2);
  });

  it.each([0, 23])(
    'executes the unchanged build arguments and propagates exit %i',
    (exitCode) => {
      const action = read(`${actionPath}/action.yml`);
      const command = action.match(/^ {6}run: (.+)$/m)?.[1];
      expect(command).toBe('bunx turbo run build --filter="./packages/*"');
      expect(action).toMatch(/shell: bash\n {6}run:/);
      const temp = mkdtempSync(path.join(tmpdir(), 'e2e-package-build-'));
      try {
        writeFileSync(
          path.join(temp, 'bunx'),
          '#!/bin/sh\nprintf "%s\\n" "$@" > "$BUILD_CALLS"\nprintf "%s\\n" "$TURBO_TOKEN" "$TURBO_TEAM" >> "$BUILD_CALLS"\npwd >> "$BUILD_CALLS"\nexit "$BUILD_EXIT"\n',
          { mode: 0o755 },
        );
        const calls = path.join(temp, 'calls');
        const result = spawnSync(
          'bash',
          [
            '--noprofile',
            '--norc',
            '-e',
            '-o',
            'pipefail',
            '-c',
            command ?? 'exit 99',
          ],
          {
            cwd: root,
            encoding: 'utf8',
            env: {
              ...process.env,
              PATH: `${temp}:${process.env.PATH}`,
              BUILD_CALLS: calls,
              BUILD_EXIT: String(exitCode),
              TURBO_TOKEN: 'synthetic-token',
              TURBO_TEAM: 'synthetic-team',
            },
          },
        );
        expect(result.error).toBeUndefined();
        expect(result.status, result.stderr).toBe(exitCode);
        expect(readFileSync(calls, 'utf8').split('\n')).toEqual([
          'turbo',
          'run',
          'build',
          '--filter=./packages/*',
          'synthetic-token',
          'synthetic-team',
          root,
          '',
        ]);
      } finally {
        rmSync(temp, { recursive: true, force: true });
      }
    },
  );

  it('preserves each caller install policy, source and prerequisite ordering', () => {
    const workflow = read('.github/workflows/e2e.yml');
    for (const job of [
      'e2e-api',
      'e2e-api-full',
      'e2e-isolated-publish',
      'runtime-acceptance',
    ]) {
      const block = jobBlock(workflow, job);
      expect(
        block.match(
          new RegExp(`uses: \\./${actionPath.replaceAll('.', '\\.')}\\n`, 'g'),
        ),
      ).toHaveLength(1);
      const setup = block.indexOf(`uses: ./${actionPath}`);
      expect(block.indexOf('uses: actions/checkout@')).toBeLessThan(setup);
      expect(block).not.toContain(
        'run: bunx turbo run build --filter="./packages/*"',
      );
      if (job === 'runtime-acceptance') {
        expect(block).not.toContain('install-command:');
        expect(block.indexOf('id: preflight')).toBeLessThan(setup);
        expect(block.search(/ref: \$\{\{ github\.sha \}\}/)).toBeLessThan(
          setup,
        );
        expect(block).toContain('persist-credentials: false');
        expect(block).toContain("TURBO_TOKEN: ''");
        expect(setup).toBeLessThan(
          block.indexOf('- name: Run serial runtime acceptance'),
        );
      } else {
        expect(block).toContain('install-command: "bun install"');
        expect(setup).toBeLessThan(
          block.indexOf('- name: Apply Prisma migrations to test DB'),
        );
      }
    }
    expect(
      workflow.match(/uses: \.\/\.github\/actions\/build-e2e-packages/g),
    ).toHaveLength(4);
  });
});

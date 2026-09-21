import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'secretlint-homedir-'));

afterAll(() => {
  rmSync(fixtureRoot, { force: true, recursive: true });
});

function scan(fileName: string, contents: string, homeDirectory: string) {
  const filePath = path.join(fixtureRoot, fileName);
  writeFileSync(filePath, contents, 'utf8');

  const result = spawnSync('bunx', ['secretlint', filePath], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, HOME: homeDirectory },
  });

  return { output: `${result.stdout}${result.stderr}`, status: result.status };
}

describe('secretlint no-homedir rule', () => {
  it('ignores a bare /root match so root-owned scanners stay usable', () => {
    // `@secretlint/secretlint-rule-no-homedir` matches the scanning process's
    // own `os.homedir()` as a literal string. Running as root makes that `/root`,
    // which then matches every `/root`-prefixed path segment in the repository:
    // the `root-resolver-client` imports under apps/app, the `/root/.cache`
    // volume in docker/docker-compose.llm.yml, and the generated path list in
    // scripts/architecture/untranslated-strings.baseline.json. That last one
    // deadlocked contributors — the untranslated-string ratchet told them to
    // regenerate the baseline, and secretlint then rejected the regenerated file.
    const { output, status } = scan(
      'root-paths.json',
      JSON.stringify({
        'apps/app/app/(protected)/root-resolver-client.tsx': 4,
        volume: '/root/.cache/huggingface',
      }),
      '/root',
    );

    expect(output).not.toContain('HOMEDIR');
    expect(status).toBe(0);
  });

  it('still reports a real homedir path', () => {
    // The allowance is scoped to `/root` alone; a personal homedir leaking into
    // a committed file must keep failing the scan.
    const { output, status } = scan(
      'home-paths.ts',
      'const credentials = "/home/ci-user/.aws/credentials";\n',
      '/home/ci-user',
    );

    expect(output).toContain('HOMEDIR');
    expect(status).toBe(1);
  });
});

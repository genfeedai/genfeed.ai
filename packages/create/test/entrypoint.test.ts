import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const setup = fileURLToPath(new URL('../src/setup.ts', import.meta.url));
const entrypoint = readFileSync(
  new URL('../../../docker/selfhosted-entrypoint.sh', import.meta.url),
  'utf8',
).replace('/selfhosted-setup.ts', setup);

describe('entrypoint config boundary', () => {
  it.each([
    '',
    'your_key_here',
    'PLACEHOLDER_NOT_CONFIGURED',
    'sk-or-your-key-here',
  ])(
    'exits before starting infrastructure for an absent/placeholder key',
    (key) => {
      const result = spawnSync('bash', ['-c', entrypoint], {
        env: { PATH: process.env.PATH, OPENROUTER_API_KEY: key },
        encoding: 'utf8',
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('FATAL: OPENROUTER_API_KEY');
      expect(result.stdout).toBe('');
      if (key) expect(result.stderr).not.toContain(key);
      expect(result.stderr).not.toContain('/data');
    },
  );

  it('rejects real-domain/local-auth mismatch before infrastructure', () => {
    const result = spawnSync('bash', ['-c', entrypoint], {
      env: {
        PATH: process.env.PATH,
        OPENROUTER_API_KEY: 'sk-or-offline-fixture',
        GENFEEDAI_PUBLIC_URL: 'https://studio.example.com',
        BETTER_AUTH_URL: 'http://localhost:3010',
      },
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'GENFEEDAI_PUBLIC_URL=https://studio.example.com conflicts with BETTER_AUTH_URL=http://localhost:3010',
    );
    expect(result.stderr).not.toContain('sk-or-offline-fixture');
  });
});

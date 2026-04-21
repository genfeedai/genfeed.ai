import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getInstallCommand, openBrowser, writeDefaultEnv } from '../src/index';

describe('getInstallCommand', () => {
  it('prefers bun when available', () => {
    const installCommand = getInstallCommand((command) => command === 'bun');

    expect(installCommand).toEqual({
      args: ['install'],
      command: 'bun',
      label: 'bun install',
    });
  });

  it('falls back to npm when bun is unavailable', () => {
    const installCommand = getInstallCommand(() => false);

    expect(installCommand).toEqual({
      args: ['install'],
      command: 'npm',
      label: 'npm install',
    });
  });
});

describe('writeDefaultEnv', () => {
  it('creates .env with default values when missing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'genfeedai-test-'));

    await writeDefaultEnv(directory);

    const content = await readFile(join(directory, '.env'), 'utf8');
    expect(content).toContain(
      'DATABASE_URL=postgresql://genfeed:genfeed_local@localhost:5432/genfeed',
    );
    expect(content).toContain('PORT=3010');
    expect(content).toContain(
      'NEXT_PUBLIC_API_ENDPOINT=http://localhost:3010/v1',
    );
  });

  it('does not overwrite an existing .env file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'genfeedai-test-'));
    const envPath = join(directory, '.env');

    await writeFile(envPath, 'DATABASE_URL=postgresql://custom\n');

    await writeDefaultEnv(directory);

    const content = await readFile(envPath, 'utf8');
    expect(content).toBe('DATABASE_URL=postgresql://custom\n');
  });
});

describe('openBrowser', () => {
  it('is exported and callable without throwing', () => {
    expect(() => openBrowser('http://localhost:4000/onboarding')).not.toThrow();
  });
});

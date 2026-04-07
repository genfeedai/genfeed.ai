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
    expect(content).toContain('MONGODB_URI=mongodb://127.0.0.1:27017/genfeed');
    expect(content).toContain('PORT=4001');
    expect(content).toContain('NEXT_PUBLIC_API_URL=http://localhost:4001/api');
  });

  it('does not overwrite an existing .env file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'genfeedai-test-'));
    const envPath = join(directory, '.env');

    await writeFile(envPath, 'MONGODB_URI=mongodb+srv://custom\n');

    await writeDefaultEnv(directory);

    const content = await readFile(envPath, 'utf8');
    expect(content).toBe('MONGODB_URI=mongodb+srv://custom\n');
  });
});

describe('openBrowser', () => {
  it('is exported and callable without throwing', () => {
    expect(() => openBrowser('http://localhost:4000/onboarding')).not.toThrow();
  });
});

import { chmod, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { emptyHostConfig } from '../../../src/commands/host/config';
import {
  detectProviders,
  findExecutable,
  searchDirectories,
} from '../../../src/commands/host/detect';
import { makeTemporaryDirectory, writeExecutable } from './fixtures';

async function markerExists(file: string): Promise<boolean> {
  return readFile(file, 'utf8').then(
    () => true,
    () => false
  );
}

describe('provider detection', () => {
  it('finds CLIs on PATH without running them', async () => {
    const home = await makeTemporaryDirectory();
    const bin = path.join(home, 'bin');
    const marker = path.join(home, 'ran');
    await writeExecutable(bin, 'claude', `echo ran > '${marker}'`);
    await writeExecutable(bin, 'codex', `echo ran > '${marker}'`);

    const providers = await detectProviders(
      { homeDirectory: home, pathValue: bin, systemDirectories: [] },
      emptyHostConfig()
    );

    expect(providers.find((p) => p.id === 'claude-cli')?.isAvailable).toBe(true);
    expect(providers.find((p) => p.id === 'codex-cli')?.isAvailable).toBe(true);
    expect(providers.find((p) => p.id === 'gemini-cli')?.isAvailable).toBe(false);
    expect(await markerExists(marker)).toBe(false);
  });

  it('ignores files that are not executable regular files', async () => {
    const home = await makeTemporaryDirectory();
    const bin = path.join(home, 'bin');
    const notExecutable = await writeExecutable(bin, 'claude', 'exit 0');
    await chmod(notExecutable, 0o644);
    await mkdir(path.join(bin, 'codex'));

    const providers = await detectProviders(
      { homeDirectory: home, pathValue: bin, systemDirectories: [] },
      emptyHostConfig()
    );

    expect(providers.find((p) => p.id === 'claude-cli')?.isAvailable).toBe(false);
    expect(providers.find((p) => p.id === 'codex-cli')?.isAvailable).toBe(false);
  });

  it('searches PATH entries in order, skips relative ones and adds conventional user bins', async () => {
    const home = await makeTemporaryDirectory();
    const first = path.join(home, 'first');
    const second = path.join(home, 'second');
    await writeExecutable(first, 'gemini', 'exit 0');
    await writeExecutable(second, 'gemini', 'exit 0');
    await writeExecutable(path.join(home, '.local', 'bin'), 'codex', 'exit 0');

    const pathValue = ['relative/bin', first, second].join(path.delimiter);
    expect(searchDirectories({ homeDirectory: home, pathValue, systemDirectories: [] })).toEqual([
      first,
      second,
      path.join(home, '.local', 'bin'),
      path.join(home, '.bun', 'bin'),
      path.join(home, '.npm-global', 'bin'),
    ]);
    expect(await findExecutable('gemini', [first, second])).toBe(path.join(first, 'gemini'));

    const providers = await detectProviders(
      { homeDirectory: home, pathValue, systemDirectories: [] },
      emptyHostConfig()
    );
    expect(providers.find((p) => p.id === 'codex-cli')?.isAvailable).toBe(true);
  });

  it('reports API providers as available only when a key is saved, and never returns the key', async () => {
    const home = await makeTemporaryDirectory();
    const providers = await detectProviders(
      { homeDirectory: home, pathValue: '', systemDirectories: [] },
      {
        allowedOrigins: [],
        providers: { 'openai-api': { apiKey: 'sk-secret-value', model: 'gpt-x' } },
      }
    );

    expect(providers.find((p) => p.id === 'openai-api')?.isAvailable).toBe(true);
    expect(providers.find((p) => p.id === 'anthropic-api')?.isAvailable).toBe(false);
    expect(JSON.stringify(providers)).not.toContain('sk-secret-value');
    expect(providers.map((p) => p.id)).toEqual([
      'claude-cli',
      'codex-cli',
      'gemini-cli',
      'openai-api',
      'anthropic-api',
      'gemini-api',
    ]);
  });
});

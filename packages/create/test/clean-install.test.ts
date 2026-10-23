import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';
import { installRelease } from '../src/index.js';

afterEach(() => vi.unstubAllEnvs());

it('installs a real checksummed archive and validates its final env through the runtime boundary offline', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'genfeed-offline-install-'));
  try {
    const bundle = join(directory, 'bundle');
    const bin = join(directory, 'bin');
    await mkdir(bundle);
    await mkdir(bin);
    await writeFile(
      join(bundle, '.env.example'),
      await readFile(new URL('../../../docker/.env.example', import.meta.url)),
    );
    await writeFile(join(bundle, 'compose.yml'), 'services: {}\n');
    await writeFile(
      join(bundle, 'release.json'),
      JSON.stringify({
        schemaVersion: 1,
        releaseTag: 'v0.2.15',
        image: 'ghcr.io/genfeedai/genfeed.ai:0.2.15',
      }),
    );
    const archive = join(directory, 'bundle.tar.gz');
    expect(
      spawnSync('tar', ['-czf', archive, '-C', directory, 'bundle']).status,
    ).toBe(0);
    const bytes = await readFile(archive);
    const checksum = `${createHash('sha256').update(bytes).digest('hex')}  genfeed-selfhosted.tar.gz\n`;
    const setupPath = fileURLToPath(
      new URL('../src/setup.ts', import.meta.url),
    );
    await writeFile(
      join(bin, 'docker'),
      `#!/bin/sh\nif [ "$2" = version ]; then exit 0; fi\nset -a\n. ./.env\nset +a\n"${process.execPath}" "${setupPath}" > /dev/null || exit 1\ntouch validated\nif [ "$6" = up ]; then touch start-ready; exit 23; fi\n`,
      { mode: 0o700 },
    );
    vi.stubEnv('PATH', `${bin}:${process.env.PATH}`);
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-offline-fixture');
    vi.stubEnv('SELFHOSTED_DOMAIN', 'studio.example.com');
    const fetchDouble: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith('.sha256')) return new Response(checksum);
      if (url.endsWith('.tar.gz')) return new Response(bytes);
      throw new Error('Unexpected network request');
    };
    const target = join(directory, 'install');
    await installRelease(
      target,
      { start: false, release: 'v0.2.15', yes: true },
      fetchDouble,
    );
    expect((await stat(join(target, '.env'))).mode & 0o777).toBe(0o600);
    expect(await readFile(join(target, 'validated'), 'utf8')).toBe('');
    expect(await readFile(join(target, '.env'), 'utf8')).toContain(
      "BETTER_AUTH_URL='https://studio.example.com'",
    );
    const startTarget = join(directory, 'start-install');
    await expect(
      installRelease(
        startTarget,
        { start: true, release: 'v0.2.15', yes: true },
        fetchDouble,
      ),
    ).rejects.toThrow('failed with 23');
    expect(await readFile(join(startTarget, 'start-ready'), 'utf8')).toBe('');
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

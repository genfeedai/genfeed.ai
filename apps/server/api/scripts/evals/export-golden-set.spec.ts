import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { UsageError } from '../../../../../scripts/content-eval/cli';
import { main, parseExportArgs } from './export-golden-set';
import { buildSyntheticSnapshot } from './synthetic-seed';

const databaseFactory = vi.hoisted(() => vi.fn());
vi.mock('./database-client', () => ({
  createGoldenSetDatabaseClient: databaseFactory,
}));
const valid = [
  '--source=database',
  '--scope=invented-org/invented-brand',
  '--from=2026-01-01',
  '--to=2026-02-01',
  '--key-file=/outside-invented/key',
  '--out-dir=/outside-invented/fixtures',
  '--authorization=https://github.com/genfeedai/genfeed.ai/issues/4923#issuecomment-123',
];
function without(flag: string): string[] {
  return valid.filter((argument) => !argument.startsWith(`--${flag}=`));
}

describe('golden set export CLI', () => {
  it('parses synthetic mode without database requirements', () => {
    expect(
      parseExportArgs(['--source=synthetic', '--out-dir=./invented-output']),
    ).toEqual({ source: 'synthetic', outDir: resolve('./invented-output') });
    expect(databaseFactory).not.toHaveBeenCalled();
  });
  it.each(['authorization', 'scope', 'from', 'to', 'key-file', 'out-dir'])(
    'refuses database mode without %s',
    (flag) => {
      expect(() => parseExportArgs(without(flag))).toThrow(UsageError);
    },
  );
  it.each([
    'https://github.com/genfeedai/genfeed.ai/issues/4922#issuecomment-123',
    'https://github.com/genfeedai/genfeed.ai/issues/4923',
    'https://elsewhere.example/authorization',
    'https://github.com/genfeedai/genfeed.ai/issues/4923#issuecomment-abc',
  ])('refuses malformed authorization %s', (url) => {
    expect(() =>
      parseExportArgs([...without('authorization'), `--authorization=${url}`]),
    ).toThrow(UsageError);
  });
  it.each([
    ['2026-02-01', '2026-02-01'],
    ['2026-03-01', '2026-02-01'],
    ['2026-02-30', '2026-03-01'],
    ['2026-1-1', '2026-03-01'],
  ])('refuses invalid window %s to %s', (from, to) => {
    expect(() =>
      parseExportArgs([
        ...without('from').filter((argument) => !argument.startsWith('--to=')),
        `--from=${from}`,
        `--to=${to}`,
      ]),
    ).toThrow(UsageError);
  });
  it.each(['key-file', 'out-dir'])('refuses in-repo %s paths', (flag) => {
    expect(() =>
      parseExportArgs([
        ...without(flag),
        `--${flag}=${resolve(import.meta.dirname, 'invented')}`,
      ]),
    ).toThrow('outside');
  });
  it('merges and sorts repeated org/brand scopes, with org-wide scopes including all brands', () => {
    const parsed = parseExportArgs([
      ...without('scope'),
      '--scope=org-b/brand-z',
      '--scope=org-b/brand-a',
      '--scope=org-b/brand-z',
      '--scope=org-a',
      '--scope=org-a/brand-c',
    ]);
    expect(parsed.source).toBe('database');
    if (parsed.source !== 'database') throw new Error('Unexpected test mode');
    expect(parsed.scopes).toEqual([
      { organizationId: 'org-a', brandIds: [] },
      { organizationId: 'org-b', brandIds: ['brand-a', 'brand-z'] },
    ]);
    expect(parsed.window).toEqual({
      from: new Date('2026-01-01'),
      to: new Date('2026-02-01'),
    });
  });
  it.each(['', '/brand', 'org/', 'org/brand/extra'])(
    'refuses malformed scope %s',
    (value) => {
      expect(() =>
        parseExportArgs([...without('scope'), `--scope=${value}`]),
      ).toThrow(UsageError);
    },
  );
  it('refuses unauthorized main before loading a database client', async () => {
    await expect(main(without('authorization'))).rejects.toThrow(UsageError);
    expect(databaseFactory).not.toHaveBeenCalled();
  });
  it('refuses a symlinked in-repo output before loading a database client', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'golden-cli-'));
    try {
      const link = join(directory, 'repo-link');
      symlinkSync(resolve(import.meta.dirname, '../../../../..'), link, 'dir');
      await expect(
        main([
          ...without('out-dir'),
          `--out-dir=${join(link, 'invented-nonexistent-output')}`,
        ]),
      ).rejects.toThrow('outside');
      expect(databaseFactory).not.toHaveBeenCalled();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('builds an invented deterministic snapshot with all planned primary and linked records', () => {
    const snapshot = buildSyntheticSnapshot();
    expect(snapshot).toEqual(buildSyntheticSnapshot());
    expect(snapshot.brands).toHaveLength(3);
    expect(snapshot.posts).toHaveLength(72);
    expect(snapshot.threadChildren).toHaveLength(72);
    expect(snapshot.batchItems).toHaveLength(72);
    expect(snapshot.linkedArticles).toHaveLength(36);
    expect(snapshot.newsletters).toHaveLength(24);
    expect(snapshot.linkedNewsletters).toHaveLength(12);
    expect(snapshot.profiles).toHaveLength(3);
    expect(snapshot.contextEntries).toHaveLength(6);
  });
});

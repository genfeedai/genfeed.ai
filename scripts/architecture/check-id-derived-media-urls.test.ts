import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCheckIdDerivedMediaUrls } from './check-id-derived-media-urls';

describe('check-id-derived-media-urls', () => {
  let testDir = '';

  beforeEach(() => {
    testDir = mkdtempSync(path.join(tmpdir(), 'id-derived-media-'));
  });

  afterEach(() => {
    rmSync(testDir, { force: true, recursive: true });
  });

  function write(file: string, content: string): void {
    const target = path.join(testDir, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }

  const source = 'const url = `${config.ingredientsEndpoint}/videos/${id}`;\n';

  it('rejects a new ID-derived media URL', () => {
    write('apps/server/api/src/foo/foo.ts', source);
    const { violations } = runCheckIdDerivedMediaUrls({
      allowances: [],
      rootDir: testDir,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain('new ID-derived media URL');
  });

  it('accepts a listed construction and ignores specs', () => {
    write('apps/server/api/src/foo/foo.ts', source);
    write('apps/server/api/src/foo/foo.spec.ts', source);
    const { violations } = runCheckIdDerivedMediaUrls({
      allowances: [
        {
          count: 1,
          file: 'apps/server/api/src/foo/foo.ts',
          reason: 'test',
        },
      ],
      rootDir: testDir,
    });
    expect(violations).toEqual([]);
  });

  it('rejects a second construction in an allowed file', () => {
    write('apps/server/api/src/foo/foo.ts', source + source);
    const { violations } = runCheckIdDerivedMediaUrls({
      allowances: [
        { count: 1, file: 'apps/server/api/src/foo/foo.ts', reason: 'test' },
      ],
      rootDir: testDir,
    });
    expect(violations).toHaveLength(1);
  });

  it('flags a stale allowance', () => {
    write('apps/server/api/src/foo/foo.ts', 'export const a = 1;\n');
    const { violations } = runCheckIdDerivedMediaUrls({
      allowances: [
        { count: 1, file: 'apps/server/api/src/foo/foo.ts', reason: 'test' },
      ],
      rootDir: testDir,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain('stale');
  });
});

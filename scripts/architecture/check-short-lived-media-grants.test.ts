import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCheckShortLivedMediaGrants } from './check-short-lived-media-grants';

describe('check-short-lived-media-grants', () => {
  let testDir = '';

  beforeEach(() => {
    testDir = mkdtempSync(path.join(tmpdir(), 'short-lived-grants-'));
  });

  afterEach(() => {
    rmSync(testDir, { force: true, recursive: true });
  });

  function write(file: string, content: string): void {
    const target = path.join(testDir, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }

  const file = 'apps/server/api/src/foo/foo.ts';
  const source = 'const urls = await issuer.issueServerPublish(org, ids);\n';

  it('rejects a new grant caller', () => {
    write(file, source);
    const { violations } = runCheckShortLivedMediaGrants({
      allowances: [],
      rootDir: testDir,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain('new short-lived media grant');
  });

  it('accepts a listed caller and ignores specs', () => {
    write(file, source);
    write('apps/server/api/src/foo/foo.spec.ts', source);
    const { violations } = runCheckShortLivedMediaGrants({
      allowances: [{ count: 1, file, reason: 'test' }],
      rootDir: testDir,
    });
    expect(violations).toEqual([]);
  });

  it('rejects a second call in a listed file', () => {
    write(file, source + source);
    const { violations } = runCheckShortLivedMediaGrants({
      allowances: [{ count: 1, file, reason: 'test' }],
      rootDir: testDir,
    });
    expect(violations).toHaveLength(1);
  });

  it('matches the other grant issuers', () => {
    write(
      file,
      'await a.issueExecutionUrls(s, ids);\nawait b.authorizeProcessingUrl(o, i, u);\nawait c.issueServerAssetUrls(o, ids);\n',
    );
    const { violations } = runCheckShortLivedMediaGrants({
      allowances: [{ count: 3, file, reason: 'test' }],
      rootDir: testDir,
    });
    expect(violations).toEqual([]);
  });

  it('reports a stale allowance', () => {
    write(file, 'const x = 1;\n');
    const { violations } = runCheckShortLivedMediaGrants({
      allowances: [{ count: 1, file, reason: 'test' }],
      rootDir: testDir,
    });
    expect(violations[0].message).toContain('stale');
  });
});

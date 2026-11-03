import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  authorityFieldEntryKeys,
  crossOrgEntryKeys,
  findRatchetGrowth,
  RATCHET_SOURCES,
  runRatchetGrowthCheck,
  tenantScopeEntryKeys,
} from './check-ratchet-growth';

const CROSS_ORG = RATCHET_SOURCES[0];
const AUTHORITY_FIELDS = RATCHET_SOURCES[1];
const TENANT_SCOPE = RATCHET_SOURCES[2];

function crossOrgBaseline(entries: Array<[string, number]>): string {
  const body = entries
    .map(
      ([file, line]) =>
        `    {\n      file: '${file}',\n      line: ${line},\n    },`,
    )
    .join('\n');

  return `export const CROSS_ORG_UNSAFE_BASELINE = [\n${body}\n];\n`;
}

function tenantScopeBaseline(
  entries: Array<{ fingerprint: string; file: string; method: string }>,
): string {
  return JSON.stringify({
    entries: entries.map((entry) => ({
      delegate: 'activity',
      model: 'Activity',
      reason: 'missing-organization-id',
      ...entry,
    })),
  });
}

describe('baseline entry keys', () => {
  it('keys cross-org entries by file and ignores the line', () => {
    expect(
      crossOrgEntryKeys(
        crossOrgBaseline([
          ['apps/server/api/src/a.ts', 10],
          ['apps/server/api/src/a.ts', 90],
          ['apps/server/api/src/b.ts', 3],
        ]),
      ),
    ).toEqual([
      'apps/server/api/src/a.ts',
      'apps/server/api/src/a.ts',
      'apps/server/api/src/b.ts',
    ]);
  });

  it('keys tenant-scope entries without the fingerprint', () => {
    expect(
      tenantScopeEntryKeys(
        tenantScopeBaseline([
          { file: 'a.ts', fingerprint: 'f1', method: 'findMany' },
        ]),
      ),
    ).toEqual(['a.ts|Activity|activity|findMany|missing-organization-id']);
  });
});

describe('authority-field baseline', () => {
  const entry = (file: string, property: string): string =>
    `  { file: '${file}', property: '${property}' },`;

  it('keys entries by file and property', () => {
    expect(
      authorityFieldEntryKeys(
        `[\n${entry('a.dto.ts', 'scopes')}\n${entry('a.dto.ts', 'role')}\n]`,
      ),
    ).toEqual(['a.dto.ts|scopes', 'a.dto.ts|role']);
  });

  it('rejects an entry the base did not carry', () => {
    const growth = findRatchetGrowth(
      AUTHORITY_FIELDS,
      `[\n${entry('a.dto.ts', 'scopes')}\n]`,
      `[\n${entry('a.dto.ts', 'scopes')}\n${entry('b.dto.ts', 'role')}\n]`,
    );

    expect(growth.map(({ key }) => key)).toEqual(['b.dto.ts|role']);
  });
});

describe('findRatchetGrowth', () => {
  it('accepts an unchanged baseline', () => {
    const baseline = crossOrgBaseline([['apps/server/api/src/a.ts', 10]]);

    expect(findRatchetGrowth(CROSS_ORG, baseline, baseline)).toEqual([]);
  });

  it('accepts a baseline entry that moved lines inside the same file', () => {
    expect(
      findRatchetGrowth(
        CROSS_ORG,
        crossOrgBaseline([['apps/server/api/src/a.ts', 10]]),
        crossOrgBaseline([['apps/server/api/src/a.ts', 44]]),
      ),
    ).toEqual([]);
  });

  it('accepts a baseline that shrank', () => {
    expect(
      findRatchetGrowth(
        CROSS_ORG,
        crossOrgBaseline([
          ['apps/server/api/src/a.ts', 10],
          ['apps/server/api/src/b.ts', 3],
        ]),
        crossOrgBaseline([['apps/server/api/src/b.ts', 3]]),
      ),
    ).toEqual([]);
  });

  it('rejects a hatch call site in a file the base did not list', () => {
    const growth = findRatchetGrowth(
      CROSS_ORG,
      crossOrgBaseline([['apps/server/api/src/a.ts', 10]]),
      crossOrgBaseline([
        ['apps/server/api/src/a.ts', 10],
        ['apps/server/api/src/new.ts', 7],
      ]),
    );

    expect(growth.map(({ added, key }) => ({ added, key }))).toEqual([
      { added: 1, key: 'apps/server/api/src/new.ts' },
    ]);
  });

  it('rejects a second hatch call site in a file that already had one', () => {
    const growth = findRatchetGrowth(
      CROSS_ORG,
      crossOrgBaseline([['apps/server/api/src/a.ts', 10]]),
      crossOrgBaseline([
        ['apps/server/api/src/a.ts', 10],
        ['apps/server/api/src/a.ts', 80],
      ]),
    );

    expect(growth.map(({ added, key }) => ({ added, key }))).toEqual([
      { added: 1, key: 'apps/server/api/src/a.ts' },
    ]);
  });

  it('rejects swapping a removed entry for one in another file', () => {
    const growth = findRatchetGrowth(
      CROSS_ORG,
      crossOrgBaseline([['apps/server/api/src/a.ts', 10]]),
      crossOrgBaseline([['apps/server/api/src/c.ts', 10]]),
    );

    expect(growth.map(({ key }) => key)).toEqual(['apps/server/api/src/c.ts']);
  });

  it('accepts a tenant-scope entry whose fingerprint changed with an edit', () => {
    expect(
      findRatchetGrowth(
        TENANT_SCOPE,
        tenantScopeBaseline([
          { file: 'a.ts', fingerprint: 'old', method: 'findMany' },
        ]),
        tenantScopeBaseline([
          { file: 'a.ts', fingerprint: 'new', method: 'findMany' },
        ]),
      ),
    ).toEqual([]);
  });

  it('rejects a new tenant-scope finding', () => {
    const growth = findRatchetGrowth(
      TENANT_SCOPE,
      tenantScopeBaseline([
        { file: 'a.ts', fingerprint: 'f1', method: 'findMany' },
      ]),
      tenantScopeBaseline([
        { file: 'a.ts', fingerprint: 'f1', method: 'findMany' },
        { file: 'a.ts', fingerprint: 'f2', method: 'updateMany' },
      ]),
    );

    expect(growth.map(({ key }) => key)).toEqual([
      'a.ts|Activity|activity|updateMany|missing-organization-id',
    ]);
  });

  it('does not flag a baseline the base never had: it is being introduced', () => {
    expect(
      findRatchetGrowth(
        CROSS_ORG,
        null,
        crossOrgBaseline([['apps/server/api/src/a.ts', 10]]),
      ),
    ).toEqual([]);
  });
});

describe('runRatchetGrowthCheck against git history', () => {
  const rootDirs: string[] = [];

  afterEach(() => {
    for (const rootDir of rootDirs.splice(0)) {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  function git(rootDir: string, ...args: string[]): void {
    execFileSync('git', args, { cwd: rootDir, stdio: 'ignore' });
  }

  function repoWithBaseline(content: string): string {
    const rootDir = mkdtempSync(path.join(tmpdir(), 'ratchet-growth-'));
    rootDirs.push(rootDir);
    git(rootDir, 'init', '-q', '-b', 'master');
    git(rootDir, 'config', 'user.email', 'test@example.com');
    git(rootDir, 'config', 'user.name', 'Test');
    git(rootDir, 'config', 'commit.gpgsign', 'false');
    writeBaseline(rootDir, content);
    git(rootDir, 'add', '.');
    git(rootDir, 'commit', '-q', '-m', 'base');

    return rootDir;
  }

  function writeBaseline(rootDir: string, content: string): void {
    const file = path.join(rootDir, CROSS_ORG.file);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }

  it('fails when the working tree adds an entry the base commit lacks', () => {
    const rootDir = repoWithBaseline(
      crossOrgBaseline([['apps/server/api/src/a.ts', 10]]),
    );
    writeBaseline(
      rootDir,
      crossOrgBaseline([
        ['apps/server/api/src/a.ts', 10],
        ['apps/server/api/src/new.ts', 2],
      ]),
    );

    expect(
      runRatchetGrowthCheck({
        base: 'master',
        rootDir,
        sources: [CROSS_ORG],
      }).map(({ key }) => key),
    ).toEqual(['apps/server/api/src/new.ts']);
  });

  it('passes when the working tree only removes entries', () => {
    const rootDir = repoWithBaseline(
      crossOrgBaseline([['apps/server/api/src/a.ts', 10]]),
    );
    writeBaseline(rootDir, crossOrgBaseline([]));

    expect(
      runRatchetGrowthCheck({ base: 'master', rootDir, sources: [CROSS_ORG] }),
    ).toEqual([]);
  });

  it('fails loudly when the base ref cannot be read', () => {
    const rootDir = repoWithBaseline(crossOrgBaseline([]));

    expect(() =>
      runRatchetGrowthCheck({
        base: 'origin/missing',
        rootDir,
        sources: [CROSS_ORG],
      }),
    ).toThrow(
      /Could not read scripts\/architecture\/cross-org-unsafe.baseline.ts/,
    );
  });
});

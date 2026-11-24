import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  authorityFieldEntryKeys,
  bootHeapEntryKeys,
  countMapEntryKeys,
  crossOrgEntryKeys,
  findRatchetGrowth,
  RATCHET_SOURCES,
  runRatchetGrowthCheck,
  runtimeComplexityEntryKeys,
  stringListEntryKeys,
  tenantScopeEntryKeys,
  typeAssertionEntryKeys,
  untranslatedStringEntryKeys,
} from './check-ratchet-growth';

const CROSS_ORG = RATCHET_SOURCES[0];
const AUTHORITY_FIELDS = RATCHET_SOURCES[1];
const TENANT_SCOPE = RATCHET_SOURCES[2];
const USE_EFFECT = RATCHET_SOURCES[5];

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

  it('ignores file strings that sit in comments', () => {
    expect(
      crossOrgEntryKeys(
        `// file: 'apps/server/api/src/commented.ts'\n${crossOrgBaseline([['apps/server/api/src/a.ts', 1]])}`,
      ),
    ).toEqual(['apps/server/api/src/a.ts']);
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

  it('keys entries written with property before file', () => {
    expect(
      authorityFieldEntryKeys(`[{ property: 'role', file: 'a.dto.ts' }]`),
    ).toEqual(['a.dto.ts|role']);
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

describe('useEffect baseline', () => {
  const baseline = (useEffect: Record<string, number>): string =>
    JSON.stringify({ async_effect_without_abort: {}, use_effect: useEffect });

  it('keys one entry per counted effect', () => {
    expect(USE_EFFECT?.entryKeys(baseline({ 'a.tsx': 2, 'b.tsx': 1 }))).toEqual(
      ['use_effect|a.tsx', 'use_effect|a.tsx', 'use_effect|b.tsx'],
    );
  });

  it('rejects a file whose count rose', () => {
    const growth = findRatchetGrowth(
      USE_EFFECT as NonNullable<typeof USE_EFFECT>,
      baseline({ 'a.tsx': 1 }),
      baseline({ 'a.tsx': 2 }),
    );

    expect(growth.map(({ added, key }) => [key, added])).toEqual([
      ['use_effect|a.tsx', 1],
    ]);
  });

  it('accepts a file whose count fell', () => {
    expect(
      findRatchetGrowth(
        USE_EFFECT as NonNullable<typeof USE_EFFECT>,
        baseline({ 'a.tsx': 2 }),
        baseline({ 'a.tsx': 1 }),
      ),
    ).toEqual([]);
  });
});

describe('runtime-complexity baseline', () => {
  const source = RATCHET_SOURCES.find(
    ({ file }) =>
      file === 'scripts/architecture/runtime-complexity.baseline.json',
  ) as NonNullable<(typeof RATCHET_SOURCES)[number]>;
  const baseline = (actual: number, symbol = 'a.ts'): string =>
    JSON.stringify([{ actual, file: 'a.ts', metric: 'file-lines', symbol }]);

  it('counts a ceiling once per unit of size', () => {
    expect(runtimeComplexityEntryKeys(baseline(3))).toEqual([
      'a.ts|file-lines|a.ts',
      'a.ts|file-lines|a.ts',
      'a.ts|file-lines|a.ts',
    ]);
  });

  it('rejects a raised ceiling', () => {
    const growth = findRatchetGrowth(source, baseline(10), baseline(12));

    expect(growth.map(({ added, key }) => [key, added])).toEqual([
      ['a.ts|file-lines|a.ts', 2],
    ]);
  });

  it('rejects a ceiling for a symbol the base did not carry', () => {
    const growth = findRatchetGrowth(
      source,
      baseline(10),
      baseline(10, 'B.run'),
    );

    expect(growth.map(({ key }) => key)).toEqual(['a.ts|file-lines|B.run']);
  });

  it('accepts a lowered or dropped ceiling', () => {
    expect(findRatchetGrowth(source, baseline(10), baseline(8))).toEqual([]);
    expect(findRatchetGrowth(source, baseline(10), '[]')).toEqual([]);
  });
});

describe('count-map and list baselines', () => {
  it('counts a TypeScript map entry once per counted finding and ignores comments', () => {
    expect(
      countMapEntryKeys(
        `// 'commented.ts': 9\nexport const B: Readonly<Record<string, number>> = { 'a.ts': 2, 'b.ts': 1 };`,
      ),
    ).toEqual(['a.ts', 'a.ts', 'b.ts']);
  });

  it('reads the spec paths of a string list', () => {
    expect(
      stringListEntryKeys(
        `// 'commented.spec.ts'\nexport const B: readonly string[] = ['a.test.ts', 'b.test.ts'];`,
      ),
    ).toEqual(['a.test.ts', 'b.test.ts']);
  });

  it('counts untranslated strings per file', () => {
    expect(
      untranslatedStringEntryKeys(
        JSON.stringify({ files: { 'a.tsx': 2 }, version: 1 }),
      ),
    ).toEqual(['a.tsx', 'a.tsx']);
  });

  it('counts type assertions per kind and file', () => {
    expect(
      typeAssertionEntryKeys(
        JSON.stringify({ as_any: {}, as_never: { 'a.ts': 2 }, ts_ignore: {} }),
      ),
    ).toEqual(['as_never|a.ts', 'as_never|a.ts']);
  });

  it('rejects a file whose as-never count rose', () => {
    const source = RATCHET_SOURCES.find(
      ({ file }) =>
        file === 'scripts/architecture/type-assertions.baseline.json',
    ) as NonNullable<(typeof RATCHET_SOURCES)[number]>;
    const baseline = (count: number): string =>
      JSON.stringify({
        as_any: {},
        as_never: { 'a.ts': count },
        ts_ignore: {},
      });

    expect(
      findRatchetGrowth(source, baseline(1), baseline(2)).map(
        ({ added, key }) => [key, added],
      ),
    ).toEqual([['as_never|a.ts', 1]]);
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

describe('boot heap budget baseline', () => {
  const source = RATCHET_SOURCES.find(
    ({ file }) => file === 'scripts/architecture/boot-heap.baseline.json',
  ) as NonNullable<(typeof RATCHET_SOURCES)[number]>;
  const baseline = (budgetMb: number): string => JSON.stringify({ budgetMb });

  it('counts one entry per megabyte of budget', () => {
    expect(bootHeapEntryKeys(baseline(3))).toEqual([
      'boot-heap-mb',
      'boot-heap-mb',
      'boot-heap-mb',
    ]);
  });

  it('rejects a raised budget', () => {
    expect(
      findRatchetGrowth(source, baseline(200), baseline(230)).map(
        ({ added, key }) => [key, added],
      ),
    ).toEqual([['boot-heap-mb', 30]]);
  });

  it('accepts a lowered or unchanged budget', () => {
    expect(findRatchetGrowth(source, baseline(200), baseline(180))).toEqual([]);
    expect(findRatchetGrowth(source, baseline(200), baseline(200))).toEqual([]);
  });
});

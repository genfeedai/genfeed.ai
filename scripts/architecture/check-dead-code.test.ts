import { describe, expect, it } from 'vitest';
import {
  type DeadCodeSnapshot,
  evaluateDeadCode,
  snapshotFromKnip,
} from './check-dead-code';
import { deadCodeEntryKeys, findRatchetGrowth } from './check-ratchet-growth';

const EMPTY: DeadCodeSnapshot = {
  unusedDependencies: [],
  unusedExports: {},
  unusedFiles: [],
};

describe('snapshotFromKnip', () => {
  it('reads unused files, export plus type counts and dependencies', () => {
    expect(
      snapshotFromKnip({
        issues: [
          { file: 'apps/web/src/a.ts', files: [{ name: 'a.ts' }] },
          {
            exports: [{ name: 'one' }, { name: 'two' }],
            file: 'apps/web/src/b.ts',
            files: [],
            types: [{ name: 'Three' }],
          },
          {
            dependencies: [{ name: 'left-pad' }],
            devDependencies: [{ name: 'madge' }],
            file: 'apps/web/package.json',
          },
        ],
      }),
    ).toEqual({
      unusedDependencies: [
        'apps/web/package.json|left-pad',
        'apps/web/package.json|madge',
      ],
      unusedExports: { 'apps/web/src/b.ts': 3 },
      unusedFiles: ['apps/web/src/a.ts'],
    });
  });
});

describe('evaluateDeadCode', () => {
  it('passes when nothing changed', () => {
    const snapshot: DeadCodeSnapshot = {
      unusedDependencies: ['package.json|madge'],
      unusedExports: { 'a.ts': 2 },
      unusedFiles: [],
    };

    expect(evaluateDeadCode(snapshot, snapshot)).toEqual([]);
  });

  it('fails a new unused file even when the baseline has exports for others', () => {
    const violations = evaluateDeadCode(EMPTY, {
      ...EMPTY,
      unusedFiles: ['apps/web/src/orphan.ts'],
    });

    expect(violations.map(({ kind, type }) => [kind, type])).toEqual([
      ['file', 'new'],
    ]);
    expect(violations[0]?.message).toContain('apps/web/src/orphan.ts');
  });

  it('fails a file that gains unused exports and one that starts with some', () => {
    const violations = evaluateDeadCode(
      { ...EMPTY, unusedExports: { 'a.ts': 1 } },
      { ...EMPTY, unusedExports: { 'a.ts': 2, 'b.ts': 1 } },
    );

    expect(violations.map(({ type }) => type)).toEqual(['growth', 'new']);
  });

  it('fails a new unused dependency', () => {
    const violations = evaluateDeadCode(EMPTY, {
      ...EMPTY,
      unusedDependencies: ['apps/api/package.json|bcrypt'],
    });

    expect(violations).toEqual([
      {
        kind: 'dependency',
        message:
          'apps/api/package.json: unused dependency bcrypt. Remove it from the manifest.',
        type: 'new',
      },
    ]);
  });

  it('asks for the baseline to shrink when an entry is cleaned up', () => {
    const violations = evaluateDeadCode(
      {
        unusedDependencies: ['package.json|madge'],
        unusedExports: { 'a.ts': 2, 'gone.ts': 1 },
        unusedFiles: [],
      },
      { ...EMPTY, unusedExports: { 'a.ts': 1 } },
    );

    expect(violations.map(({ kind, type }) => [kind, type])).toEqual([
      ['export', 'stale'],
      ['export', 'stale'],
      ['dependency', 'stale'],
    ]);
  });
});

describe('dead-code baseline growth guard', () => {
  const source = {
    entryKeys: deadCodeEntryKeys,
    file: 'scripts/architecture/dead-code.baseline.json',
    instead: 'delete it',
    name: 'dead code (knip)',
  };

  function baseline(snapshot: DeadCodeSnapshot): string {
    return JSON.stringify(snapshot);
  }

  it('counts one more unused export in a file as growth', () => {
    const growth = findRatchetGrowth(
      source,
      baseline({ ...EMPTY, unusedExports: { 'a.ts': 1 } }),
      baseline({ ...EMPTY, unusedExports: { 'a.ts': 2 } }),
    );

    expect(growth.map(({ added, key }) => [key, added])).toEqual([
      ['exports|a.ts', 1],
    ]);
  });

  it('allows the baseline to shrink', () => {
    expect(
      findRatchetGrowth(
        source,
        baseline({ ...EMPTY, unusedExports: { 'a.ts': 2 } }),
        baseline({ ...EMPTY, unusedExports: { 'a.ts': 1 } }),
      ),
    ).toEqual([]);
  });
});

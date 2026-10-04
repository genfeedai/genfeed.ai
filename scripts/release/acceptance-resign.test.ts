import { describe, expect, it, vi } from 'vitest';
import { BRAND_PATH } from '../ci/runtime-acceptance.mjs';
import {
  buildNextContract,
  buildVitestInvocations,
  CONTRACT_PATHS,
  collectTitlesByRunning,
  commitsSincePin,
  diffContracts,
  formatDiff,
  parseArguments,
  titlesFromReport,
} from './acceptance-resign.mjs';

const sha = (char: string) => char.repeat(64);
const STORAGE = CONTRACT_PATHS.slice(1);

function contract(overrides: Record<string, string[]> = {}, hash = 'a') {
  return {
    version: 1,
    brand: {
      path: BRAND_PATH,
      sha256: sha(hash),
      passedTitles: overrides[BRAND_PATH] ?? ['brand one', 'brand two'],
    },
    storage: STORAGE.map((entry, index) => ({
      path: entry,
      sha256: sha(String(index + 1)),
      passedTitles: overrides[entry] ?? [`storage ${index}`],
    })),
  };
}

describe('acceptance re-sign diff', () => {
  it('reports no change for identical contracts', () => {
    const diff = diffContracts(contract(), contract());
    expect(diff.isChanged).toBe(false);
    expect(diff.hasRemovedTitles).toBe(false);
  });

  it('lists added and removed titles and flags removals', () => {
    const next = contract({ [BRAND_PATH]: ['brand two', 'brand three'] }, 'b');
    const diff = diffContracts(contract(), next);
    const brand = diff.files[0];
    expect(brand.hashChanged).toBe(true);
    expect(brand.added).toEqual(['brand three']);
    expect(brand.removed).toEqual(['brand one']);
    expect(diff.hasRemovedTitles).toBe(true);
    expect(diff.files.slice(1).every((file) => !file.isChanged)).toBe(true);
  });

  it('does not flag removals when titles are only added', () => {
    const next = contract(
      { [BRAND_PATH]: ['brand one', 'brand two', 'x'] },
      'b',
    );
    expect(diffContracts(contract(), next).hasRemovedTitles).toBe(false);
  });

  it('treats a missing current variable as all-new', () => {
    const diff = diffContracts(null, contract());
    expect(diff.files.every((file) => file.isNew && file.isChanged)).toBe(true);
  });

  it('highlights removed titles in the formatted output', () => {
    const next = contract({ [BRAND_PATH]: ['brand two'] }, 'b');
    const text = formatDiff(diffContracts(contract(), next));
    expect(text).toContain('- REMOVED TITLE: brand one');
    expect(text).toContain('WARNING: passing titles were REMOVED');
    const colored = formatDiff(diffContracts(contract(), next), {
      color: true,
    });
    expect(colored).toContain('\u001b[1;31m    - REMOVED TITLE: brand one');
  });
});

describe('acceptance re-sign contract building', () => {
  const hashes = new Map(
    CONTRACT_PATHS.map((entry, index) => [
      entry,
      index === 0 ? sha('b') : sha(String(index)),
    ]),
  );

  it('keeps pinned titles for unchanged files and asks for a report for changed ones', () => {
    const { missing, contract: next } = buildNextContract({
      current: contract(),
      hashes,
      titlesByPath: new Map(),
    });
    expect(missing).toEqual([BRAND_PATH]);
    expect(next.storage[0].passedTitles).toEqual(['storage 0']);
  });

  it('uses report titles for changed files', () => {
    const { missing, contract: next } = buildNextContract({
      current: contract(),
      hashes,
      titlesByPath: new Map([[BRAND_PATH, ['brand new']]]),
    });
    expect(missing).toEqual([]);
    expect(next.brand.passedTitles).toEqual(['brand new']);
  });
});

describe('acceptance re-sign report and history parsing', () => {
  it('extracts passed titles by contract path', () => {
    const titles = titlesFromReport({
      testResults: [
        {
          name: `/ci/work/${BRAND_PATH}`,
          assertionResults: [{ status: 'passed', fullName: 'a b' }],
        },
        { name: '/ci/work/other.spec.ts', assertionResults: [] },
      ],
    });
    expect([...titles.entries()]).toEqual([[BRAND_PATH, ['a b']]]);
  });

  it('rejects reports containing non-passed tests', () => {
    expect(() =>
      titlesFromReport({
        testResults: [
          {
            name: `/x/${BRAND_PATH}`,
            assertionResults: [{ status: 'skipped', fullName: 'a' }],
          },
        ],
      }),
    ).toThrow(/skipped/);
  });

  it('lists only commits newer than the pinned content', () => {
    const commits = ['c3', 'c2', 'c1'].map((id) => ({
      sha: id,
      shortSha: id,
      subject: id,
    }));
    const hashAt = (commit: string) => (commit === 'c1' ? 'pin' : commit);
    const result = commitsSincePin(commits, 'pin', hashAt);
    expect(result.isBaselineFound).toBe(true);
    expect(result.commits.map((commit) => commit.sha)).toEqual(['c3', 'c2']);
    expect(commitsSincePin(commits, 'gone', hashAt).isBaselineFound).toBe(
      false,
    );
  });

  it('parses flags and rejects unknown ones', () => {
    expect(parseArguments(['--dry-run', '--sha', 'abc']).dryRun).toBe(true);
    expect(() => parseArguments(['--force'])).toThrow(/Unknown/);
  });
});

describe('acceptance re-sign spec runner', () => {
  const SHA = 'a'.repeat(40);
  const storagePath = CONTRACT_PATHS[1];
  const reportFor = (entry: string) => ({
    testResults: [
      {
        name: `/repo/${entry}`,
        assertionResults: [{ status: 'passed', fullName: 't' }],
      },
    ],
  });
  const makeDeps = (overrides: Record<string, unknown> = {}) => ({
    head: () => SHA,
    dirtyPaths: () => [] as string[],
    exec: vi.fn(() => 0),
    readReport: vi.fn(() => reportFor(storagePath)),
    env: {} as Record<string, string>,
    execPath: 'node',
    ...overrides,
  });
  const base = { sha: SHA, repoRoot: '/repo', reportDir: '/tmp/r' };

  it('builds CI-equivalent invocations per group', () => {
    const [storage, brand] = buildVitestInvocations(
      [storagePath, BRAND_PATH],
      base,
    );
    expect(storage.cwd).toBe('/repo/packages/storage/');
    expect(storage.args).toContain('--reporter=json');
    expect(storage.args).toContain(
      storagePath.slice('packages/storage/'.length),
    );
    expect(brand.args).toContain('vitest.config.e2e.ts');
    expect(brand.requiredEnv).toEqual(['BRANDED_GENERATION_TEST_DATABASE_URL']);
  });

  it('returns titles from the run report', () => {
    const deps = makeDeps();
    const titles = collectTitlesByRunning({
      ...base,
      changedPaths: [storagePath],
      deps,
    });
    expect(titles.get(storagePath)).toEqual(['t']);
    expect(deps.exec).toHaveBeenCalledTimes(1);
  });

  it('aborts without running when the checkout is not at the target sha', () => {
    const deps = makeDeps({ head: () => 'b'.repeat(40) });
    expect(() =>
      collectTitlesByRunning({ ...base, changedPaths: [storagePath], deps }),
    ).toThrow(/git checkout/);
    expect(deps.exec).not.toHaveBeenCalled();
  });

  it('aborts when a spec has uncommitted edits', () => {
    const deps = makeDeps({ dirtyPaths: () => [storagePath] });
    expect(() =>
      collectTitlesByRunning({ ...base, changedPaths: [storagePath], deps }),
    ).toThrow(/Uncommitted/);
  });

  it('aborts when vitest fails or a test did not pass', () => {
    expect(() =>
      collectTitlesByRunning({
        ...base,
        changedPaths: [storagePath],
        deps: makeDeps({ exec: vi.fn(() => 1) }),
      }),
    ).toThrow(/failed/);
    expect(() =>
      collectTitlesByRunning({
        ...base,
        changedPaths: [storagePath],
        deps: makeDeps({
          readReport: () => ({
            testResults: [
              {
                name: `/repo/${storagePath}`,
                assertionResults: [{ status: 'failed', fullName: 'x' }],
              },
            ],
          }),
        }),
      }),
    ).toThrow(/failed/);
  });

  it('requires the database env for the brand spec before running', () => {
    const deps = makeDeps();
    expect(() =>
      collectTitlesByRunning({ ...base, changedPaths: [BRAND_PATH], deps }),
    ).toThrow(/BRANDED_GENERATION_TEST_DATABASE_URL/);
    expect(deps.exec).not.toHaveBeenCalled();
  });

  it('parses --init', () => {
    expect(parseArguments(['--init']).isInit).toBe(true);
  });
});

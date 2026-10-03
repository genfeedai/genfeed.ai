import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UsageError } from '../cli';
import type {
  ContentEvalRunOptions,
  FixtureRow,
  StubDispatcherOptions,
} from '../contracts';
import { createStubDispatcher } from '../dispatchers/stub';
import { loadFixture } from '../fixtures';
import { canonicalJson, sha256Digest } from '../provenance';
import { runContentEval } from '../runner';
import { POOLED_KIND } from './contracts';
import { readScoringSurfaceLock } from './scoring-surface';

const FIXTURES = fileURLToPath(
  new URL(
    '../../../apps/server/api/test/fixtures/content-evals/',
    import.meta.url,
  ),
);
const BRAND_CONTEXT =
  'scripts/content-eval/calibration/fixtures/brand-context.synthetic.json';
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'calibration-'));
  roots.push(root);
  return root;
}

function passRows(): FixtureRow[] {
  return Array.from({ length: 32 }, (_, index): FixtureRow => {
    const band = Math.floor(index / 8);
    return {
      brandFixtureId: 'synthetic-calibration',
      contentKind: 'social-post',
      expected: {
        decision: band < 2 ? 'reject' : 'approve',
        scoreBand: { max: (band + 1) / 4, min: band / 4 },
      },
      id: `calibration-${String(index).padStart(2, '0')}`,
      input: {
        brief: { bannedPhrases: [], isCtaRequired: false },
        output: `Band ${band} sample ${index}: A practical note for the next morning. Save this for later.`,
        prompt: 'Write a practical social post.',
      },
      rubricVersion: 'content-quality-v1',
      source: { reference: 'synthetic:calibration', visibility: 'synthetic' },
    };
  });
}

function writeFixture(root: string, name: string, rows: FixtureRow[]): string {
  const path = join(root, name);
  writeFileSync(path, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
  return path;
}

function midpointQuality(content: string): number {
  const band = Number(/^Band (\d)/.exec(content)?.[1] ?? '0');
  return (band + 0.5) / 4;
}

function options(
  fixturePath: string,
  overrides: Partial<ContentEvalRunOptions> = {},
  stubOptions: StubDispatcherOptions = {},
): ContentEvalRunOptions {
  return {
    createDispatcher: async () =>
      createStubDispatcher({ qualityOf: midpointQuality, ...stubOptions }),
    dispatcherKind: 'stub',
    fixturePath,
    judgeRegistryKeys: ['anthropic/claude-sonnet-5'],
    maxCredits: 100,
    models: [],
    now: new Date('2026-10-03T12:00:00.000Z'),
    runId: 'calibration-suite-test',
    seed: 7,
    suite: 'judge',
    tieBand: 0.05,
    ...overrides,
  };
}

function passFixture(): string {
  return writeFixture(tempRoot(), 'pass.jsonl', passRows());
}

describe('judge calibration suite', () => {
  it('T1 passes with perfect band and decision kappa on both primaries', async () => {
    const { exitCode, report } = await runContentEval(options(passFixture()));

    expect(exitCode).toBe(0);
    expect(report.passed).toBe(true);
    const primaries =
      report.calibration?.arms.filter((arm) => arm.isPrimary) ?? [];
    expect(primaries).toHaveLength(2);
    for (const arm of primaries) {
      expect(
        report.calibration?.metrics.find(
          (metric) =>
            metric.armId === arm.armId && metric.contentKind === POOLED_KIND,
        ),
      ).toMatchObject({ bandKappa: 1, decisionKappa: 1, scoredRows: 32 });
    }
    expect(report.outcome.thresholdChecks[0]?.id).toBe('judge-band-agreement');
  });

  it('T2 fails band and decision kappa on both primaries for inverted scores', async () => {
    const { exitCode, report } = await runContentEval(
      options(
        passFixture(),
        {},
        { qualityOf: (content) => 1 - midpointQuality(content) },
      ),
    );

    expect(exitCode).toBe(1);
    const primaries =
      report.calibration?.arms.filter((arm) => arm.isPrimary) ?? [];
    expect(primaries).toHaveLength(2);
    for (const arm of primaries) {
      for (const id of [
        'calibration-band-kappa',
        'calibration-decision-kappa',
      ]) {
        expect(
          report.outcome.thresholdChecks.find(
            (check) =>
              check.id === id && check.subject === `${arm.armId}:social-post`,
          ),
        ).toMatchObject({ passed: false });
      }
    }
  });

  it('T3 fails the position-bias check for an always-first judge', async () => {
    const { exitCode, report } = await runContentEval(
      options(passFixture(), {}, { isFirstAlwaysPreferred: true }),
    );

    expect(exitCode).toBe(1);
    expect(
      report.outcome.thresholdChecks.find(
        (check) => check.id === 'judge-position-bias',
      ),
    ).toMatchObject({ actual: 1, passed: false });
  });

  it('T4 fails the sample floor on the four-row judge fixture', async () => {
    const { report } = await runContentEval(
      options(`${FIXTURES}judge/social-post.synthetic.jsonl`),
    );

    expect(
      report.outcome.thresholdChecks.find(
        (check) => check.id === 'calibration-sample',
      ),
    ).toMatchObject({ actual: 4, passed: false });
  });

  it('T5 creates three cross-family arms and records one same-family skip', async () => {
    const { report } = await runContentEval(
      options(passFixture(), {
        argv: [
          '--cross-family-judges=openai/gpt-5.6-luna,google/gemini-3.6-flash',
        ],
      }),
    );

    expect(
      report.calibration?.arms.filter(
        (arm) =>
          !arm.isPrimary &&
          (arm.profileId === 'content-quality' ||
            arm.profileId === 'evaluations'),
      ),
    ).toHaveLength(3);
    expect(report.calibration?.skippedCrossFamily).toEqual([
      {
        model: 'google/gemini-3.6-flash',
        profileId: 'content-quality',
        reason: 'same-family',
      },
    ]);
  });

  it('T6 scores all 45 golden rows with brand criteria and recommends keep or drop', async () => {
    const { report } = await runContentEval(
      options(`${FIXTURES}golden/social-post.synthetic.jsonl`, {
        argv: [`--brand-context=${BRAND_CONTEXT}`],
        createDispatcher: async () => createStubDispatcher(),
      }),
    );

    expect(
      report.calls.filter(
        (call) => call.rubricVersion === 'content-quality-scorer+criteria',
      ),
    ).toHaveLength(45);
    expect(report.calibration?.injection?.pooled.rows).toBe(45);
    expect(['keep', 'drop']).toContain(
      report.calibration?.injection?.recommendation,
    );
  });

  it('T7 combines fixtures in order and rejects duplicate ids before dispatch', async () => {
    const root = tempRoot();
    const rows = passRows();
    const firstPath = writeFixture(root, 'first.jsonl', rows.slice(0, 16));
    const secondPath = writeFixture(root, 'second.jsonl', rows.slice(16));
    const first = loadFixture(firstPath);
    const second = loadFixture(secondPath);
    const { report } = await runContentEval(
      options(`${firstPath},${secondPath}`),
    );

    expect(report.fixture.path).toBe(`${first.path}+${second.path}`);
    expect(report.fixture.rowCount).toBe(
      first.rows.length + second.rows.length,
    );
    expect(report.fixture.digest).toBe(
      sha256Digest(
        canonicalJson(
          [first, second].map(({ digest, path }) => ({ digest, path })),
        ),
      ),
    );
    expect(report.outcome.rows.map((row) => row.fixtureId)).toEqual(
      rows.map((row) => row.id),
    );

    const duplicatePath = writeFixture(
      root,
      'duplicate.jsonl',
      rows.slice(0, 1),
    );
    const createDispatcher = vi.fn(async () => createStubDispatcher());
    await expect(
      runContentEval(
        options(`${firstPath},${duplicatePath}`, { createDispatcher }),
      ),
    ).rejects.toThrow('Fixture rows repeat id "calibration-00" across files');
    expect(createDispatcher).not.toHaveBeenCalled();
  });

  it('T8 rejects invalid flags with the exact UsageError before dispatch', async () => {
    const fixture = passFixture();
    const cases: ReadonlyArray<readonly [string, string]> = [
      [
        '--production-judges=other',
        '--production-judges must be from content-quality, evaluations, got "other"',
      ],
      [
        '--production-judges=evaluations,evaluations',
        '--production-judges repeats "evaluations"',
      ],
      [
        '--cross-family-judges=openai/gpt-5.6-luna,openai/gpt-5.6-luna',
        '--cross-family-judges repeats "openai/gpt-5.6-luna"',
      ],
      ['--brand-context=', '--brand-context needs a path to a JSON file'],
    ];
    for (const [flag, message] of cases) {
      const createDispatcher = vi.fn(async () => createStubDispatcher());
      await expect(
        runContentEval(options(fixture, { argv: [flag], createDispatcher })),
      ).rejects.toThrow(new UsageError(message));
      expect(createDispatcher).not.toHaveBeenCalled();
    }
  });

  it('T9 records the committed scoring-surface text digest', async () => {
    const { report } = await runContentEval(options(passFixture()));

    expect(report.calibration?.scoringSurface.textDigest).toBe(
      readScoringSurfaceLock()?.text.digest,
    );
  });
});

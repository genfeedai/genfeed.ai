import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type {
  ContentEvalRunOptions,
  DispatcherKind,
  EvalDispatcher,
} from './contracts';
import { contentEvalReportSchema } from './contracts';
import { createStubDispatcher } from './dispatchers/stub';
import { CrossFamilyViolationError } from './families';
import { buildContestants, runContentEval } from './runner';

const FIXTURES = fileURLToPath(
  new URL(
    '../../apps/server/api/test/fixtures/content-evals/',
    import.meta.url,
  ),
);
const LADDER_FIXTURE = `${FIXTURES}ladder/social-post.synthetic.jsonl`;
const JUDGE_FIXTURE = `${FIXTURES}judge/social-post.synthetic.jsonl`;
const BASELINE = 'google/gemini-2.5-flash-lite';
const CHALLENGER = 'openai/gpt-5.6-luna';
const JUDGE = 'anthropic/claude-sonnet-5';

function options(
  overrides: Partial<ContentEvalRunOptions> = {},
): ContentEvalRunOptions {
  return {
    createDispatcher: async () => createStubDispatcher(),
    dispatcherKind: 'stub',
    fixturePath: LADDER_FIXTURE,
    judgeRegistryKeys: [JUDGE],
    maxCredits: 50,
    models: [BASELINE, CHALLENGER],
    now: new Date('2026-09-26T12:00:00.000Z'),
    runId: 'ladder-test',
    seed: 7,
    suite: 'ladder',
    tieBand: 0.05,
    ...overrides,
  };
}

describe('runContentEval with the stub dispatcher', () => {
  it('runs the synthetic ladder end to end with full provenance', async () => {
    const { exitCode, report } = await runContentEval(options());

    expect(contentEvalReportSchema.safeParse(report).success).toBe(true);
    expect(report).toMatchObject({
      aborted: null,
      dispatcher: 'stub',
      evidenceKind: 'stub-dispatcher',
      modelQualityAssessed: false,
      runId: 'ladder-test',
      schemaVersion: 1,
      suite: 'ladder',
      thresholds: { version: 'thresholds-v1' },
    });
    expect(report.sourceRevision).toMatch(/^[0-9a-f]{40}$/);
    expect(typeof report.workingTreeDirty).toBe('boolean');
    expect(report.fixture).toMatchObject({ rowCount: 3 });
    expect(report.fixture.digest).toMatch(/^sha256:/);

    // 3 rows × 2 contestants × (generation + pointwise) + 3 pairs × 2 battles.
    expect(report.calls).toHaveLength(18);
    expect(report.spend.callCount).toBe(18);
    for (const call of report.calls) {
      expect(call.provider).toBe('stub');
      expect(call.modelVersion).toBe(`${call.model}@stub`);
      expect(call.promptDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(call.seed).toBe(7);
      expect(call.costUsd).toBeGreaterThan(0);
      if (call.kind === 'judge') {
        expect(call.rubricVersion).not.toBeNull();
        expect(call.rubricDigest).toMatch(/^sha256:/);
      }
    }
    expect(report.rubrics.map((rubric) => rubric.version).sort()).toEqual([
      'autoevals-battle@0.3.0',
      'content-quality-v1',
    ]);

    expect(report.outcome.rows).toHaveLength(6);
    for (const row of report.outcome.rows) {
      expect(row).toMatchObject({
        brandFixtureId: 'synthetic-kelder',
        fixtureVisibility: 'synthetic',
        runId: 'ladder-test',
        suite: 'ladder',
        voidReason: null,
      });
      expect(row.contestant?.family).toMatch(/^(google|openai)$/);
      expect(row.votes[0]?.family).toBe('anthropic');
    }
    expect(report.outcome.pairs).toHaveLength(3);
    // The stub judge is order-consistent, so nothing is position-biased.
    expect(report.outcome.positionBiasRate).toBe(0);
    const [baseline, challenger] = report.outcome.contestants;
    expect(baseline?.vsBaseline).toBeNull();
    expect(challenger?.vsBaseline?.pairs).toBe(3);
    expect(exitCode).toBe(report.passed ? 0 : 1);
  });

  it('is reproducible: same inputs give the same scores and digests', async () => {
    const first = await runContentEval(options());
    const second = await runContentEval(options());

    expect(second.report.outcome).toEqual(first.report.outcome);
    expect(second.report.calls.map((call) => call.promptDigest)).toEqual(
      first.report.calls.map((call) => call.promptDigest),
    );
  });

  it('stops at the spend cap and writes a partial report marked aborted', async () => {
    const { exitCode, report } = await runContentEval(
      options({
        createDispatcher: async () =>
          createStubDispatcher({ usdPerToken: 0.000_05 }),
        maxCredits: 3,
      }),
    );

    expect(contentEvalReportSchema.safeParse(report).success).toBe(true);
    expect(report.aborted).toBe('spend');
    expect(report.abortMessage).toContain('--max-credits=3');
    expect(report.passed).toBe(false);
    expect(exitCode).toBe(1);
    expect(report.calls.length).toBeGreaterThan(0);
    expect(report.calls.length).toBeLessThan(18);
    expect(report.outcome.thresholdChecks).toEqual([]);
  });

  it('rejects a same-family judge before creating a dispatcher', async () => {
    const createDispatcher = vi.fn(
      async (_kind: DispatcherKind): Promise<EvalDispatcher> =>
        createStubDispatcher(),
    );

    await expect(
      runContentEval(
        options({
          createDispatcher,
          judgeRegistryKeys: ['google/gemini-3.6-flash'],
        }),
      ),
    ).rejects.toThrow(CrossFamilyViolationError);
    expect(createDispatcher).not.toHaveBeenCalled();
  });

  it('voids a contestant whose generation fails instead of failing the run', async () => {
    const { report } = await runContentEval(
      options({
        createDispatcher: async () =>
          createStubDispatcher({ failingModels: [CHALLENGER] }),
      }),
    );
    const challenger = report.outcome.contestants.find(
      (summary) => summary.contestantId === CHALLENGER,
    );

    expect(challenger?.voidRate).toBe(1);
    expect(challenger?.vsBaseline?.voidRate).toBe(1);
    expect(report.outcome.pairs.every((pair) => pair.verdict === null)).toBe(
      true,
    );
    expect(
      report.outcome.thresholdChecks.find(
        (check) => check.id === 'max-void-rate' && check.subject === CHALLENGER,
      )?.passed,
    ).toBe(false);
    expect(report.passed).toBe(false);
  });

  it('runs the judge suite against human bands', async () => {
    const { report } = await runContentEval(
      options({ fixturePath: JUDGE_FIXTURE, models: [], suite: 'judge' }),
    );

    expect(contentEvalReportSchema.safeParse(report).success).toBe(true);
    expect(report.outcome.rows).toHaveLength(4);
    expect(report.outcome.rows.every((row) => row.contestant === null)).toBe(
      true,
    );
    expect(report.outcome.judges).toEqual([
      expect.objectContaining({
        judgeRegistryKey: JUDGE,
        labelledRows: 4,
        scoredRows: 4,
      }),
    ]);
    expect(report.outcome.thresholdChecks[0]?.id).toBe('judge-band-agreement');
    // The hype row trips deterministic checks, so it can never be accepted.
    expect(
      report.outcome.rows.find((row) => row.fixtureId.endsWith('hype-launch'))
        ?.isAccepted,
    ).toBe(false);
  });

  it('keeps the model fixed for harness A/B', async () => {
    const { report } = await runContentEval(
      options({ models: [BASELINE], suite: 'harness-ab' }),
    );

    expect(report.config.contestants.map((entry) => entry.id)).toEqual([
      `${BASELINE}#raw`,
      `${BASELINE}#brief`,
    ]);
    expect(
      new Set(
        report.calls
          .filter((call) => call.kind === 'generation')
          .map((call) => call.model),
      ),
    ).toEqual(new Set([BASELINE]));
  });
});

describe('buildContestants', () => {
  it('requires a baseline and a challenger for the ladder', () => {
    expect(() => buildContestants('ladder', [BASELINE])).toThrow(
      'at least two',
    );
    expect(() => buildContestants('ladder', [BASELINE, BASELINE])).toThrow(
      'repeats',
    );
  });

  it('requires exactly one model for harness A/B', () => {
    expect(() =>
      buildContestants('harness-ab', [BASELINE, CHALLENGER]),
    ).toThrow('exactly one');
  });
});

describe('suite-owned preparation', () => {
  it('lets a per-match suite skip the run-wide family rule and lifts media sections', async () => {
    const { SUITE_RUNNERS } = await import('./suites');
    const { loadFixture } = await import('./fixtures');
    const previous = SUITE_RUNNERS['media-ladder'];
    SUITE_RUNNERS['media-ladder'] = {
      async prepare() {
        return {
          contestants: [
            {
              guidanceArm: 'raw',
              id: 'google/imagen-4',
              isCompiled: false,
              registryKey: 'google/imagen-4',
            },
          ],
          crossFamily: 'per-match',
          fixture: loadFixture(LADDER_FIXTURE),
        };
      },
      async run() {
        return {
          benchMatches: [],
          contestants: [],
          judges: [],
          media: { note: 'media section' },
          pairs: [],
          positionBiasRate: null,
          rows: [],
          thresholdChecks: [],
        };
      },
      suite: 'media-ladder',
    };

    try {
      const { report } = await runContentEval(
        options({
          // Same family as the contestant: allowed because the suite owns it.
          judgeRegistryKeys: ['google/gemini-3.6-flash'],
          models: [],
          suite: 'media-ladder',
        }),
      );

      expect(report.benchMatches).toEqual([]);
      expect(report.media).toEqual({ note: 'media section' });
      expect(report.outcome).not.toHaveProperty('media');
      expect(report.outcome).not.toHaveProperty('benchMatches');
    } finally {
      SUITE_RUNNERS['media-ladder'] = previous;
    }
  });
});

describe('fail-closed run handling', () => {
  it('rejects a judge row without output before creating a dispatcher', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const directory = mkdtempSync(join(tmpdir(), 'content-eval-'));
    const fixturePath = join(directory, 'judge.jsonl');
    writeFileSync(
      fixturePath,
      `${JSON.stringify({
        brandFixtureId: 'synthetic-kelder',
        contentKind: 'social-post',
        id: 'no-output',
        input: { prompt: 'Write a post.' },
        rubricVersion: 'content-quality-v1',
        source: { reference: 'synthetic:kelder', visibility: 'synthetic' },
      })}\n`,
    );
    const createDispatcher = vi.fn(
      async (_kind: DispatcherKind): Promise<EvalDispatcher> =>
        createStubDispatcher(),
    );

    await expect(
      runContentEval(
        options({ createDispatcher, fixturePath, models: [], suite: 'judge' }),
      ),
    ).rejects.toThrow('needs input.output');
    expect(createDispatcher).not.toHaveBeenCalled();
  });

  it('writes a partial report marked aborted: error on an unexpected failure', async () => {
    const { SUITE_RUNNERS } = await import('./suites');
    const previous = SUITE_RUNNERS['media-ladder'];
    SUITE_RUNNERS['media-ladder'] = {
      async run(context, onProgress) {
        await context.judge.pointwise({
          judgeRegistryKey: JUDGE,
          output: 'A calm skillet.',
          row: context.rows[0] ?? fail('fixture has rows'),
        });
        onProgress({
          contestants: [],
          judges: [],
          pairs: [],
          positionBiasRate: null,
          rows: [],
          thresholdChecks: [],
        });
        throw new Error('unexpected suite failure');
      },
      suite: 'media-ladder',
    };

    try {
      const { exitCode, report } = await runContentEval(
        options({ suite: 'media-ladder' }),
      );

      expect(contentEvalReportSchema.safeParse(report).success).toBe(true);
      expect(report.aborted).toBe('error');
      expect(report.abortMessage).toBe('unexpected suite failure');
      // The judge call made before the failure is still on the books.
      expect(report.calls).toHaveLength(1);
      expect(report.passed).toBe(false);
      expect(exitCode).toBe(1);
    } finally {
      SUITE_RUNNERS['media-ladder'] = previous;
    }
  });
});

function fail(message: string): never {
  throw new Error(message);
}

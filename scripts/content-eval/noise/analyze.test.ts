import { describe, expect, it } from 'vitest';
import type { JudgeVote, ScoredRow } from '../rows';
import { analyzeNoise } from './analyze';

function vote(score: number | null): JudgeVote {
  return {
    callId: null,
    choice: null,
    family: 'anthropic',
    judgeRegistryKey: 'anthropic/claude-sonnet-5',
    matchId: null,
    model: 'claude',
    modelVersion: null,
    provider: null,
    rationale: null,
    score,
  };
}

type RowOptions = {
  contestant: string;
  fixtureId: string;
  isAccepted?: boolean | null;
  regradedIsAccepted?: boolean | null;
  repeatIndex?: number;
  score: number | null;
  voidReason?: string | null;
};

function row(options: RowOptions): ScoredRow {
  return {
    artifactRef: null,
    brandFixtureId: 'synthetic',
    callIds: [],
    contentKind: 'social-post',
    contestant: {
      family: 'google',
      guidanceArm: 'brief',
      id: options.contestant,
      isCompiled: false,
      model: options.contestant,
      modelVersion: null,
      provider: null,
      registryKey: options.contestant,
    },
    costCredits: 0,
    deterministicChecks: [],
    fixtureId: options.fixtureId,
    fixtureVisibility: 'synthetic',
    humanLabel: null,
    isAccepted: options.isAccepted ?? (options.score ?? 0) >= 0.6,
    latencyMs: 1,
    output: 'text',
    regradedIsAccepted: options.regradedIsAccepted,
    repeatIndex: options.repeatIndex ?? 0,
    rubricVersion: 'content-quality-v1',
    runId: 'run',
    suite: 'ladder',
    voidReason: options.voidReason ?? null,
    votes: options.score === null ? [] : [vote(options.score)],
  };
}

/** Each contestant scores `scores[i]` on case i, repeated `repeats` times. */
function arm(contestant: string, scores: number[], repeats = 1): ScoredRow[] {
  return scores.flatMap((score, index) =>
    Array.from({ length: repeats }, (_unused, repeatIndex) =>
      row({ contestant, fixtureId: `case-${index}`, repeatIndex, score }),
    ),
  );
}

describe('analyzeNoise', () => {
  it('returns nothing for rows that are not a contestant comparison', () => {
    expect(analyzeNoise([])).toBeUndefined();
    expect(
      analyzeNoise([
        {
          ...row({ contestant: 'a', fixtureId: 'x', score: 0.5 }),
          contestant: null,
        },
      ]),
    ).toBeUndefined();
  });

  it('averages repeats within a case before the interval, so repeats do not shrink it', () => {
    // Two cases, three identical repeats each: n is 2 cases, not 6 rows.
    const section = analyzeNoise([
      ...arm('base', [0.2, 0.4], 3),
      ...arm('cand', [0.2, 0.4], 3),
    ]);
    expect(section?.contestants[0]).toMatchObject({
      caseCount: 2,
      contestantId: 'base',
      repeats: 3,
    });
    expect(section?.contestants[0]?.repeatSd).toBeCloseTo(0, 10);
    expect(section?.contestants[0]?.score.n).toBe(2);
    expect(section?.contestants[0]?.score.mean).toBeCloseTo(0.3, 10);
  });

  it('names no winner when the paired interval contains zero', () => {
    const section = analyzeNoise([
      ...arm('base', [0.5, 0.6, 0.4, 0.7]),
      ...arm('cand', [0.55, 0.5, 0.5, 0.65]),
    ]);
    expect(section?.comparisons[0]).toMatchObject({
      baselineId: 'base',
      challengerId: 'cand',
      verdict: 'within-noise',
      winnerId: null,
    });
  });

  it('names the challenger only when the whole paired interval is above zero', () => {
    const section = analyzeNoise([
      ...arm('base', [0.4, 0.5, 0.45, 0.5]),
      ...arm('cand', [0.7, 0.8, 0.74, 0.79]),
    ]);
    expect(section?.comparisons[0]).toMatchObject({
      verdict: 'challenger-better',
      winnerId: 'cand',
    });

    const reversed = analyzeNoise([
      ...arm('base', [0.7, 0.8, 0.74, 0.79]),
      ...arm('cand', [0.4, 0.5, 0.45, 0.5]),
    ]);
    expect(reversed?.comparisons[0]).toMatchObject({
      verdict: 'baseline-better',
      winnerId: 'base',
    });
  });

  it('refuses a verdict from fewer than two paired cases', () => {
    const section = analyzeNoise([
      ...arm('base', [0.2]),
      ...arm('cand', [0.9]),
    ]);
    expect(section?.comparisons[0]).toMatchObject({
      verdict: 'insufficient-data',
      winnerId: null,
    });
    expect(section?.contestants[0]?.score.ci95).toBeNull();
  });

  it('warns when the baseline has no headroom', () => {
    const saturated = analyzeNoise([
      ...arm('base', [0.97, 0.96, 0.98]),
      ...arm('cand', [0.9, 0.95, 0.96]),
    ]);
    expect(saturated?.diagnostics.isBaselineSaturated).toBe(true);
    expect(saturated?.diagnostics.warnings.join(' ')).toMatch(/no headroom/);

    const open = analyzeNoise([
      ...arm('base', [0.5, 0.6, 0.55]),
      ...arm('cand', [0.9, 0.95, 0.96]),
    ]);
    expect(open?.diagnostics.isBaselineSaturated).toBe(false);
  });

  it('flags a case every contestant fails in every repeat, and not a case one arm passes', () => {
    const rows = [
      ...arm('base', [0.2, 0.9, 0.9], 2),
      ...arm('cand', [0.1, 0.2, 0.9], 2),
    ];
    const section = analyzeNoise(rows);
    expect(section?.diagnostics.alwaysFailingCases).toEqual([
      { fixtureId: 'case-0', rows: 4 },
    ]);
    expect(section?.diagnostics.warnings.join(' ')).toContain('case-0');
  });

  it('keeps timeouts and failures out of the scores and reports them apart', () => {
    const section = analyzeNoise([
      ...arm('base', [0.5, 0.6]),
      row({ contestant: 'cand', fixtureId: 'case-0', score: 0.8 }),
      row({
        contestant: 'cand',
        fixtureId: 'case-1',
        isAccepted: null,
        score: null,
        voidReason: 'generation failed: request timed out',
      }),
      row({
        contestant: 'cand',
        fixtureId: 'case-2',
        isAccepted: null,
        score: null,
        voidReason: 'judging failed: schema repair',
      }),
    ]);
    expect(
      section?.diagnostics.errors.find(
        (entry) => entry.contestantId === 'cand',
      ),
    ).toEqual({
      contestantId: 'cand',
      generationFailures: 1,
      judgingFailures: 1,
      otherVoid: 0,
      rows: 3,
      timeouts: 1,
    });
    expect(section?.contestants[1]?.score.n).toBe(1);
  });

  it('reports verdict changes from the grade-twice sample', () => {
    const section = analyzeNoise([
      row({
        contestant: 'base',
        fixtureId: 'a',
        score: 0.7,
        regradedIsAccepted: true,
      }),
      row({
        contestant: 'base',
        fixtureId: 'b',
        score: 0.7,
        regradedIsAccepted: false,
      }),
      row({
        contestant: 'cand',
        fixtureId: 'a',
        score: 0.3,
        regradedIsAccepted: false,
      }),
      row({ contestant: 'cand', fixtureId: 'b', score: 0.3 }),
    ]);
    expect(section?.diagnostics.gradeTwice).toEqual({
      changeRate: 1 / 3,
      sampled: 3,
      verdictChanges: 1,
    });
    expect(section?.diagnostics.warnings.join(' ')).toMatch(
      /changed its accept verdict/,
    );
  });

  it('has no grade-twice figure when nothing was regraded', () => {
    expect(
      analyzeNoise([...arm('base', [0.5, 0.6]), ...arm('cand', [0.5, 0.6])])
        ?.diagnostics.gradeTwice,
    ).toBeNull();
  });
});

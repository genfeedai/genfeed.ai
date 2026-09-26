import { describe, expect, it } from 'vitest';
import {
  analyzeOutliers,
  analyzeRunOutliers,
  isSplitPair,
  quantile,
  rowScore,
} from './analyze';
import {
  DEFAULT_OUTLIER_THRESHOLDS,
  OUTLIER_CLASSES,
  type OutlierClass,
  type OutlierSection,
  type OutlierThresholds,
  outlierSectionSchema,
} from './contracts';
import {
  buildSyntheticFixtureRows,
  buildSyntheticOutlierPairs,
  buildSyntheticOutlierRows,
  SYNTHETIC_CONTESTANTS,
  SYNTHETIC_OUTLIER_RUN_ID,
  syntheticRow,
  syntheticVote,
} from './fixtures';

function analyzeSynthetic(
  thresholds: OutlierThresholds = DEFAULT_OUTLIER_THRESHOLDS,
): OutlierSection {
  return analyzeOutliers({
    fixtureRowsById: buildSyntheticFixtureRows(),
    pairs: buildSyntheticOutlierPairs(),
    rows: buildSyntheticOutlierRows(),
    thresholds,
  });
}

function fixtureIdsOf(
  section: OutlierSection,
  outlierClass: OutlierClass,
): string[] {
  return section.cases
    .filter((record) => record.class === outlierClass)
    .map((record) => `${record.fixtureId}@${record.contestant?.id}`)
    .sort();
}

describe('analyzeOutliers on the synthetic run', () => {
  const section = analyzeSynthetic();

  it('reports every outlier class', () => {
    for (const outlierClass of OUTLIER_CLASSES) {
      expect(
        section.totals.find((total) => total.class === outlierClass)?.total,
        outlierClass,
      ).toBeGreaterThan(0);
    }
    expect(fixtureIdsOf(section, 'judge_human_disagreement')).toEqual([
      'caption-judge-human@alpha-raw',
    ]);
    expect(fixtureIdsOf(section, 'judge_disagreement')).toEqual([
      'caption-judge-spread@alpha-raw',
      'caption-pairwise@beta-compiled',
    ]);
    expect(fixtureIdsOf(section, 'extreme_score')).toEqual([
      'ad-copy-disaster@alpha-raw',
    ]);
    expect(fixtureIdsOf(section, 'cost_latency')).toEqual([
      'ad-copy-03@alpha-raw',
      'ad-copy-07@alpha-raw',
    ]);
  });

  it('validates against the report section schema', () => {
    expect(outlierSectionSchema.parse(section)).toEqual(section);
    expect(section.status).toBe('ok');
    expect(section.caseCount).toBe(buildSyntheticOutlierRows().length);
  });

  it('records the thresholds that classified the run', () => {
    expect(section.thresholds).toEqual(DEFAULT_OUTLIER_THRESHOLDS);
    expect(section.cap.perClassAndContestant).toBe(
      DEFAULT_OUTLIER_THRESHOLDS.maxCasesPerClassAndContestant,
    );
  });

  it('attaches everything needed to review a case without re-running', () => {
    const record = section.cases.find(
      (candidate) => candidate.fixtureId === 'caption-judge-human',
    );
    expect(record).toMatchObject({
      contestant: SYNTHETIC_CONTESTANTS.baseline,
      humanLabel: { band: { max: 0.3, min: 0.1 }, decision: 'reject' },
      id: `${SYNTHETIC_OUTLIER_RUN_ID}:judge_human_disagreement:caption:caption-judge-human:alpha-raw`,
      input: { prompt: 'Synthetic prompt for caption-judge-human' },
      missingFields: [],
      output: 'Synthetic output for caption-judge-human',
      rubricVersion: 'synthetic-rubric-v1',
    });
    expect(record?.votes.map((vote) => vote.rationale)).toEqual([
      'gamma rationale',
      'delta rationale',
    ]);
    expect(record?.reason).toContain('2 of 2 judges');
  });

  it('carries the split pair and its battle rationales', () => {
    const record = section.cases.find(
      (candidate) =>
        candidate.fixtureId === 'caption-pairwise' &&
        candidate.class === 'judge_disagreement',
    );
    expect(record?.artifactRef).toBe(
      'media/caption-pairwise/beta-compiled.png',
    );
    expect(record?.pairs).toEqual(buildSyntheticOutlierPairs());
    expect(record?.reason).toContain('split pairwise verdict vs alpha-raw');
  });

  it('names missing fields instead of dropping the outlier', () => {
    const record = section.cases.find(
      (candidate) => candidate.fixtureId === 'ad-copy-disaster',
    );
    expect(record?.class).toBe('extreme_score');
    expect(record?.input).toBeNull();
    expect(record?.missingFields).toEqual(['input', 'artifact', 'rationale']);
  });

  it('reports outlier rates with counts per contestant and content kind', () => {
    expect(section.byContestant).toEqual([
      {
        byClass: {
          cost_latency: 2,
          extreme_score: 1,
          judge_disagreement: 1,
          judge_human_disagreement: 1,
        },
        caseCount: 16,
        key: 'alpha-raw',
        outlierCaseCount: 5,
        outlierRate: 5 / 16,
      },
      {
        byClass: {
          cost_latency: 0,
          extreme_score: 0,
          judge_disagreement: 1,
          judge_human_disagreement: 0,
        },
        caseCount: 4,
        key: 'beta-compiled',
        outlierCaseCount: 1,
        outlierRate: 1 / 4,
      },
    ]);
    expect(
      section.byContentKind.map(({ caseCount, key, outlierCaseCount }) => ({
        caseCount,
        key,
        outlierCaseCount,
      })),
    ).toEqual([
      { caseCount: 16, key: 'ad-copy', outlierCaseCount: 3 },
      { caseCount: 4, key: 'caption', outlierCaseCount: 3 },
    ]);
  });

  it('skips percentile cuts for groups below the minimum size', () => {
    expect(section.extremeScoreSkippedGroups).toEqual([
      {
        contentKind: 'caption',
        contestantKey: 'alpha-raw',
        scoredCaseCount: 3,
      },
      {
        contentKind: 'caption',
        contestantKey: 'beta-compiled',
        scoredCaseCount: 1,
      },
      {
        contentKind: 'ad-copy',
        contestantKey: 'beta-compiled',
        scoredCaseCount: 3,
      },
    ]);
  });
});

describe('outlier thresholds', () => {
  it('caps reported cases per class and contestant but keeps totals', () => {
    const section = analyzeSynthetic({
      ...DEFAULT_OUTLIER_THRESHOLDS,
      maxCasesPerClassAndContestant: 1,
    });
    expect(
      section.totals.find((total) => total.class === 'cost_latency'),
    ).toEqual({ class: 'cost_latency', reported: 1, total: 2 });
    // Cost 20× the median outranks latency 9×.
    expect(fixtureIdsOf(section, 'cost_latency')).toEqual([
      'ad-copy-03@alpha-raw',
    ]);
    expect(section.byContestant[0]?.byClass.cost_latency).toBe(2);
  });

  it('tolerates judge scores just outside the human band', () => {
    const row = syntheticRow({
      contentKind: 'caption',
      fixtureId: 'near-band',
      humanLabel: { band: { max: 0.3, min: 0.1 }, decision: null },
      votes: [syntheticVote('gamma', 0.38), syntheticVote('delta', 0.38)],
    });
    expect(
      analyzeOutliers({
        fixtureRowsById: new Map(),
        pairs: [],
        rows: [row],
        thresholds: DEFAULT_OUTLIER_THRESHOLDS,
      }).cases,
    ).toEqual([]);
  });

  it('never flags a group whose scores are all equal', () => {
    const flat = buildSyntheticOutlierRows()
      .filter((row) => row.contentKind === 'ad-copy')
      .map((row) => ({
        ...row,
        costCredits: 2,
        latencyMs: 1000,
        votes: row.votes.map((vote) => ({ ...vote, score: 0.6 })),
      }));
    expect(
      analyzeOutliers({
        fixtureRowsById: new Map(),
        pairs: [],
        rows: flat,
        thresholds: DEFAULT_OUTLIER_THRESHOLDS,
      }).cases,
    ).toEqual([]);
  });

  it('keys judge-suite rows without a contestant', () => {
    const judged = buildSyntheticOutlierRows()
      .filter((row) => row.fixtureId === 'caption-judge-human')
      .map((row) => ({ ...row, contestant: null, suite: 'judge' as const }));
    const section = analyzeOutliers({
      fixtureRowsById: new Map(),
      pairs: [],
      rows: judged,
      thresholds: DEFAULT_OUTLIER_THRESHOLDS,
    });
    expect(section.byContestant.map((rate) => rate.key)).toEqual([
      'judged-output',
    ]);
    expect(section.cases[0]?.id).toBe(
      `${SYNTHETIC_OUTLIER_RUN_ID}:judge_human_disagreement:caption:caption-judge-human:judged-output`,
    );
  });
});

describe('analyzeRunOutliers', () => {
  const input = {
    fixtureRowsById: buildSyntheticFixtureRows(),
    pairs: buildSyntheticOutlierPairs(),
    rows: buildSyntheticOutlierRows(),
  };

  it('uses the documented defaults when the run set no thresholds', () => {
    expect(analyzeRunOutliers({ ...input, thresholds: undefined })).toEqual(
      analyzeSynthetic(),
    );
  });

  it('returns a failed section instead of throwing on invalid thresholds', () => {
    const section = analyzeRunOutliers({
      ...input,
      thresholds: {
        ...DEFAULT_OUTLIER_THRESHOLDS,
        extremeScoreHighPercentile: 0.01,
      },
    });
    expect(section.status).toBe('failed');
    expect(section.error).toContain('invalid outlier thresholds');
    expect(section.thresholds).toEqual(DEFAULT_OUTLIER_THRESHOLDS);
    expect(section.cases).toEqual([]);
    expect(outlierSectionSchema.parse(section)).toEqual(section);
  });
});

describe('score helpers', () => {
  it('interpolates quantiles between closest ranks', () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([0, 10], 0.25)).toBe(2.5);
    expect(quantile([7], 0.95)).toBe(7);
    expect(quantile([], 0.5)).toBe(0);
  });

  it('averages only the judge scores that exist', () => {
    const row = syntheticRow({
      contentKind: 'caption',
      fixtureId: 'partial',
      votes: [syntheticVote('gamma', 0.2), syntheticVote('delta', null, 'a')],
    });
    expect(rowScore(row)).toBe(0.2);
    expect(rowScore({ ...row, votes: [] })).toBeNull();
  });

  it('treats ordered-vs-pointwise conflicts as split pairs', () => {
    const [pair] = buildSyntheticOutlierPairs();
    if (!pair) throw new Error('fixture pair missing');
    const unanimous = {
      ...pair,
      battleVotes: pair.battleVotes.map((vote) => ({
        ...vote,
        choice: 'a' as const,
      })),
    };
    expect(isSplitPair(pair)).toBe(true);
    expect(isSplitPair(unanimous)).toBe(false);
    expect(
      isSplitPair({ ...unanimous, orderedChoice: 'b', pointwiseChoice: 'a' }),
    ).toBe(true);
  });
});

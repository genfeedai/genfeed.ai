import { describe, expect, it } from 'vitest';
import {
  analyzeOutliers,
  analyzeOutliersSafely,
  caseScore,
  quantile,
} from './analyze';
import {
  DEFAULT_OUTLIER_THRESHOLDS,
  OUTLIER_CLASSES,
  type OutlierClass,
  type OutlierSection,
  outlierSectionSchema,
} from './contracts';
import {
  buildSyntheticOutlierRun,
  SYNTHETIC_CONTESTANTS,
  SYNTHETIC_OUTLIER_RUN_ID,
} from './fixtures';

function fixtureIdsOf(
  section: OutlierSection,
  outlierClass: OutlierClass,
): string[] {
  return section.cases
    .filter((record) => record.class === outlierClass)
    .map((record) => record.fixtureId)
    .sort();
}

describe('analyzeOutliers on the synthetic run', () => {
  const section = analyzeOutliers(buildSyntheticOutlierRun());

  it('reports every outlier class', () => {
    for (const outlierClass of OUTLIER_CLASSES) {
      expect(
        section.totals.find((total) => total.class === outlierClass)?.total,
        outlierClass,
      ).toBeGreaterThan(0);
    }
    expect(fixtureIdsOf(section, 'judge_human_disagreement')).toEqual([
      'caption-judge-human',
    ]);
    expect(fixtureIdsOf(section, 'judge_disagreement')).toEqual([
      'caption-judge-spread',
      'caption-pairwise-split',
    ]);
    expect(fixtureIdsOf(section, 'extreme_score')).toEqual([
      'ad-copy-disaster',
    ]);
    expect(fixtureIdsOf(section, 'cost_latency')).toEqual([
      'ad-copy-03',
      'ad-copy-07',
    ]);
  });

  it('validates against the report section schema', () => {
    expect(outlierSectionSchema.parse(section)).toEqual(section);
    expect(section.status).toBe('ok');
  });

  it('records the thresholds that classified the run', () => {
    expect(section.thresholds).toEqual(DEFAULT_OUTLIER_THRESHOLDS);
    expect(section.cap.perClassAndContestant).toBe(
      DEFAULT_OUTLIER_THRESHOLDS.maxCasesPerClassAndContestant,
    );
  });

  it('attaches review provenance to each outlier', () => {
    const record = section.cases.find(
      (candidate) => candidate.fixtureId === 'caption-judge-human',
    );
    expect(record).toMatchObject({
      artifactRef: 'artifacts/caption-judge-human.json',
      contestant: SYNTHETIC_CONTESTANTS.alpha,
      humanLabel: { band: { max: 0.3, min: 0.1 }, decision: 'rejected' },
      id: `${SYNTHETIC_OUTLIER_RUN_ID}:judge_human_disagreement:caption:caption-judge-human:alpha-raw`,
      input: { prompt: 'Synthetic prompt for caption-judge-human' },
      missingFields: [],
      rubricVersion: 'synthetic-rubric-v1',
    });
    expect(record?.votes.map((vote) => vote.rationale)).toEqual([
      'gamma rationale',
      'delta rationale',
    ]);
    expect(record?.reason).toContain('2 of 2 judges');
  });

  it('names missing fields instead of dropping the outlier', () => {
    const record = section.cases.find(
      (candidate) => candidate.fixtureId === 'ad-copy-disaster',
    );
    expect(record?.class).toBe('extreme_score');
    expect(record?.artifactRef).toBeNull();
    expect(record?.missingFields).toEqual([
      'input',
      'artifactRef',
      'rationale',
    ]);
  });

  it('reports outlier rates with counts per contestant and content kind', () => {
    expect(section.byContestant).toEqual([
      {
        byClass: {
          cost_latency: 2,
          extreme_score: 1,
          judge_disagreement: 2,
          judge_human_disagreement: 1,
        },
        caseCount: 16,
        key: 'alpha-raw',
        outlierCaseCount: 6,
        outlierRate: 6 / 16,
      },
      {
        byClass: {
          cost_latency: 0,
          extreme_score: 0,
          judge_disagreement: 0,
          judge_human_disagreement: 0,
        },
        caseCount: 3,
        key: 'beta-compiled',
        outlierCaseCount: 0,
        outlierRate: 0,
      },
    ]);
    expect(
      section.byContentKind.map(({ key, caseCount, outlierCaseCount }) => ({
        caseCount,
        key,
        outlierCaseCount,
      })),
    ).toEqual([
      { caseCount: 16, key: 'ad-copy', outlierCaseCount: 3 },
      { caseCount: 3, key: 'caption', outlierCaseCount: 3 },
    ]);
  });

  it('skips percentile cuts for groups below the minimum size', () => {
    expect(section.extremeScoreSkippedGroups).toEqual([
      {
        contentKind: 'caption',
        contestantKey: 'alpha-raw',
        scoredCaseCount: 2,
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
    const section = analyzeOutliers(buildSyntheticOutlierRun(), {
      ...DEFAULT_OUTLIER_THRESHOLDS,
      maxCasesPerClassAndContestant: 1,
    });
    expect(
      section.totals.find((total) => total.class === 'cost_latency'),
    ).toEqual({ class: 'cost_latency', reported: 1, total: 2 });
    // Cost 20× the median outranks latency 9×.
    expect(fixtureIdsOf(section, 'cost_latency')).toEqual(['ad-copy-03']);
    expect(section.byContestant[0]?.byClass.cost_latency).toBe(2);
  });

  it('tolerates judge scores just outside the human band', () => {
    const [evalCase] = buildSyntheticOutlierRun().filter(
      (candidate) => candidate.fixtureId === 'caption-judge-human',
    );
    if (!evalCase) throw new Error('fixture case missing');
    const nearBand = {
      ...evalCase,
      votes: evalCase.votes.map((vote) => ({ ...vote, score: 0.38 })),
    };
    expect(analyzeOutliers([nearBand]).cases).toEqual([]);
  });

  it('never flags a group whose scores are all equal', () => {
    const flat = buildSyntheticOutlierRun()
      .filter((evalCase) => evalCase.contentKind === 'ad-copy')
      .map((evalCase) => ({
        ...evalCase,
        costCredits: 2,
        latencyMs: 1000,
        votes: evalCase.votes.map((vote) => ({ ...vote, score: 0.6 })),
      }));
    expect(analyzeOutliers(flat).cases).toEqual([]);
  });
});

describe('analyzeOutliersSafely', () => {
  it('matches analyzeOutliers on valid rows with default thresholds', () => {
    const rows = buildSyntheticOutlierRun();
    expect(analyzeOutliersSafely(rows)).toEqual(analyzeOutliers(rows));
  });

  it('returns a failed section instead of throwing on malformed rows', () => {
    const section = analyzeOutliersSafely([{ fixtureId: 'broken' }]);
    expect(section.status).toBe('failed');
    expect(section.error).toContain('invalid scored rows');
    expect(section.caseCount).toBe(1);
    expect(section.cases).toEqual([]);
    expect(outlierSectionSchema.parse(section)).toEqual(section);
  });

  it('records defaults and fails the section on invalid thresholds', () => {
    const section = analyzeOutliersSafely(buildSyntheticOutlierRun(), {
      ...DEFAULT_OUTLIER_THRESHOLDS,
      extremeScoreHighPercentile: 0.01,
    });
    expect(section.status).toBe('failed');
    expect(section.error).toContain('invalid outlier thresholds');
    expect(section.thresholds).toEqual(DEFAULT_OUTLIER_THRESHOLDS);
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
    const [split] = buildSyntheticOutlierRun().filter(
      (evalCase) => evalCase.fixtureId === 'caption-pairwise-split',
    );
    if (!split) throw new Error('fixture case missing');
    expect(caseScore(split)).toBeNull();
    const [gamma, delta] = split.votes;
    if (!gamma || !delta) throw new Error('fixture votes missing');
    expect(
      caseScore({
        ...split,
        votes: [
          { ...gamma, score: 0.2 },
          { ...delta, score: null },
        ],
      }),
    ).toBe(0.2);
  });
});

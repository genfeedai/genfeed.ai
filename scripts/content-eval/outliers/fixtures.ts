/**
 * Synthetic scored run that deterministically triggers every outlier class
 * (#5234 phase 1). Brand `kelder` is the public synthetic kit; nothing here
 * comes from a real brand or tenant.
 */

import type {
  OutlierContestant,
  OutlierInputCase,
  OutlierVote,
} from './contracts';

export const SYNTHETIC_OUTLIER_RUN_ID = 'synthetic-outlier-run';

export const SYNTHETIC_CONTESTANTS = {
  alpha: {
    family: 'alpha-family',
    id: 'alpha-raw',
    isCompiled: false,
    model: 'alpha-model',
    modelVersion: '2026-09-01',
    provider: 'synthetic',
    registryKey: 'synthetic/alpha',
  },
  beta: {
    family: 'beta-family',
    id: 'beta-compiled',
    isCompiled: true,
    model: 'beta-model',
    modelVersion: null,
    provider: 'synthetic',
    registryKey: 'synthetic/beta',
  },
} satisfies Record<string, OutlierContestant>;

function vote(
  judge: 'gamma' | 'delta',
  score: number | null,
  choice: OutlierVote['choice'] = null,
  rationale: string | null = `${judge} rationale`,
): OutlierVote {
  return {
    choice,
    family: `${judge}-family`,
    judgeRegistryKey: `synthetic/${judge}-judge`,
    model: `${judge}-judge`,
    modelVersion: '2026-09-01',
    provider: 'synthetic',
    rationale,
    score,
  };
}

function scoredCase(
  overrides: Partial<OutlierInputCase> &
    Pick<OutlierInputCase, 'contentKind' | 'fixtureId'>,
): OutlierInputCase {
  return {
    artifactRef: `artifacts/${overrides.fixtureId}.json`,
    brandFixtureId: 'kelder',
    contestant: SYNTHETIC_CONTESTANTS.alpha,
    costCredits: 2,
    fixtureVisibility: 'synthetic',
    input: { prompt: `Synthetic prompt for ${overrides.fixtureId}` },
    latencyMs: 1000,
    rubricVersion: 'synthetic-rubric-v1',
    runId: SYNTHETIC_OUTLIER_RUN_ID,
    suite: 'ladder',
    voidReason: null,
    votes: [],
    ...overrides,
  };
}

/** Twelve steady ad-copy cases: scores 0.55–0.75, cost 2, latency 1000ms. */
function baselineAdCopy(): OutlierInputCase[] {
  return Array.from({ length: 12 }, (_, index) => {
    const base = 0.55 + (index % 5) * 0.05;
    return scoredCase({
      contentKind: 'ad-copy',
      fixtureId: `ad-copy-${String(index + 1).padStart(2, '0')}`,
      votes: [vote('gamma', base - 0.02), vote('delta', base + 0.02)],
    });
  });
}

export function buildSyntheticOutlierRun(): OutlierInputCase[] {
  const baseline = baselineAdCopy().map((evalCase) => {
    if (evalCase.fixtureId === 'ad-copy-03') {
      return { ...evalCase, costCredits: 40 };
    }
    if (evalCase.fixtureId === 'ad-copy-07') {
      return { ...evalCase, latencyMs: 9000 };
    }
    return evalCase;
  });

  return [
    ...baseline,
    // extreme_score: an off-brand disaster in an otherwise steady tail, with
    // its artifact and one rationale lost — still reported, fields named.
    scoredCase({
      artifactRef: null,
      contentKind: 'ad-copy',
      fixtureId: 'ad-copy-disaster',
      input: undefined,
      votes: [vote('gamma', 0.05, null, null), vote('delta', 0.07)],
    }),
    // judge_human_disagreement: judges love what the human rejected.
    scoredCase({
      contentKind: 'caption',
      fixtureId: 'caption-judge-human',
      humanLabel: { band: { max: 0.3, min: 0.1 }, decision: 'rejected' },
      votes: [vote('gamma', 0.8), vote('delta', 0.85)],
    }),
    // judge_disagreement: panel spread 0.8.
    scoredCase({
      contentKind: 'caption',
      fixtureId: 'caption-judge-spread',
      votes: [vote('gamma', 0.1), vote('delta', 0.9)],
    }),
    // judge_disagreement: split pairwise verdict, no pointwise scores.
    scoredCase({
      contentKind: 'caption',
      fixtureId: 'caption-pairwise-split',
      votes: [vote('gamma', null, 'a'), vote('delta', null, 'b')],
    }),
    // A private real-brand contestant with a clean run: zero outliers.
    ...['01', '02', '03'].map((suffix) =>
      scoredCase({
        brandFixtureId: 'private-brand-01',
        contentKind: 'ad-copy',
        contestant: SYNTHETIC_CONTESTANTS.beta,
        fixtureId: `ad-copy-private-${suffix}`,
        fixtureVisibility: 'private',
        votes: [vote('gamma', 0.7), vote('delta', 0.72)],
      }),
    ),
  ];
}

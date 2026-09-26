/**
 * Synthetic scored run that deterministically triggers every outlier class
 * (#5234 phase 1). Brand `synthetic-kelder` is the public synthetic kit; the
 * `private-brand-01` rows stand in for a private real-brand set and carry no
 * real content.
 */

import type {
  ContestantProvenance,
  FixtureRow,
  JudgeVote,
  PairwiseResult,
  ScoredRow,
} from '../contracts';

export const SYNTHETIC_OUTLIER_RUN_ID = 'synthetic-outlier-run';

export const SYNTHETIC_CONTESTANTS = {
  baseline: {
    family: 'alpha-family',
    guidanceArm: 'raw',
    id: 'alpha-raw',
    isCompiled: false,
    model: 'alpha-model',
    modelVersion: 'alpha-model@2026-09-01',
    provider: 'synthetic',
    registryKey: 'synthetic/alpha',
  },
  challenger: {
    family: 'beta-family',
    guidanceArm: 'brief',
    id: 'beta-compiled',
    isCompiled: true,
    model: 'beta-model',
    modelVersion: null,
    provider: null,
    registryKey: 'synthetic/beta',
  },
} satisfies Record<string, ContestantProvenance>;

export function syntheticVote(
  judge: 'gamma' | 'delta',
  score: number | null,
  choice: JudgeVote['choice'] = null,
  rationale: string | null = `${judge} rationale`,
): JudgeVote {
  return {
    callId: null,
    choice,
    family: `${judge}-family`,
    judgeRegistryKey: `synthetic/${judge}-judge`,
    model: `${judge}-judge`,
    modelVersion: `${judge}-judge@2026-09-01`,
    provider: 'synthetic',
    rationale,
    score,
  };
}

export function syntheticRow(
  overrides: Partial<ScoredRow> & Pick<ScoredRow, 'contentKind' | 'fixtureId'>,
): ScoredRow {
  return {
    artifactRef: null,
    brandFixtureId: 'synthetic-kelder',
    callIds: [],
    contestant: SYNTHETIC_CONTESTANTS.baseline,
    costCredits: 2,
    deterministicChecks: [],
    fixtureVisibility: 'synthetic',
    humanLabel: null,
    isAccepted: true,
    latencyMs: 1000,
    output: `Synthetic output for ${overrides.fixtureId}`,
    rubricVersion: 'synthetic-rubric-v1',
    runId: SYNTHETIC_OUTLIER_RUN_ID,
    suite: 'ladder',
    voidReason: null,
    votes: [],
    ...overrides,
  };
}

/** Twelve steady ad-copy rows: scores 0.55–0.75, cost 2, latency 1000ms. */
function baselineAdCopy(): ScoredRow[] {
  return Array.from({ length: 12 }, (_, index) => {
    const base = 0.55 + (index % 5) * 0.05;
    const fixtureId = `ad-copy-${String(index + 1).padStart(2, '0')}`;
    return syntheticRow({
      contentKind: 'ad-copy',
      costCredits: fixtureId === 'ad-copy-03' ? 40 : 2,
      fixtureId,
      latencyMs: fixtureId === 'ad-copy-07' ? 9000 : 1000,
      votes: [
        syntheticVote('gamma', base - 0.02),
        syntheticVote('delta', base + 0.02),
      ],
    });
  });
}

export function buildSyntheticOutlierRows(): ScoredRow[] {
  return [
    ...baselineAdCopy(),
    // extreme_score: an off-brand disaster in an otherwise steady tail, with
    // its output, fixture input and one rationale lost — still reported.
    syntheticRow({
      contentKind: 'ad-copy',
      fixtureId: 'ad-copy-disaster',
      isAccepted: false,
      output: null,
      votes: [
        syntheticVote('gamma', 0.05, null, null),
        syntheticVote('delta', 0.07),
      ],
    }),
    // judge_human_disagreement: judges love what the human rejected.
    syntheticRow({
      contentKind: 'caption',
      fixtureId: 'caption-judge-human',
      humanLabel: { band: { max: 0.3, min: 0.1 }, decision: 'reject' },
      votes: [syntheticVote('gamma', 0.8), syntheticVote('delta', 0.85)],
    }),
    // judge_disagreement: panel spread 0.8.
    syntheticRow({
      contentKind: 'caption',
      fixtureId: 'caption-judge-spread',
      votes: [syntheticVote('gamma', 0.1), syntheticVote('delta', 0.9)],
    }),
    // Both sides of the split pair below.
    syntheticRow({
      contentKind: 'caption',
      fixtureId: 'caption-pairwise',
      votes: [syntheticVote('gamma', 0.6), syntheticVote('delta', 0.62)],
    }),
    syntheticRow({
      artifactRef: 'media/caption-pairwise/beta-compiled.png',
      contentKind: 'caption',
      contestant: SYNTHETIC_CONTESTANTS.challenger,
      fixtureId: 'caption-pairwise',
      votes: [syntheticVote('gamma', 0.7), syntheticVote('delta', 0.72)],
    }),
    // A private real-brand stand-in with a clean run: zero outliers.
    ...['01', '02', '03'].map((suffix) =>
      syntheticRow({
        brandFixtureId: 'private-brand-01',
        contentKind: 'ad-copy',
        contestant: SYNTHETIC_CONTESTANTS.challenger,
        fixtureId: `ad-copy-private-${suffix}`,
        fixtureVisibility: 'private',
        votes: [syntheticVote('gamma', 0.7), syntheticVote('delta', 0.72)],
      }),
    ),
  ];
}

/** judge_disagreement: the judges split on the challenger vs the baseline. */
export function buildSyntheticOutlierPairs(): PairwiseResult[] {
  return [
    {
      baselineId: SYNTHETIC_CONTESTANTS.baseline.id,
      battleVotes: [
        syntheticVote('gamma', null, 'a', 'gamma prefers the challenger'),
        syntheticVote('delta', null, 'b', 'delta prefers the baseline'),
      ],
      challengerId: SYNTHETIC_CONTESTANTS.challenger.id,
      contentKind: 'caption',
      fixtureId: 'caption-pairwise',
      isPositionBiased: false,
      orderedChoice: 'tie',
      pointwiseChoice: 'a',
      verdict: 'tie',
      voidReason: null,
    },
  ];
}

/** Fixture inputs for every row except the disaster, whose input is lost. */
export function buildSyntheticFixtureRows(): Map<string, FixtureRow> {
  const fixtureIds = [
    ...new Set(buildSyntheticOutlierRows().map((row) => row.fixtureId)),
  ].filter((fixtureId) => fixtureId !== 'ad-copy-disaster');

  return new Map(
    fixtureIds.map((fixtureId) => [
      fixtureId,
      {
        brandFixtureId: fixtureId.includes('private')
          ? 'private-brand-01'
          : 'synthetic-kelder',
        contentKind: fixtureId.startsWith('caption') ? 'caption' : 'ad-copy',
        expected: {},
        id: fixtureId,
        input: {
          brief: { bannedPhrases: [], isCtaRequired: false },
          prompt: `Synthetic prompt for ${fixtureId}`,
        },
        rubricVersion: 'synthetic-rubric-v1',
        source: {
          reference: `synthetic/${fixtureId}`,
          visibility: fixtureId.includes('private') ? 'private' : 'synthetic',
        },
      },
    ]),
  );
}

import {
  SCHNELL_ABLATION_BRAND_KIT,
  SCHNELL_ABLATION_MODEL_KEY,
  SCHNELL_ABLATION_SCENARIOS,
  SCHNELL_GUIDED_LIFT_THRESHOLD,
  SCHNELL_UNBRANDED_REGRESSION_LIMIT,
} from '@api/services/generation-brief/schnell-live-ablation';
import { z } from 'zod';
import { taskSchema } from '../bench/schema';
import {
  type MediaContestant,
  type MediaLadderSection,
  type MediaTask,
  mediaTaskSchema,
} from './contracts';
import {
  buildPairRatingSheet,
  type PairRating,
  scoreJudgeHumanAgreement,
} from './rating-sheet';
import { AURORA_BRAND_KEY } from './tasks';

/**
 * Re-score of the #3470 FLUX Schnell grid on pixels. Same 12 scenarios and
 * seeds; `legacy` is the raw route (the objective as written), `compiled` is
 * the product's compiled route with the Aurora kit as visual direction on the
 * guided cohort. The published #3470 verdict was a prompt-string contract
 * check; here every pass/fail comes from judges that saw the images (#4921
 * FR 6), and a human anchor sheet checks the judges on at least four guided
 * and four unbranded pairs.
 *
 * Known difference from #3470: the product compiles only with prompt
 * enhancement on, so the compiled arm runs the harness too (#3470 compiled
 * with `promptEnhancementEnabled: false`). The report states it.
 */

export const SCHNELL_GRID_SEASON_ID = 'internal-3470-schnell-grid';
export const GRID_PASS_THRESHOLD = 0.5;
export const MIN_HUMAN_ANCHORS_PER_COHORT = 4;

const GUIDED_RUBRIC = [
  'Does the image depict the objective?',
  'Does it carry the supplied brand direction (materials, palette, lighting, negative space)?',
  'Craft, only after the two checks above',
];
const UNBRANDED_RUBRIC = [
  'Does the image depict the objective?',
  'Is it free of imposed brand styling the objective did not ask for?',
  'Craft, only after the two checks above',
];

export function buildSchnellGridTasks(): MediaTask[] {
  return SCHNELL_ABLATION_SCENARIOS.map((scenario) => {
    const isGuided = scenario.cohort === 'guided';
    return mediaTaskSchema.parse({
      brandKey: isGuided ? AURORA_BRAND_KEY : null,
      compiledFidelity: scenario.fidelityMode,
      evaluationCriteria: isGuided ? [SCHNELL_ABLATION_BRAND_KIT] : [],
      fixedSeed: scenario.seed,
      source: 'generation-brief-corpus',
      style: isGuided ? SCHNELL_ABLATION_BRAND_KIT : null,
      task: taskSchema.parse({
        id: scenario.id,
        isDraft: false,
        medium: 'image',
        outputSpec: { aspectRatio: '1:1', count: 1 },
        prompt: scenario.objective,
        rationale: `#3470 ${scenario.cohort} scenario, replayed with a judged verdict.`,
        referenceRoles: ['none'],
        rubric: isGuided ? GUIDED_RUBRIC : UNBRANDED_RUBRIC,
        title: scenario.id,
        version: 1,
      }),
      visibility: 'public',
    });
  });
}

/** Legacy = raw route; compiled = product compiled route. Same model, same seeds. */
export function selectSchnellGridContestants(
  contestants: readonly MediaContestant[],
): { legacy: MediaContestant; compiled: MediaContestant } {
  const own = contestants.filter(
    (contestant) => contestant.registryKey === SCHNELL_ABLATION_MODEL_KEY,
  );
  const legacy = own.find((contestant) => contestant.route.kind === 'raw');
  const compiled = own.find(
    (contestant) => contestant.route.kind === 'compiled',
  );
  if (!legacy || !compiled) {
    throw new Error(
      `${SCHNELL_ABLATION_MODEL_KEY} needs both a raw and a compiled contestant in the registry`,
    );
  }
  return { compiled, legacy };
}

export const schnellGridSummarySchema = z.object({
  modelKey: z.string(),
  compiledArmUsesPromptEnhancement: z.literal(true),
  passThreshold: z.number(),
  guided: z.object({
    legacyPassRate: z.number().nullable(),
    compiledPassRate: z.number().nullable(),
    liftPercentagePoints: z.number().nullable(),
    meetsLift: z.boolean().nullable(),
    compiledWinRate: z.number().nullable(),
  }),
  unbranded: z.object({
    legacyPassRate: z.number().nullable(),
    compiledPassRate: z.number().nullable(),
    regressionPercentagePoints: z.number().nullable(),
    meetsRegressionLimit: z.boolean().nullable(),
    compiledWinRate: z.number().nullable(),
  }),
  thresholds: z.object({
    guidedLift: z.number(),
    unbrandedRegressionLimit: z.number(),
  }),
  humanAnchors: z.object({
    guidedRated: z.number().int(),
    unbrandedRated: z.number().int(),
    isSufficient: z.boolean(),
    agreement: z.number().nullable(),
  }),
});

export type SchnellGridSummary = z.infer<typeof schnellGridSummarySchema>;

interface ArmPass {
  passes: number;
  total: number;
}

function rate(value: ArmPass): number | null {
  return value.total === 0 ? null : value.passes / value.total;
}

function points(value: number | null): number | null {
  return value === null ? null : Math.round(value * 1000) / 10;
}

/**
 * Judged pass per answer: mean adherence ≥ threshold, and on guided rows mean
 * brand fit ≥ threshold. A void answer is a fail, as a failed generation was
 * in #3470.
 */
export function summarizeSchnellGrid(
  section: MediaLadderSection,
  legacy: MediaContestant,
  compiled: MediaContestant,
  anchors: readonly PairRating[],
): SchnellGridSummary {
  const cohortOf = (taskId: string): 'guided' | 'unbranded' | null =>
    SCHNELL_ABLATION_SCENARIOS.find((scenario) => scenario.id === taskId)
      ?.cohort ?? null;

  const scores = new Map<string, { adherence: number[]; brandFit: number[] }>();
  const push = (
    key: string,
    adherence: number,
    brandFit: number | null,
  ): void => {
    const entry = scores.get(key) ?? { adherence: [], brandFit: [] };
    entry.adherence.push(adherence);
    if (brandFit !== null) entry.brandFit.push(brandFit);
    scores.set(key, entry);
  };
  const mean = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;

  for (const record of section.matches) {
    for (const vote of record.votes) {
      if (!vote.dimensions) continue;
      for (const side of ['a', 'b'] as const) {
        const dims = vote.dimensions[side];
        push(
          `${record.match.taskId}|${record.match[side].contestantId}`,
          mean(dims.adherence.map((line) => line.yesProbability)),
          dims.brandFit,
        );
      }
    }
  }

  const arms: Record<
    'guided' | 'unbranded',
    Record<'legacy' | 'compiled', ArmPass>
  > = {
    guided: {
      compiled: { passes: 0, total: 0 },
      legacy: { passes: 0, total: 0 },
    },
    unbranded: {
      compiled: { passes: 0, total: 0 },
      legacy: { passes: 0, total: 0 },
    },
  };
  for (const answer of section.answers) {
    const cohort = cohortOf(answer.taskId);
    const arm =
      answer.contestantId === legacy.contestant.id
        ? 'legacy'
        : answer.contestantId === compiled.contestant.id
          ? 'compiled'
          : null;
    if (!cohort || !arm) continue;
    const entry = scores.get(`${answer.taskId}|${answer.contestantId}`);
    const isAdherent =
      entry !== undefined &&
      entry.adherence.length > 0 &&
      mean(entry.adherence) >= GRID_PASS_THRESHOLD;
    const isOnBrand =
      cohort === 'unbranded' ||
      (entry !== undefined &&
        entry.brandFit.length > 0 &&
        mean(entry.brandFit) >= GRID_PASS_THRESHOLD);
    arms[cohort][arm].total += 1;
    if (answer.voidReason === null && isAdherent && isOnBrand) {
      arms[cohort][arm].passes += 1;
    }
  }

  const compiledWinRate = (cohort: 'guided' | 'unbranded'): number | null => {
    const decided = section.matches.filter(
      (record) =>
        cohortOf(record.match.taskId) === cohort &&
        record.match.state === 'recorded',
    );
    if (decided.length === 0) return null;
    const wins = decided.filter(
      (record) =>
        record.match[record.match.verdict === 'a' ? 'a' : 'b'].contestantId ===
        compiled.contestant.id,
    ).length;
    return wins / decided.length;
  };

  const guidedLegacy = rate(arms.guided.legacy);
  const guidedCompiled = rate(arms.guided.compiled);
  const unbrandedLegacy = rate(arms.unbranded.legacy);
  const unbrandedCompiled = rate(arms.unbranded.compiled);
  const lift =
    guidedLegacy === null || guidedCompiled === null
      ? null
      : points(guidedCompiled - guidedLegacy);
  const regression =
    unbrandedLegacy === null || unbrandedCompiled === null
      ? null
      : points(unbrandedLegacy - unbrandedCompiled);

  const rated = anchors.filter((anchor) => anchor.humanChoice !== null);
  const guidedRated = rated.filter(
    (anchor) => anchor.cohort === 'guided',
  ).length;
  const unbrandedRated = rated.filter(
    (anchor) => anchor.cohort === 'unbranded',
  ).length;
  const { agreement } = scoreJudgeHumanAgreement(section, anchors);

  return schnellGridSummarySchema.parse({
    compiledArmUsesPromptEnhancement: true,
    guided: {
      compiledPassRate: guidedCompiled,
      compiledWinRate: compiledWinRate('guided'),
      legacyPassRate: guidedLegacy,
      liftPercentagePoints: lift,
      meetsLift: lift === null ? null : lift >= SCHNELL_GUIDED_LIFT_THRESHOLD,
    },
    humanAnchors: {
      agreement,
      guidedRated,
      isSufficient:
        guidedRated >= MIN_HUMAN_ANCHORS_PER_COHORT &&
        unbrandedRated >= MIN_HUMAN_ANCHORS_PER_COHORT,
      unbrandedRated,
    },
    modelKey: SCHNELL_ABLATION_MODEL_KEY,
    passThreshold: GRID_PASS_THRESHOLD,
    thresholds: {
      guidedLift: SCHNELL_GUIDED_LIFT_THRESHOLD,
      unbrandedRegressionLimit: SCHNELL_UNBRANDED_REGRESSION_LIMIT,
    },
    unbranded: {
      compiledPassRate: unbrandedCompiled,
      compiledWinRate: compiledWinRate('unbranded'),
      legacyPassRate: unbrandedLegacy,
      meetsRegressionLimit:
        regression === null
          ? null
          : regression <= SCHNELL_UNBRANDED_REGRESSION_LIMIT,
      regressionPercentagePoints: regression,
    },
  });
}

/** Blank anchor sheet: every judged grid pair, tagged with its #3470 cohort. */
export function buildHumanAnchorSheet(
  section: MediaLadderSection,
): PairRating[] {
  return buildPairRatingSheet(
    section,
    (taskId) =>
      SCHNELL_ABLATION_SCENARIOS.find((scenario) => scenario.id === taskId)
        ?.cohort ?? null,
  );
}

import type { IPersuasionScores } from '@genfeedai/contracts/interfaces/analytics/evaluation.interface';

import type {
  ContentHarnessContribution,
  ContentHarnessInput,
  ContentHarnessPack,
} from '../types';

/**
 * The four layers a piece of content has to clear before it travels:
 *
 * 1. Demand — is anyone already looking for this?
 * 2. Choice — does it win the first beat against everything else in the feed?
 * 3. Consumption — does it hold attention to the end?
 * 4. Conversion — does the ask read as the next step in the story?
 *
 * Layer ids double as the score keys returned in `IEvaluationScores.persuasion`,
 * so the rubric asked for and the rubric stored stay the same vocabulary.
 */
export const PERSUASION_LAYERS = [
  {
    criterion:
      'Demand fit: does this attach to a desire the audience already has, rather than one it would have to be taught?',
    id: 'demandFit',
    label: 'Demand',
    scoreKey: 'demandFit',
  },
  {
    criterion:
      'Hook strength: does the first line (or first three seconds) give a specific reason to stop, not a category announcement?',
    id: 'hookStrength',
    label: 'Choice',
    scoreKey: 'hookStrength',
  },
  {
    criterion:
      'Open-loop integrity: is a question opened early, held across the middle, and actually paid off — not abandoned or answered too soon?',
    id: 'openLoopIntegrity',
    label: 'Consumption',
    scoreKey: 'openLoopIntegrity',
  },
  {
    criterion:
      'CTA naturalness: does the ask land as the obvious next step inside the story, instead of a pitch bolted onto the end?',
    id: 'ctaNaturalness',
    label: 'Conversion',
    scoreKey: 'ctaNaturalness',
  },
] as const;

export type PersuasionLayerId = (typeof PERSUASION_LAYERS)[number]['id'];

/** Score keys contributed to the evaluation rubric, in layer order. */
export const PERSUASION_SCORE_KEYS = PERSUASION_LAYERS.map(
  (layer) => layer.scoreKey,
);

const PERSUASION_SCORE_MIN = 0;
const PERSUASION_SCORE_MAX = 100;

function clampPersuasionScore(value: number): number {
  return Math.round(
    Math.min(PERSUASION_SCORE_MAX, Math.max(PERSUASION_SCORE_MIN, value)),
  );
}

/**
 * `overall` is never requested as an independent judgement call — it is
 * always derived from the four layer scores so the number persisted can
 * never disagree with the layers it summarizes. Defined once here and
 * reused by `normalizePersuasionScores` below (the persistence-boundary
 * step) and described in the provider hint so evaluators know the contract.
 */
function derivePersuasionOverallScore(layerScores: {
  ctaNaturalness: number;
  demandFit: number;
  hookStrength: number;
  openLoopIntegrity: number;
}): number {
  const total = PERSUASION_LAYERS.reduce(
    (sum, layer) => sum + layerScores[layer.scoreKey],
    0,
  );

  return clampPersuasionScore(total / PERSUASION_LAYERS.length);
}

function readPersuasionLayerScore(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? clampPersuasionScore(value)
    : undefined;
}

/**
 * Deterministic normalize/validate step for persuasion scores, meant to run
 * at the persistence boundary (before an evaluation result is stored or
 * rendered). All four layer scores in `PERSUASION_SCORE_KEYS` must be
 * present and numeric or the whole object is rejected — evaluations never
 * fabricate a persuasion score the evaluator did not actually produce, so a
 * missing/invalid rubric leaves the rest of the evaluation untouched.
 * `overall` is always (re)derived from the four layers via
 * `derivePersuasionOverallScore`, so it can never drift from the contract
 * `IPersuasionScores` promises.
 */
export function normalizePersuasionScores(
  value: unknown,
): IPersuasionScores | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const demandFit = readPersuasionLayerScore(record.demandFit);
  const hookStrength = readPersuasionLayerScore(record.hookStrength);
  const openLoopIntegrity = readPersuasionLayerScore(record.openLoopIntegrity);
  const ctaNaturalness = readPersuasionLayerScore(record.ctaNaturalness);

  if (
    demandFit === undefined ||
    hookStrength === undefined ||
    openLoopIntegrity === undefined ||
    ctaNaturalness === undefined
  ) {
    return undefined;
  }

  return {
    ctaNaturalness,
    demandFit,
    hookStrength,
    openLoopIntegrity,
    overall: derivePersuasionOverallScore({
      ctaNaturalness,
      demandFit,
      hookStrength,
      openLoopIntegrity,
    }),
  };
}

const SHORT_FORM_CONTENT_KINDS = new Set([
  'ad-creative',
  'reply',
  'post',
  'script',
  'ugc',
  'video',
  'video-script',
]);

const LONG_FORM_CONTENT_KINDS = new Set([
  'article',
  'email',
  'newsletter',
  'thread',
]);

function buildViralPsychologyContribution(
  input: ContentHarnessInput,
): ContentHarnessContribution {
  const { contentType, objective, offer } = input.intent;
  const isShortForm = SHORT_FORM_CONTENT_KINDS.has(contentType);
  const isLongForm = LONG_FORM_CONTENT_KINDS.has(contentType);
  const isConversion = objective === 'conversion';

  const systemDirectives = [
    'Work the four layers in order: demand, choice, consumption, conversion. A later layer cannot rescue a missing earlier one.',
    'Attach to demand that already exists. Borrow a topic the audience has already proven it cares about, or hitch to an adjacent desire — do not invent a new one.',
    'Earn attention beat by beat. Every line exists to make the next line get read.',
  ];

  const styleDirectives = [
    'Open on the single most specific thing you have: a number, a stake, a contradiction, or a named consequence.',
    'Structure the body so interest and desire build before any ask: attention, then interest, then desire, then action.',
    'Open a loop early and close it deliberately. Do not leave a question dangling and do not resolve it in the same breath you raise it.',
  ];

  if (isShortForm) {
    styleDirectives.push(
      'Assume the first three seconds decide everything. Put the strongest beat first and cut whatever delays it.',
    );
  }

  if (isLongForm) {
    styleDirectives.push(
      'Re-hook at every section break: a reader who skims must be pulled back in by the next opening line.',
    );
  }

  if (isConversion) {
    styleDirectives.push(
      'Make the ask the natural consequence of what the reader just accepted, so it reads as the next step rather than a switch in register.',
    );
    if (offer?.trim()) {
      styleDirectives.push(
        `Keep the offer concrete and singular: ${offer.trim()}.`,
      );
    }
  }

  const guardrails = [
    'Do not open with throat-clearing, a topic label, or scene-setting before the point.',
    'Do not use curiosity gaps you never pay off — an unresolved loop reads as a bait and burns trust.',
    'Do not bolt a pitch onto content that never built desire for it.',
    'Do not manufacture urgency, scarcity, or stakes the offer does not actually have.',
  ];

  return {
    evaluationCriteria: PERSUASION_LAYERS.map((layer) => layer.criterion),
    guardrails,
    providerHints: [
      `Persuasion rubric score fields (0-100 each): overall, ${PERSUASION_SCORE_KEYS.join(', ')}. Score overall as the mean of the four layer scores.`,
    ],
    styleDirectives,
    systemDirectives,
  };
}

/**
 * Built-in viral-psychology pack: the demand → choice → consumption →
 * conversion craft layer. Platform-agnostic, so it composes with
 * `X_PLATFORM_HARNESS_PACK` and with brand packs rather than replacing them.
 * Registered by default in the API harness service.
 */
export const VIRAL_PSYCHOLOGY_HARNESS_PACK: ContentHarnessPack = {
  capabilities: [
    'persuasion-structure',
    'hook-craft',
    'retention-structure',
    'persuasion-evaluation',
  ],
  contribute: buildViralPsychologyContribution,
  description:
    'Viral-psychology pack: demand, hook choice, retention structure, and conversion craft as directives and score keys.',
  id: 'viral-psychology',
  version: '1.0.0',
};

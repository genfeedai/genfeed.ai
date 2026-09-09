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
      `Persuasion rubric score keys (0-100 each): ${PERSUASION_SCORE_KEYS.join(', ')}.`,
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

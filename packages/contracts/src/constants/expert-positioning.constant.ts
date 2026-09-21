import type {
  ExpertPositioningDimensionKey,
  ExpertPositioningRating,
} from '../interfaces/ai/expert-positioning.interface';

/**
 * Expert interview field keys, in the order the positioning step asks them.
 * Answers persist to brand memory as `positioning.<fieldKey>` entries.
 */
export const EXPERT_POSITIONING_FIELD_KEYS = [
  'originStory',
  'bigDomino',
  'newOpportunity',
  'authoritySignals',
  'contrarianBeliefs',
  'transformation',
  'notForWho',
] as const;

export type ExpertPositioningFieldKey =
  (typeof EXPERT_POSITIONING_FIELD_KEYS)[number];

export const EXPERT_POSITIONING_MEMORY_TYPE_PREFIX = 'positioning.';

export function toExpertPositioningMemoryType(
  fieldKey: ExpertPositioningFieldKey,
): string {
  return `${EXPERT_POSITIONING_MEMORY_TYPE_PREFIX}${fieldKey}`;
}

export interface ExpertPositioningDimensionDefinition {
  key: ExpertPositioningDimensionKey;
  label: string;
  weight: number;
  followUpFieldKey: ExpertPositioningFieldKey;
  followUpQuestion: string;
}

/**
 * `expert-validator` rubric: six dimensions scored 0-10 and weighted.
 * The weights sum to 9, so the weighted total is normalized to 100.
 */
export const EXPERT_POSITIONING_DIMENSIONS: readonly ExpertPositioningDimensionDefinition[] =
  [
    {
      followUpFieldKey: 'originStory',
      followUpQuestion:
        'What was the moment you became the person you are now? Name the flaw or struggle you had before it.',
      key: 'attractiveCharacter',
      label: 'Attractive character',
      weight: 2,
    },
    {
      followUpFieldKey: 'originStory',
      followUpQuestion:
        'Tell the story in five beats: where you were, the wall you hit, what you realized, what you did, and where you are now.',
      key: 'originStory',
      label: 'Origin story',
      weight: 1.5,
    },
    {
      followUpFieldKey: 'bigDomino',
      followUpQuestion:
        'Finish this sentence: "If my audience believed ___, every other objection would stop mattering."',
      key: 'bigDomino',
      label: 'Big Domino',
      weight: 2,
    },
    {
      followUpFieldKey: 'newOpportunity',
      followUpQuestion:
        'What old way are you asking people to stop doing, and what is the new way you replace it with?',
      key: 'newOpportunity',
      label: 'New opportunity',
      weight: 1.5,
    },
    {
      followUpFieldKey: 'authoritySignals',
      followUpQuestion:
        'List concrete proof: results with numbers, clients or brands you worked with, credentials, and media.',
      key: 'authoritySignals',
      label: 'Authority signals',
      weight: 1,
    },
    {
      followUpFieldKey: 'contrarianBeliefs',
      followUpQuestion:
        'What do most people in your field get wrong that you would say out loud on stage?',
      key: 'differentiation',
      label: 'Differentiation',
      weight: 1,
    },
  ];

export const EXPERT_POSITIONING_MAX_WEIGHTED_SCORE =
  EXPERT_POSITIONING_DIMENSIONS.reduce(
    (total, dimension) => total + dimension.weight * 10,
    0,
  );

export const EXPERT_POSITIONING_RATING_BANDS: readonly {
  minScore: number;
  rating: ExpertPositioningRating;
  label: string;
}[] = [
  { label: 'Expert positioned', minScore: 85, rating: 'expert_positioned' },
  { label: 'Good foundation', minScore: 70, rating: 'good_foundation' },
  { label: 'Needs work', minScore: 55, rating: 'needs_work' },
  { label: 'Commodity zone', minScore: 40, rating: 'commodity_zone' },
  { label: 'Invisible', minScore: 0, rating: 'invisible' },
];

export function resolveExpertPositioningRating(
  totalScore: number,
): ExpertPositioningRating {
  return (
    EXPERT_POSITIONING_RATING_BANDS.find((band) => totalScore >= band.minScore)
      ?.rating ?? 'invisible'
  );
}

export function getExpertPositioningRatingLabel(
  rating: ExpertPositioningRating,
): string {
  return (
    EXPERT_POSITIONING_RATING_BANDS.find((band) => band.rating === rating)
      ?.label ?? 'Invisible'
  );
}

/** Positioning interview answers keyed by expert field key. */
export type ExpertPositioningAnswers = Partial<
  Record<ExpertPositioningFieldKey, string>
>;

export function isExpertPositioningFieldKey(
  value: string,
): value is ExpertPositioningFieldKey {
  return (EXPERT_POSITIONING_FIELD_KEYS as readonly string[]).includes(value);
}

import { readRecordOrEmpty as readRecord } from '@api/shared/utils/object/read-record-or-empty.util';
import type {
  ExpertPositioningDimensionKey,
  ExpertPositioningRating,
  IExpertPositioningDimensionScore,
  IExpertPositioningScore,
  IHarnessAvoidFeedbackEntry,
  IHarnessGoodFeedbackEntry,
} from '@genfeedai/contracts/interfaces';
import { readString } from '@genfeedai/utils/data/extract.util';

const EXPERT_POSITIONING_DIMENSION_KEYS: readonly ExpertPositioningDimensionKey[] =
  [
    'attractiveCharacter',
    'originStory',
    'bigDomino',
    'newOpportunity',
    'authoritySignals',
    'differentiation',
  ];

const EXPERT_POSITIONING_RATINGS: readonly ExpertPositioningRating[] = [
  'expert_positioned',
  'good_foundation',
  'needs_work',
  'commodity_zone',
  'invisible',
];

export function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

export function readStringRecord(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(readRecord(value))
      .map(([key, item]) => [key, readString(item)])
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}

export function readStringArrayRecord(
  value: unknown,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(readRecord(value))
      .map(([key, item]) => [key, readStringArray(item)])
      .filter(([, items]) => items.length > 0),
  );
}

/**
 * `avoidFeedback` entries carry non-string fields (isAutoAdded, nested
 * content/reason/source/addedAt), so they cannot round-trip through the
 * generic `readStringArrayRecord` helpers above — validate the shape
 * explicitly instead.
 */
function readAvoidFeedbackEntry(
  value: unknown,
): IHarnessAvoidFeedbackEntry | undefined {
  const record = readRecord(value);
  const content = readString(record.content);
  const source = readString(record.source);
  const addedAt = readString(record.addedAt);
  if (!content || !source || !addedAt) {
    return undefined;
  }

  return {
    addedAt,
    content,
    isAutoAdded: Boolean(record.isAutoAdded),
    reason: readString(record.reason),
    source,
  };
}

export function readAvoidFeedback(
  value: unknown,
): IHarnessAvoidFeedbackEntry[] {
  return Array.isArray(value)
    ? value
        .map((item) => readAvoidFeedbackEntry(item))
        .filter((item): item is IHarnessAvoidFeedbackEntry => Boolean(item))
    : [];
}

export function readGoodFeedback(value: unknown): IHarnessGoodFeedbackEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const record = readRecord(item);
    const content = readString(record.content);
    const source = readString(record.source);
    const addedAt = readString(record.addedAt);
    return content && source && addedAt ? [{ addedAt, content, source }] : [];
  });
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function isPositioningDimensionKey(
  value: unknown,
): value is ExpertPositioningDimensionKey {
  return (
    typeof value === 'string' &&
    (EXPERT_POSITIONING_DIMENSION_KEYS as readonly string[]).includes(value)
  );
}

function readPositioningDimension(
  value: unknown,
): IExpertPositioningDimensionScore | undefined {
  const record = readRecord(value);
  const score = readNumber(record.score);
  const weight = readNumber(record.weight);
  if (
    !isPositioningDimensionKey(record.key) ||
    score === undefined ||
    !weight
  ) {
    return undefined;
  }

  return {
    followUpFieldKey: readString(record.followUpFieldKey) ?? '',
    followUpQuestion: readString(record.followUpQuestion) ?? '',
    key: record.key,
    label: readString(record.label) ?? record.key,
    maxWeightedScore: readNumber(record.maxWeightedScore) ?? weight * 10,
    score,
    weight,
    weightedScore: readNumber(record.weightedScore) ?? score * weight,
  };
}

/**
 * The positioning scorecard is server-computed; validate the stored JSON
 * shape instead of trusting it so a malformed row never reaches the UI.
 */
export function readPositioning(
  value: unknown,
): IExpertPositioningScore | undefined {
  const record = readRecord(value);
  const totalScore = readNumber(record.totalScore);
  const scoredAt = readString(record.scoredAt);
  const rating = record.rating;
  if (
    totalScore === undefined ||
    !scoredAt ||
    !isPositioningDimensionKey(record.weakestDimension) ||
    typeof rating !== 'string' ||
    !(EXPERT_POSITIONING_RATINGS as readonly string[]).includes(rating)
  ) {
    return undefined;
  }

  const dimensions = Array.isArray(record.dimensions)
    ? record.dimensions
        .map((item) => readPositioningDimension(item))
        .filter((item): item is IExpertPositioningDimensionScore =>
          Boolean(item),
        )
    : [];

  return {
    dimensions,
    rating: rating as ExpertPositioningRating,
    scoredAt,
    totalScore,
    version: 1,
    weakestDimension: record.weakestDimension,
  };
}

export function mergeUnique(...lists: (string[] | undefined)[]): string[] {
  return Array.from(new Set(lists.flatMap((list) => list ?? [])));
}

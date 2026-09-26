/**
 * Report rendering for the media-gate benchmark mode (#4883). Pure functions,
 * so the numbers a `live` flip cites are themselves tested.
 */

import { ModerationCategory } from '@genfeedai/contracts';
import {
  MEDIA_TEXT_DECISION_QUESTIONS,
  type MediaTextDecisionName,
} from '@genfeedai/contracts/api-types/contracts';
import { CONFIDENCE_BIN_COUNT, formatAccuracy } from './report';

/** The threshold policy (docs/operations/media-gates.md). */
export const THRESHOLD_MIN_POSITIVE_RATE = 0.95;
export const THRESHOLD_MIN_POSITIVES = 20;

/** One scored example: a category score or an answer confidence. */
export interface ScorePoint {
  isPositive: boolean;
  score: number;
}

/** A score decile: how many examples fell in it and how many were positive. */
export interface ScoreBin {
  lower: number;
  positives: number;
  total: number;
  upper: number;
}

/** A labelled moderation row: `text` (transcript set) or `url` (image manifest). */
export interface ModerationFixtureRow {
  expected: string[];
  source: string;
  text?: string;
  url?: string;
}

/** One question of a media-text fixture row, flattened for the provider. */
export interface MediaTextBenchmarkCase {
  expected: boolean;
  name: MediaTextDecisionName;
  question: string;
  source: string;
  state: Record<string, unknown>;
}

export interface ModerationCategoryRow {
  category: string;
  falseNegatives: number;
  falsePositives: number;
  precision: number | null;
  recall: number | null;
  truePositives: number;
}

export interface ReadinessResultRow {
  isCorrect: boolean;
  reported: string[];
  sample: {
    expected: { property: string; severity: string } | null;
    id: string;
    kind: string;
    platform: string;
  };
}

const CATEGORY_NAMES = new Set<string>(Object.values(ModerationCategory));

const QUESTION_NAMES = new Set<string>(
  Object.keys(MEDIA_TEXT_DECISION_QUESTIONS),
);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isQuestionName(value: string): value is MediaTextDecisionName {
  return QUESTION_NAMES.has(value);
}

function formatRatio(value: number | null): string {
  return value === null ? '  n/a' : `${(value * 100).toFixed(1)}%`.padStart(6);
}

export function parseModerationRow(
  line: string,
  index: number,
): ModerationFixtureRow {
  const row = asRecord(JSON.parse(line));
  const expected = row?.expected;
  const text = row?.text;
  const url = row?.url;
  if (!row || !Array.isArray(expected)) {
    throw new Error(`Moderation row ${index + 1} has no \`expected\` array`);
  }
  if (typeof text !== 'string' && typeof url !== 'string') {
    throw new Error(
      `Moderation row ${index + 1} has neither \`text\` nor \`url\``,
    );
  }
  const categories = expected.map((category) => String(category));
  const unknown = categories.filter(
    (category) => !CATEGORY_NAMES.has(category),
  );
  if (unknown.length > 0) {
    // A typo would silently turn a positive label into a negative one.
    throw new Error(
      `Moderation row ${index + 1} names unknown categories: ${unknown.join(', ')}`,
    );
  }
  return {
    expected: categories,
    source: typeof row.source === 'string' ? row.source : 'unknown',
    ...(typeof text === 'string' ? { text } : {}),
    ...(typeof url === 'string' ? { url } : {}),
  };
}

/** Deciles of the score, empty ones included; a score of 1 lands in the top bin. */
export function binByScore(points: readonly ScorePoint[]): ScoreBin[] {
  return Array.from({ length: CONFIDENCE_BIN_COUNT }, (_, bin) => {
    const lower = bin / CONFIDENCE_BIN_COUNT;
    const upper = (bin + 1) / CONFIDENCE_BIN_COUNT;
    const isTopBin = bin === CONFIDENCE_BIN_COUNT - 1;
    const inBin = points.filter(
      (point) =>
        point.score >= lower &&
        (point.score < upper || (isTopBin && point.score >= upper)),
    );
    return {
      lower,
      positives: inBin.filter((point) => point.isPositive).length,
      total: inBin.length,
      upper,
    };
  });
}

/**
 * The threshold policy as a number: the lowest bin floor from which every
 * non-empty bin at or above has a positive rate of at least `minRate`, with
 * at least `minPositives` positives at or above it. `null` when no floor
 * qualifies — the set cannot justify a threshold.
 */
export function suggestThreshold(
  bins: readonly ScoreBin[],
  minRate = THRESHOLD_MIN_POSITIVE_RATE,
  minPositives = THRESHOLD_MIN_POSITIVES,
): number | null {
  let suggestion: number | null = null;
  let positivesAbove = 0;
  for (const bin of [...bins].reverse()) {
    if (bin.total > 0 && bin.positives / bin.total < minRate) {
      break;
    }
    positivesAbove += bin.positives;
    if (bin.total > 0 && positivesAbove >= minPositives) {
      suggestion = bin.lower;
    }
  }
  return suggestion;
}

/** Positive rate per non-empty decile, then the suggested threshold. */
export function renderScoreBins(
  bins: readonly ScoreBin[],
  suggestion: number | null,
): string {
  let table = '';
  for (const bin of bins.filter((candidate) => candidate.total > 0)) {
    table += `    ${bin.lower.toFixed(1)}–${bin.upper.toFixed(1)}  positive ${formatAccuracy(bin.positives, bin.total)}\n`;
  }
  const positives = bins.reduce((sum, bin) => sum + bin.positives, 0);
  table +=
    suggestion === null
      ? `    suggested: n/a (needs >= ${THRESHOLD_MIN_POSITIVES} positives in bins at >= ${THRESHOLD_MIN_POSITIVE_RATE * 100}%; ${positives} labelled)\n`
      : `    suggested: ${suggestion.toFixed(1)}\n`;
  return table;
}

export function renderModerationCategories(
  rows: readonly ModerationCategoryRow[],
  thresholds: Readonly<Record<string, number>>,
): string {
  const width = Math.max(...rows.map((row) => row.category.length), 8);
  let table = `  ${'category'.padEnd(width)}  thresh  precision  recall    tp  fp  fn\n`;
  for (const row of rows) {
    table += `  ${row.category.padEnd(width)}  ${(thresholds[row.category] ?? 0).toFixed(2).padStart(6)}  ${formatRatio(row.precision).padStart(9)}  ${formatRatio(row.recall)}  ${String(row.truePositives).padStart(4)}  ${String(row.falsePositives).padStart(2)}  ${String(row.falseNegatives).padStart(2)}\n`;
  }
  return table;
}

/** Per platform and kind: violation samples caught, and clean samples kept clean. */
export function renderReadinessSummary(
  results: readonly ReadinessResultRow[],
): string {
  const groups = new Map<string, ReadinessResultRow[]>();
  for (const result of results) {
    const key = `${result.sample.platform}/${result.sample.kind}`;
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }
  let table = '';
  for (const [key, group] of [...groups].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const correct = group.filter((result) => result.isCorrect).length;
    table += `  ${key.padEnd(18)} ${formatAccuracy(correct, group.length)}\n`;
    for (const miss of group.filter((result) => !result.isCorrect)) {
      const expected = miss.sample.expected
        ? `${miss.sample.expected.property}:${miss.sample.expected.severity}`
        : 'nothing';
      table += `    MISS ${miss.sample.id}: expected ${expected}, reported ${miss.reported.join(', ') || 'nothing'}\n`;
    }
  }
  return table || '  (no readiness samples)\n';
}

/**
 * Flatten `{ state, expected: { isBrandSafe, … } }` rows into one boolean
 * case per question, asked with the exact production question text.
 */
export function parseMediaTextRow(
  line: string,
  index: number,
): MediaTextBenchmarkCase[] {
  const row = asRecord(JSON.parse(line));
  const state = asRecord(row?.state);
  const expected = asRecord(row?.expected);
  if (!row || !state || !expected) {
    throw new Error(
      `Media text row ${index + 1} needs object \`state\` and \`expected\``,
    );
  }
  const source = typeof row.source === 'string' ? row.source : 'unknown';
  return Object.entries(expected).map(([name, value]) => {
    if (!isQuestionName(name) || typeof value !== 'boolean') {
      throw new Error(
        `Media text row ${index + 1}: \`${name}\` is not a boolean media-text decision`,
      );
    }
    return {
      expected: value,
      name,
      question: MEDIA_TEXT_DECISION_QUESTIONS[name],
      source,
      state,
    };
  });
}

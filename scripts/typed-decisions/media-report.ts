/**
 * Report rendering for the media-gate benchmark mode (#4883). Pure functions,
 * so the numbers a `live` flip cites are themselves tested.
 */

import {
  MEDIA_TEXT_DECISION_QUESTIONS,
  type MediaTextDecisionName,
} from '@genfeedai/contracts/api-types/contracts';
import { type BenchmarkOutcome, formatAccuracy } from './report';

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
  return {
    expected: expected.map((category) => String(category)),
    source: typeof row.source === 'string' ? row.source : 'unknown',
    ...(typeof text === 'string' ? { text } : {}),
    ...(typeof url === 'string' ? { url } : {}),
  };
}

/**
 * One outcome per category for a scored row: the thresholded flag against the
 * label, with the category score as the confidence. The calibration table
 * over these is accuracy by score decile, which is where a threshold sits.
 */
export function toModerationOutcomes(
  expected: readonly string[],
  scores: Readonly<Record<string, number | undefined>>,
  thresholds: Readonly<Record<string, number>>,
  latencyMs: number,
): BenchmarkOutcome[] {
  return Object.keys(thresholds)
    .sort()
    .map((category) => {
      const score = scores[category] ?? 0;
      const isExpected = expected.includes(category);
      const isPredicted = score >= (thresholds[category] ?? 1);
      return {
        confidence: score,
        expected: isExpected,
        isCorrect: isExpected === isPredicted,
        latencyMs,
        predicted: isPredicted,
      };
    });
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

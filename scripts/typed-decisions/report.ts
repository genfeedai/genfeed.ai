/**
 * Report rendering for the typed-decision benchmark (#4864). Pure functions,
 * so the numbers a migration quotes in its issue are themselves tested.
 */

import type { TypedDecisionDeterministicAnswer } from '@genfeedai/contracts/interfaces';

export const CONFIDENCE_BIN_COUNT = 10;

export interface BenchmarkOutcome {
  confidence?: number;
  expected: TypedDecisionDeterministicAnswer;
  isCorrect: boolean;
  latencyMs: number;
  predicted?: TypedDecisionDeterministicAnswer;
}

export function isCorrectAnswer(
  expected: TypedDecisionDeterministicAnswer,
  predicted: TypedDecisionDeterministicAnswer,
  scoreTolerance: number,
): boolean {
  return typeof expected === 'number' && typeof predicted === 'number'
    ? Math.abs(expected - predicted) <= scoreTolerance
    : expected === predicted;
}

export function percentile(latenciesMs: number[], fraction: number): number {
  if (latenciesMs.length === 0) {
    return 0;
  }

  const sorted = [...latenciesMs].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1),
  );

  return sorted[index] ?? 0;
}

export function formatAccuracy(correct: number, total: number): string {
  return total === 0
    ? 'n/a'
    : `${((correct / total) * 100).toFixed(1)}% (${correct}/${total})`;
}

/** Expected × predicted counts. Meaningless for a continuous score. */
export function renderConfusionMatrix(outcomes: BenchmarkOutcome[]): string {
  const answered = outcomes.filter(
    (outcome) =>
      outcome.predicted !== undefined && typeof outcome.expected !== 'number',
  );
  if (answered.length === 0) {
    return '  (no discrete answers to compare)\n';
  }

  const labels = [
    ...new Set(
      answered.flatMap((outcome) => [
        String(outcome.expected),
        String(outcome.predicted),
      ]),
    ),
  ].sort();
  const width = Math.max(...labels.map((label) => label.length), 8);
  const pad = (value: string) => value.padEnd(width);

  let table = `  ${pad('expected')} | ${labels.map(pad).join(' ')}\n`;
  for (const expected of labels) {
    const cells = labels.map((predicted) =>
      pad(
        String(
          answered.filter(
            (outcome) =>
              String(outcome.expected) === expected &&
              String(outcome.predicted) === predicted,
          ).length,
        ),
      ),
    );
    table += `  ${pad(expected)} | ${cells.join(' ')}\n`;
  }

  return table;
}

/** Accuracy per confidence decile: the number that justifies a threshold. */
export function renderCalibration(outcomes: BenchmarkOutcome[]): string {
  let table = '';
  for (let bin = 0; bin < CONFIDENCE_BIN_COUNT; bin += 1) {
    const lower = bin / CONFIDENCE_BIN_COUNT;
    const upper = (bin + 1) / CONFIDENCE_BIN_COUNT;
    const isTopBin = bin === CONFIDENCE_BIN_COUNT - 1;
    const inBin = outcomes.filter(
      (outcome) =>
        outcome.confidence !== undefined &&
        outcome.confidence >= lower &&
        (outcome.confidence < upper || (isTopBin && outcome.confidence === 1)),
    );
    if (inBin.length === 0) {
      continue;
    }

    const correct = inBin.filter((outcome) => outcome.isCorrect).length;
    table += `  ${lower.toFixed(1)}–${upper.toFixed(1)}  ${formatAccuracy(correct, inBin.length)}\n`;
  }

  return table || '  (no confidences returned)\n';
}

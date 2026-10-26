import {
  normalizeStructuredPrompt,
  STRUCTURED_PROMPT_LIST_SLOTS,
  STRUCTURED_PROMPT_TEXT_SLOTS,
  type StructuredPrompt,
  type StructuredPromptSlot,
} from '../structured-prompt';
import { learningSeededRandom } from './evaluation';

/**
 * Offline comparison of structured prompt slots against observed outcomes.
 *
 * It answers "do generations that fill this slot (or use this value) score
 * differently from the rest?" and nothing more: it reads stored slots and
 * rewards, enrolls nobody and changes no generation. A gap is only called
 * better or worse when its bootstrap interval, widened for the number of
 * comparisons made, excludes zero. Everything else is within noise, and a
 * group that is too small is reported as insufficient data rather than ranked.
 * Slots are correlational here: a filled slot may simply mark a more careful
 * request, so a verdict is a lead to test, not a cause.
 */

export interface SlotOutcomeObservation {
  /** The slots stored with the prompt that produced the outcome. */
  slots: StructuredPrompt;
  /** Bounded reward for the outcome, in [-1, 1] (see `computeLearningReward`). */
  reward: number;
}

export type SlotComparisonVerdict =
  | 'better'
  | 'worse'
  | 'within_noise'
  | 'insufficient_data';

export interface SlotComparisonGroup {
  count: number;
  mean: number | null;
}

export interface SlotComparison {
  slot: StructuredPromptSlot;
  /**
   * The value compared against the rest of the same slot, lower-cased. `null`
   * compares generations that filled the slot with those that left it empty.
   */
  value: string | null;
  /** Observations that filled the slot / used the value. */
  filled: SlotComparisonGroup;
  /** Observations that left it empty / used another value. */
  rest: SlotComparisonGroup;
  /** `filled.mean - rest.mean`; null while a group is empty. */
  difference: number | null;
  /** Interval of the difference at `1 - alpha`; null when not estimable. */
  lower: number | null;
  upper: number | null;
  verdict: SlotComparisonVerdict;
}

export interface SlotComparisonOptions {
  /** Bootstrap resamples per comparison. Default 2000. */
  replicates?: number;
  /** Fewest observations each side needs before a verdict. Default 20. */
  minPerGroup?: number;
  /** Seed for the resampling, so a report can be reproduced. */
  seed?: string;
  /** Overall false-positive budget, split across the comparisons made. Default 0.05. */
  alpha?: number;
}

export interface SlotComparisonReport {
  observationCount: number;
  /** Observations dropped for a non-finite or out-of-range reward. */
  excludedCount: number;
  /** Comparisons that had enough data on both sides. */
  comparisonCount: number;
  /** Per-comparison error rate after splitting `alpha` across `comparisonCount`. */
  alpha: number;
  comparisons: SlotComparison[];
}

const DEFAULT_REPLICATES = 2000;
const DEFAULT_MIN_PER_GROUP = 20;
const DEFAULT_ALPHA = 0.05;

function mean(values: readonly number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function group(values: readonly number[]): SlotComparisonGroup {
  return { count: values.length, mean: mean(values) };
}

function resampledMean(
  values: readonly number[],
  random: () => number,
): number {
  let total = 0;
  for (let i = 0; i < values.length; i += 1) {
    total += values[Math.floor(random() * values.length)];
  }
  return total / values.length;
}

function quantile(sorted: readonly number[], probability: number): number {
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(probability * sorted.length)),
  );
  return sorted[index];
}

function bootstrapDifference(
  filled: readonly number[],
  rest: readonly number[],
  replicates: number,
  alpha: number,
  seed: string,
): { lower: number; upper: number } {
  const random = learningSeededRandom(seed);
  const differences: number[] = [];
  for (let i = 0; i < replicates; i += 1) {
    differences.push(
      resampledMean(filled, random) - resampledMean(rest, random),
    );
  }
  differences.sort((a, b) => a - b);
  return {
    lower: quantile(differences, alpha / 2),
    upper: quantile(differences, 1 - alpha / 2),
  };
}

interface Candidate {
  slot: StructuredPromptSlot;
  value: string | null;
  filled: number[];
  rest: number[];
}

function slotValues(
  slots: StructuredPrompt,
  slot: StructuredPromptSlot,
): string[] {
  const raw = slots[slot];
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return values.map((value) => value.toLowerCase());
}

function collectCandidates(
  observations: ReadonlyArray<{ slots: StructuredPrompt; reward: number }>,
  minPerGroup: number,
): Candidate[] {
  const candidates: Candidate[] = [];
  const allSlots: readonly StructuredPromptSlot[] = [
    ...STRUCTURED_PROMPT_TEXT_SLOTS,
    ...STRUCTURED_PROMPT_LIST_SLOTS,
  ];

  for (const slot of allSlots) {
    const filled: number[] = [];
    const empty: number[] = [];
    const byValue = new Map<string, number[]>();
    for (const { slots, reward } of observations) {
      const values = slotValues(slots, slot);
      (values.length > 0 ? filled : empty).push(reward);
      for (const value of new Set(values)) {
        byValue.set(value, [...(byValue.get(value) ?? []), reward]);
      }
    }
    candidates.push({ slot, value: null, filled, rest: empty });

    // A value is compared with the rest only for a free-text slot where it is
    // common enough to judge; one-off phrasings would only add noise.
    if (!(STRUCTURED_PROMPT_TEXT_SLOTS as readonly string[]).includes(slot)) {
      continue;
    }
    for (const [value, rewards] of [...byValue].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      if (rewards.length < minPerGroup) continue;
      const others = observations
        .filter(({ slots }) => !slotValues(slots, slot).includes(value))
        .map(({ reward }) => reward);
      candidates.push({ slot, value, filled: rewards, rest: others });
    }
  }
  return candidates;
}

/**
 * Compare every slot, and every common value of a free-text slot, with the
 * rest of the observations. Deterministic for a given seed.
 */
export function compareStructuredPromptSlots(
  input: readonly SlotOutcomeObservation[],
  options: SlotComparisonOptions = {},
): SlotComparisonReport {
  const replicates = Math.max(1, options.replicates ?? DEFAULT_REPLICATES);
  const minPerGroup = Math.max(2, options.minPerGroup ?? DEFAULT_MIN_PER_GROUP);
  const seed = options.seed ?? 'structured-prompt-slots-v1';
  const budget = options.alpha ?? DEFAULT_ALPHA;

  const observations = input
    .filter(
      ({ reward }) => Number.isFinite(reward) && reward >= -1 && reward <= 1,
    )
    .map(({ reward, slots }) => ({
      reward,
      slots: normalizeStructuredPrompt(slots),
    }));

  const candidates = collectCandidates(observations, minPerGroup);
  const isEstimable = (candidate: Candidate) =>
    candidate.filled.length >= minPerGroup &&
    candidate.rest.length >= minPerGroup;
  const comparisonCount = candidates.filter(isEstimable).length;
  const alpha = budget / Math.max(1, comparisonCount);

  const comparisons = candidates.map((candidate): SlotComparison => {
    const filled = group(candidate.filled);
    const rest = group(candidate.rest);
    const difference =
      filled.mean !== null && rest.mean !== null
        ? filled.mean - rest.mean
        : null;
    if (!isEstimable(candidate)) {
      return {
        slot: candidate.slot,
        value: candidate.value,
        filled,
        rest,
        difference,
        lower: null,
        upper: null,
        verdict: 'insufficient_data',
      };
    }
    const { lower, upper } = bootstrapDifference(
      candidate.filled,
      candidate.rest,
      replicates,
      alpha,
      `${seed}:${candidate.slot}:${candidate.value ?? ''}`,
    );
    return {
      slot: candidate.slot,
      value: candidate.value,
      filled,
      rest,
      difference,
      lower,
      upper,
      verdict: lower > 0 ? 'better' : upper < 0 ? 'worse' : 'within_noise',
    };
  });

  return {
    observationCount: observations.length,
    excludedCount: input.length - observations.length,
    comparisonCount,
    alpha,
    comparisons,
  };
}

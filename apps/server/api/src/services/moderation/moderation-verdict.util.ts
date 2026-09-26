import type {
  MediaGateMode,
  ModerationInputResult,
  ModerationTrigger,
  ModerationVerdict,
} from '@genfeedai/contracts/api-types/contracts';
import type { ModerationCategory } from '@genfeedai/contracts';

/**
 * The verdict the thresholds produce: a category is flagged when any input
 * scores at or above that category's threshold. Pure, so the benchmark and
 * the worker compute it identically.
 */
export function evaluateModerationVerdict(
  inputs: readonly ModerationInputResult[],
  thresholds: Readonly<Record<ModerationCategory, number>>,
): ModerationVerdict {
  const triggers: ModerationTrigger[] = [];
  let maxConfidence = 0;

  for (const input of inputs) {
    for (const [category, confidence] of Object.entries(input.scores) as [
      ModerationCategory,
      number | undefined,
    ][]) {
      if (confidence === undefined) {
        continue;
      }
      maxConfidence = Math.max(maxConfidence, confidence);
      const threshold = thresholds[category];
      if (confidence >= threshold) {
        triggers.push({
          category,
          confidence,
          frameIndex: input.frameIndex,
          source: input.source,
          threshold,
        });
      }
    }
  }

  const flaggedCategories = Array.from(
    new Set(triggers.map((trigger) => trigger.category)),
  ).sort();
  return {
    flaggedCategories,
    isFlagged: flaggedCategories.length > 0,
    maxConfidence,
    triggers,
  };
}

/**
 * The verdict gates act on. Only `live` may flag; `shadow` keeps the scores
 * (maxConfidence) but never flags, so it can never tighten a publish.
 */
export function applyModerationMode(
  candidate: ModerationVerdict,
  mode: MediaGateMode,
): ModerationVerdict {
  if (mode === 'live') {
    return candidate;
  }
  return {
    flaggedCategories: [],
    isFlagged: false,
    maxConfidence: candidate.maxConfidence,
    triggers: [],
  };
}

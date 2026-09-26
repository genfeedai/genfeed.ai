import { ModerationCategory } from '@genfeedai/contracts';
import type { ModerationScores } from '@genfeedai/contracts/api-types/contracts';

/** One labelled example scored by a provider. */
export interface ModerationCalibrationSample {
  expected: readonly ModerationCategory[];
  scores: ModerationScores;
}

export interface ModerationCategoryCalibration {
  category: ModerationCategory;
  falseNegatives: number;
  falsePositives: number;
  /** `null` when nothing was predicted for the category. */
  precision: number | null;
  /** `null` when the set has no positive example for the category. */
  recall: number | null;
  truePositives: number;
}

/**
 * Per-category precision and recall of a moderation provider over a labelled
 * set at the given thresholds (#4880). The number every `live` flip must cite
 * (#4883); `null` marks a category the set cannot measure.
 */
export function computeModerationCalibration(
  samples: readonly ModerationCalibrationSample[],
  thresholds: Readonly<Record<ModerationCategory, number>>,
): ModerationCategoryCalibration[] {
  return Object.values(ModerationCategory)
    .sort()
    .map((category) => {
      let truePositives = 0;
      let falsePositives = 0;
      let falseNegatives = 0;
      for (const sample of samples) {
        const isExpected = sample.expected.includes(category);
        const isPredicted =
          (sample.scores[category] ?? 0) >= thresholds[category];
        if (isExpected && isPredicted) truePositives += 1;
        else if (!isExpected && isPredicted) falsePositives += 1;
        else if (isExpected && !isPredicted) falseNegatives += 1;
      }
      const predicted = truePositives + falsePositives;
      const actual = truePositives + falseNegatives;
      return {
        category,
        falseNegatives,
        falsePositives,
        precision: predicted === 0 ? null : truePositives / predicted,
        recall: actual === 0 ? null : truePositives / actual,
        truePositives,
      };
    });
}

import {
  LEARNING_ARMS,
  type LearningArmId,
  type LearningEvaluationRow,
  LearningEvidenceValidationError,
  type LearningPolicyState,
  learningProbabilities,
  validLearningDistribution,
} from '@genfeedai/harness';
import type { ContentLearningDatasetEntry } from '@genfeedai/prisma';

/** Rejects a stored dataset whose entries are not valid learning evidence. */
export function assertLearningDatasetRows(
  rows: readonly ContentLearningDatasetEntry[],
): void {
  for (const [index, row] of rows.entries()) {
    if (!LEARNING_ARMS.includes(row.armId as LearningArmId))
      throw new LearningEvidenceValidationError(
        `dataset.entries[${index}].armId`,
      );
    if (!validLearningDistribution(row.probabilities))
      throw new LearningEvidenceValidationError(
        `dataset.entries[${index}].probabilities`,
      );
    if (
      row.features.length !== 9 ||
      row.features.some((value) => !Number.isFinite(value))
    )
      throw new LearningEvidenceValidationError(
        `dataset.entries[${index}].features`,
      );
    if (!Number.isFinite(row.reward) || Math.abs(row.reward) > 1)
      throw new LearningEvidenceValidationError(
        `dataset.entries[${index}].reward`,
      );
  }
}

/** Training entries per account group, used to weight each entry. */
export function countLearningAccountGroups(
  training: readonly ContentLearningDatasetEntry[],
): Map<string, number> {
  const groupCounts = new Map<string, number>();
  for (const row of training)
    groupCounts.set(
      row.accountGroup,
      (groupCounts.get(row.accountGroup) ?? 0) + 1,
    );
  return groupCounts;
}

/** Scores every entry under the fitted policy for off-policy evaluation. */
export function buildLearningEvaluationRows(
  rows: readonly ContentLearningDatasetEntry[],
  state: LearningPolicyState,
  coefficients: Record<string, number[]>,
): LearningEvaluationRow[] {
  return rows.map((row) => {
    const loggingProbabilities = validLearningDistribution(row.probabilities)
      ? row.probabilities
      : null;
    const predictions = Object.fromEntries(
      LEARNING_ARMS.map((arm) => [
        arm,
        Math.max(
          -1,
          Math.min(
            1,
            coefficients[arm].reduce(
              (sum: number, value: number, i: number) =>
                sum + value * row.features[i],
              0,
            ),
          ),
        ),
      ]),
    ) as Record<LearningArmId, number>;
    return {
      accountGroup: row.accountGroup,
      armId: row.armId as LearningArmId,
      reward: row.reward,
      loggingProbabilities,
      loggedProbability:
        loggingProbabilities?.[row.armId as LearningArmId] ?? null,
      candidateProbabilities: learningProbabilities(
        state,
        row.features,
        LEARNING_ARMS,
      ),
      predictions,
      split: row.split,
      decisionAt: row.decisionAt.toISOString(),
    };
  });
}

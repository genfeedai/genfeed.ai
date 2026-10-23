import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import type {
  LearningArmExclusionV1,
  LearningGenerationContext,
  LearningScope,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import type { ContentLearningAccount } from '@genfeedai/prisma';
import { BadRequestException } from '@nestjs/common';

export interface LearningGenerationInput {
  organizationId: string;
  brandId: string;
  format: LearningScope['format'];
  context?: LearningGenerationContext;
  harnessEnabled: boolean;
  compatible: boolean;
  originalPrompt: string;
  /**
   * Arms the approved brand rules exclude from pilot assignment. Undefined means
   * compatibility was not evaluated, so every non-baseline arm is excluded. Not
   * part of `payloadHash`.
   */
  armExclusions?: LearningArmExclusionV1[];
}
export type LearningCandidateInput = LearningGenerationInput & {
  context: LearningGenerationContext;
};
export interface LearningBatchGenerationInput
  extends Omit<LearningGenerationInput, 'context'> {
  context: Omit<
    LearningGenerationContext,
    'candidateIndex' | 'generationId'
  > & {
    credentialId: string;
  };
  candidates: Array<{ candidateIndex: number; generationId?: string }>;
  replayOnly?: boolean;
}

/** Validates a batch and expands it into single-candidate inputs. */
export function learningBatchCandidateInputs(
  input: LearningBatchGenerationInput,
): {
  inputs: LearningCandidateInput[];
  credentialId: string;
  replayOnly: boolean;
} {
  const { candidates, context, replayOnly = false, ...shared } = input;
  const indexes = candidates.map(({ candidateIndex }) => candidateIndex);
  if (
    !candidates.length ||
    candidates.length > 50 ||
    new Set(indexes).size !== indexes.length ||
    indexes.some((index) => !Number.isInteger(index) || index < 0) ||
    candidates.some(
      ({ generationId }) =>
        generationId !== undefined &&
        (!generationId || generationId.length > 256),
    ) ||
    !context.requestKey ||
    context.requestKey.length > 256 ||
    !context.credentialId
  )
    throw new BadRequestException('Invalid learning request identity');
  return {
    inputs: candidates.map(({ candidateIndex, generationId }) => ({
      ...shared,
      context: {
        ...context,
        candidateIndex,
        ...(generationId === undefined ? {} : { generationId }),
      },
    })),
    credentialId: context.credentialId,
    replayOnly,
  };
}
/** Same identity and payload hashing as single-candidate resolution. */
export function learningCandidateIdentity(
  input: LearningCandidateInput,
  credentialId: string,
) {
  const { context } = input;
  const objective = context.objective ?? 'awareness',
    destinationKey = learningHash([credentialId, input.format, objective]);
  const payloadHash = learningHash([
    input.originalPrompt,
    input.harnessEnabled,
    input.compatible,
    context,
    input.format,
  ]);
  return {
    objective,
    destinationKey,
    payloadHash,
    requestKey: context.requestKey,
    candidateIndex: context.candidateIndex,
  };
}

/** Why a baseline decision cannot apply learning, in precedence order. */
export function baselineCensorshipReason(
  account: Pick<ContentLearningAccount, 'mode' | 'failureReason'>,
  input: Pick<LearningGenerationInput, 'harnessEnabled' | 'compatible'>,
  baselineCount: number,
): string {
  if (['shadow', 'paused'].includes(account.mode)) return account.mode;
  if (!input.harnessEnabled) return 'harness_off';
  if (!input.compatible) return 'incompatible_intent';
  return (
    account.failureReason ??
    (baselineCount < 20
      ? 'insufficient_baseline'
      : 'experiment_assignment_unavailable')
  );
}

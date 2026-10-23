import type { LearningGenerationInput } from '@api/collections/content-learning/services/learning-decision-batch.helper';
import {
  learningHash,
  learningScopeKey,
} from '@api/collections/content-learning/services/learning-operation.service';
import type { LearningCellDescriptor } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import {
  LEARNING_ARMS,
  type LearningArmId,
  learningDescriptorTuple,
  validLearningDescriptor,
} from '@genfeedai/harness';
import type {
  ContentLearningAccount,
  ContentLearningDecision,
  ContentLearningScopeState,
} from '@genfeedai/prisma';

/** True when a recorded decision still matches the replaying request's identity. */
export function validLearningReplayIdentityV1(
  input: LearningGenerationInput,
  decision: ContentLearningDecision,
  account: ContentLearningAccount,
  scope: ContentLearningScopeState,
  destinationKey: string,
  descriptor: LearningCellDescriptor,
): boolean {
  const context = input.context;
  if (!context) return false;
  if (
    decision.isDeleted ||
    decision.synthetic ||
    decision.organizationId !== input.organizationId ||
    decision.brandId !== input.brandId ||
    decision.credentialId !== context.credentialId ||
    decision.requestKey !== context.requestKey ||
    decision.candidateIndex !== context.candidateIndex ||
    decision.destinationKey !== destinationKey ||
    account.brandId !== input.brandId ||
    scope.brandId !== input.brandId ||
    !decision.descriptorHash ||
    !validLearningDescriptor(descriptor) ||
    descriptor.format !== input.format ||
    descriptor.objective !== (context.objective ?? 'awareness') ||
    descriptor.configVersion !== decision.configVersion ||
    learningHash(learningDescriptorTuple(descriptor)) !==
      decision.descriptorHash ||
    decision.descriptorHash !== scope.descriptorHash ||
    !validLearningDescriptor(scope.cellDescriptor) ||
    learningHash(learningDescriptorTuple(scope.cellDescriptor)) !==
      decision.descriptorHash ||
    learningScopeKey({
      organizationId: input.organizationId,
      brandId: input.brandId,
      credentialId: decision.credentialId,
      platform: descriptor.platform,
      format: descriptor.format,
      objective: descriptor.objective,
      rewardProfileId: decision.descriptorHash,
    }) !== decision.scopeKey ||
    !LEARNING_ARMS.includes(decision.selectedArmId as LearningArmId)
  )
    return false;
  return true;
}

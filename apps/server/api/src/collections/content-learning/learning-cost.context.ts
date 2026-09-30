import { AsyncLocalStorage } from 'node:async_hooks';
import type { LearningCostAttributionV1 } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';

const storage = new AsyncLocalStorage<Readonly<LearningCostAttributionV1>>();
export function learningCostContext(
  organizationId?: string,
): Readonly<LearningCostAttributionV1> | undefined {
  const context = storage.getStore();
  return context &&
    (!organizationId || context.organizationId === organizationId)
    ? context
    : undefined;
}
export function withLearningCostContext<T>(
  context: LearningCostAttributionV1,
  callback: () => T,
): T {
  if (
    !context.organizationId ||
    !context.opportunityIds.length ||
    new Set(context.opportunityIds).size !== context.opportunityIds.length ||
    context.allocationWeights.length !== context.opportunityIds.length ||
    context.allocationWeights.some(
      (weight) =>
        !Number.isFinite(weight) ||
        Math.abs(weight - 1 / context.opportunityIds.length) > 1e-12,
    )
  )
    throw new Error('Invalid immutable learning cost allocation');
  const frozen = Object.freeze({
    ...context,
    opportunityIds: Object.freeze([...context.opportunityIds]),
    allocationWeights: Object.freeze([...context.allocationWeights]),
  });
  return storage.run(frozen, callback);
}
export function createLearningCostContext(
  organizationId: string,
  opportunityIds: readonly string[],
): LearningCostAttributionV1 {
  return {
    organizationId,
    opportunityIds: [...opportunityIds],
    allocationWeights: opportunityIds.map(() => 1 / opportunityIds.length),
  };
}

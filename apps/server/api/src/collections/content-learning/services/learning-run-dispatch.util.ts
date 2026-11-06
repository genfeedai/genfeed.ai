import type {
  LearningRunClaim,
  LearningRunDispatchScope,
} from '@api/collections/content-learning/interfaces/learning-run-dispatch.interface';
import type { Prisma } from '@genfeedai/prisma';

export function storedJson(value: unknown): Prisma.JsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.JsonValue;
}

export function scopedRunDispatch(
  claim: LearningRunClaim,
): LearningRunDispatchScope | null {
  const organizationId = claim.operation.organizationId;
  if (typeof organizationId !== 'string' || !organizationId.trim()) return null;
  return {
    runId: claim.run.id,
    operationId: claim.operation.id,
    organizationId,
  };
}

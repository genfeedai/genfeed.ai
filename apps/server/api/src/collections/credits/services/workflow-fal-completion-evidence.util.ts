import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import type { Prisma } from '@genfeedai/prisma';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { WorkflowGenerationNodeAllocation } from '@genfeedai/contracts/interfaces/billing';
import type { ModelBillableCompletionInput } from '@genfeedai/contracts/interfaces';

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
function unresolved(): never {
  throw new BusinessLogicException('Workflow Fal completion lacks matching provider and persisted output evidence');
}

/** Read only durable server evidence; an accepted URL alone does not prove delivered billable units. */
export async function readWorkflowFalCompletionEvidence(
  tx: Prisma.TransactionClient,
  continuation: { id: string; ingredientId: string; organizationId: string; executionId: string },
  allocation: WorkflowGenerationNodeAllocation,
): Promise<{ completion: ModelBillableCompletionInput; assetKey: string }> {
  const proof = await tx.workflowNodeContinuation.findFirst({
    select: { externalId: true, providerResult: true },
    where: { id: continuation.id, organizationId: continuation.organizationId, executionId: continuation.executionId, ingredientId: continuation.ingredientId, provider: 'fal' },
  });
  const accepted = object(object(proof?.providerResult).acceptedFalOutput);
  const providerQuantities = object(accepted.completionQuantities);
  const measured = object(object(proof?.providerResult).measuredFalOutput);
  const quantities = measured.externalId === proof?.externalId ? object(measured.measurement) : providerQuantities;
  if (measured.externalId !== undefined && measured.externalId !== proof?.externalId) unresolved();
  if (measured.externalId !== undefined) {
    if (!positive(quantities.framesPerSecond) || !positive(quantities.sizeBytes) || !Number.isSafeInteger(quantities.sizeBytes) || typeof quantities.assetHash !== 'string' || !/^[a-f0-9]{64}$/.test(quantities.assetHash)) unresolved();
    for (const key of ['width', 'height', 'duration'] as const) {
      if (providerQuantities[key] !== undefined && providerQuantities[key] !== quantities[key]) unresolved();
    }
  }
  const artifact = await tx.ingredient.findFirst({
    select: { s3Key: true, metadata: { select: { duration: true, width: true, height: true, fps: true, isDeleted: true } } },
    where: { id: continuation.ingredientId, organizationId: continuation.organizationId, isDeleted: false, category: IngredientCategory.VIDEO, status: { in: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED] } },
  });
  const actual = artifact?.metadata;
  if (!proof?.externalId || accepted.externalId !== proof.externalId || !artifact?.s3Key || !actual || actual.isDeleted || !positive(quantities.duration) || !positive(quantities.width) || !positive(quantities.height) || !Number.isSafeInteger(quantities.width) || !Number.isSafeInteger(quantities.height) || quantities.width !== actual.width || quantities.height !== actual.height || quantities.duration !== actual.duration || (measured.externalId !== undefined && quantities.assetKey !== artifact.s3Key) || (quantities.framesPerSecond !== undefined && quantities.framesPerSecond !== actual.fps)) unresolved();
  const ceiling = allocation.dispatch.quantities;
  if ((ceiling.width !== undefined && actual.width > ceiling.width) || (ceiling.height !== undefined && actual.height > ceiling.height) || (ceiling.duration !== undefined && actual.duration > ceiling.duration) || (ceiling.framesPerSecond !== undefined && (!positive(actual.fps) || actual.fps > ceiling.framesPerSecond))) unresolved();
  return {
    assetKey: artifact.s3Key,
    completion: {
      completedOutputs: 1,
      successfulRequests: 1,
      width: actual.width,
      height: actual.height,
      duration: actual.duration,
      ...(positive(actual.fps) ? { framesPerSecond: actual.fps } : {}),
      ...(ceiling.inputDuration !== undefined ? { inputDuration: ceiling.inputDuration } : {}),
      ...(ceiling.referenceEvidenceHash ? { referenceEvidenceHash: ceiling.referenceEvidenceHash } : {}),
      ...(ceiling.selectors ? { selectors: ceiling.selectors } : {}),
    },
  };
}

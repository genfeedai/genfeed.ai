import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { Prisma } from '@genfeedai/prisma';

type MediaIntentInput = {
  model?: string;
  organizationId: string;
  executionId: string;
  nodeId: string;
  ingredientId: string;
  provider: string;
  actionId: string;
};

export async function createWorkflowMediaCostIntent(
  transaction: Prisma.TransactionClient,
  input: MediaIntentInput,
  continuationId: string,
): Promise<void> {
  const modelKey =
    input.actionId === 'aiAvatarVideo' ? MODEL_KEYS.HEYGEN_AVATAR : input.model;
  const isDirectPlatformMedia =
    input.provider === 'replicate' &&
    ['imageGen', 'videoGen', 'lipSync', 'reframe', 'upscale'].includes(
      input.actionId,
    );
  const model = modelKey
    ? await transaction.model.findFirst({
        where: {
          key: modelKey,
          isDeleted: false,
          OR: [
            { organizationId: input.organizationId },
            { organizationId: null },
          ],
        },
      })
    : null;
  await transaction.mediaVendorCost.create({
    data: {
      organizationId: input.organizationId,
      workflowExecutionId: input.executionId,
      workflowNodeId: input.nodeId,
      workflowOperationId: continuationId,
      ingredientId: input.ingredientId,
      idempotencyKey: `media:${input.organizationId}:${input.ingredientId}`,
      provider: input.provider,
      model: modelKey ?? 'unresolved',
      category: input.actionId,
      units: 0,
      vendorCostMicros: 0,
      costEvidence: 'pending',
      pricingSnapshot: {
        isByok: isDirectPlatformMedia ? false : null,
        billingDisposition: isDirectPlatformMedia
          ? 'not_charged'
          : 'pending_charge',
        providerCostUsd: model?.providerCostUsd ?? null,
        pricingType: model?.pricingType ?? null,
        modelUpdatedAt: model?.updatedAt.toISOString() ?? null,
      },
    },
  });
}

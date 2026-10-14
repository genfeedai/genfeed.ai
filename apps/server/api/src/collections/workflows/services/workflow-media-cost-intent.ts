import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { Prisma } from '@genfeedai/prisma';

type MediaIntentInput = {
  model?: string;
  organizationId: string;
  executionId: string;
  nodeId: string;
  ingredientId: string;
  isByok?: boolean;
  provider: string;
  actionId: string;
};

export async function createWorkflowMediaCostIntent(
  transaction: Prisma.TransactionClient,
  input: MediaIntentInput,
  continuationId: string,
): Promise<void> {
  // The avatar service records the engine row it priced on the output.
  const modelKey =
    input.actionId === 'aiAvatarVideo'
      ? ((
          await transaction.ingredient.findFirst({
            select: { metadata: { select: { model: true } } },
            where: {
              id: input.ingredientId,
              isDeleted: false,
              organizationId: input.organizationId,
            },
          })
        )?.metadata?.model ?? MODEL_KEYS.HEYGEN_AVATAR)
      : input.model;
  // Lip-sync holds its own output credits on the platform key (Replicate or
  // HeyGen); a customer key charges nothing.
  const isSelfFundedLipSync = input.actionId === 'lipSync';
  const isDirectPlatformMedia =
    input.provider === 'replicate' &&
    ['imageGen', 'videoGen', 'reframe', 'upscale'].includes(input.actionId);
  const isByok = input.isByok ?? false;
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
        isByok: isDirectPlatformMedia || isSelfFundedLipSync ? isByok : null,
        billingDisposition:
          isDirectPlatformMedia || (isSelfFundedLipSync && isByok)
            ? 'not_charged'
            : 'pending_charge',
        providerCostUsd: model?.providerCostUsd ?? null,
        pricingType: model?.pricingType ?? null,
        modelUpdatedAt: model?.updatedAt.toISOString() ?? null,
      },
    },
  });
}

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
  const model = input.model
    ? await transaction.model.findFirst({
        where: {
          key: input.model,
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
      model: input.model ?? 'unresolved',
      category: input.actionId,
      units: 0,
      vendorCostMicros: 0,
      costEvidence: 'pending',
      pricingSnapshot: {
        isByok: false,
        billingDisposition: 'not_charged',
        providerCostUsd: model?.providerCostUsd ?? null,
        pricingType: model?.pricingType ?? null,
        modelUpdatedAt: model?.updatedAt.toISOString() ?? null,
      },
    },
  });
}

import { createWorkflowMediaCostIntent } from '@api/collections/workflows/services/workflow-media-cost-intent';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { Prisma } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

describe('workflow media billing intent', () => {
  it.each([
    [
      'aiAvatarVideo',
      'heygen',
      null,
      'pending_charge',
      MODEL_KEYS.HEYGEN_AVATAR,
    ],
    ['imageGen', 'replicate', false, 'not_charged', 'image-model'],
  ])(
    'pins truthful billing disposition for %s',
    async (actionId, provider, isByok, billingDisposition, model) => {
      const transaction = {
        model: { findFirst: vi.fn().mockResolvedValue(null) },
        mediaVendorCost: { create: vi.fn() },
      };
      await createWorkflowMediaCostIntent(
        transaction as unknown as Prisma.TransactionClient,
        {
          actionId: actionId as string,
          provider: provider as string,
          model: 'image-model',
          organizationId: 'org',
          executionId: 'run',
          nodeId: 'node',
          ingredientId: 'asset',
        },
        'continuation',
      );
      expect(transaction.mediaVendorCost.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          model,
          workflowExecutionId: 'run',
          workflowNodeId: 'node',
          costEvidence: 'pending',
          pricingSnapshot: expect.objectContaining({
            isByok,
            billingDisposition,
          }),
        }),
      });
    },
  );
});

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
      MODEL_KEYS.HEYGEN_AVATAR_IV,
    ],
    ['imageGen', 'replicate', false, 'not_charged', 'image-model'],
  ])(
    'pins truthful billing disposition for %s',
    async (actionId, provider, isByok, billingDisposition, model) => {
      const transaction = {
        ingredient: {
          findFirst: vi.fn().mockResolvedValue({
            metadata: { model: MODEL_KEYS.HEYGEN_AVATAR_IV },
          }),
        },
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

  it.each([
    ['heygen', false, 'pending_charge'],
    ['heygen', true, 'not_charged'],
    ['replicate', false, 'pending_charge'],
    ['replicate', true, 'not_charged'],
  ] as const)(
    'resolves a %s lip-sync row as a held charge unless a customer key paid (BYOK %s)',
    async (provider, isByok, billingDisposition) => {
      const transaction = {
        model: { findFirst: vi.fn().mockResolvedValue(null) },
        mediaVendorCost: { create: vi.fn() },
      };
      await createWorkflowMediaCostIntent(
        transaction as unknown as Prisma.TransactionClient,
        {
          actionId: 'lipSync',
          executionId: 'run',
          ingredientId: 'asset',
          isByok,
          model:
            provider === 'heygen' ? MODEL_KEYS.HEYGEN_AVATAR : 'sync/lipsync-2',
          nodeId: 'node',
          organizationId: 'org',
          provider,
        },
        'continuation',
      );
      expect(transaction.mediaVendorCost.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          pricingSnapshot: expect.objectContaining({
            billingDisposition,
            // A boolean stamp lets accounting reconcile the vendor cost.
            isByok,
          }),
        }),
      });
    },
  );

  it('falls back to the flat avatar row when the output records no engine', async () => {
    const transaction = {
      ingredient: { findFirst: vi.fn().mockResolvedValue(null) },
      model: { findFirst: vi.fn().mockResolvedValue(null) },
      mediaVendorCost: { create: vi.fn() },
    };
    await createWorkflowMediaCostIntent(
      transaction as unknown as Prisma.TransactionClient,
      {
        actionId: 'aiAvatarVideo',
        executionId: 'run',
        ingredientId: 'asset',
        nodeId: 'node',
        organizationId: 'org',
        provider: 'heygen',
      },
      'continuation',
    );
    expect(transaction.ingredient.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'asset', isDeleted: false, organizationId: 'org' },
      }),
    );
    expect(transaction.mediaVendorCost.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ model: MODEL_KEYS.HEYGEN_AVATAR }),
    });
  });

  it('records a BYOK Replicate continuation as BYOK in the pricing snapshot', async () => {
    const transaction = {
      model: { findFirst: vi.fn().mockResolvedValue(null) },
      mediaVendorCost: { create: vi.fn() },
    };
    await createWorkflowMediaCostIntent(
      transaction as unknown as Prisma.TransactionClient,
      {
        actionId: 'videoGen',
        executionId: 'run',
        ingredientId: 'asset',
        isByok: true,
        model: 'video-model',
        nodeId: 'node',
        organizationId: 'org',
        provider: 'replicate',
      },
      'continuation',
    );
    expect(transaction.mediaVendorCost.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        pricingSnapshot: expect.objectContaining({ isByok: true }),
      }),
    });
  });
});

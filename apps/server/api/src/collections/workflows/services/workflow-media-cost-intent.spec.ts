import { createWorkflowMediaCostIntent } from '@api/collections/workflows/services/workflow-media-cost-intent';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { Prisma } from '@genfeedai/prisma';
import { describe, expect, it } from 'vitest';

interface IngredientRow {
  id: string;
  isDeleted: boolean;
  metadata: Record<string, unknown>;
  organizationId: string;
}

type Intent = Parameters<typeof createWorkflowMediaCostIntent>[1];

/** A transaction over the ingredients it can read and the vendor costs it writes. */
function ledger(ingredients: IngredientRow[] = []) {
  const costs: Array<Record<string, unknown>> = [];
  const tx = {
    ingredient: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        ingredients.find((row) =>
          Object.entries(where).every(
            ([key, value]) =>
              (row as unknown as Record<string, unknown>)[key] === value,
          ),
        ) ?? null,
    },
    mediaVendorCost: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        costs.push(data);
        return data;
      },
    },
    model: { findFirst: async () => null },
  } as unknown as Prisma.TransactionClient;
  return { costs, tx };
}

const intent = (fields: Partial<Intent>): Intent =>
  ({
    executionId: 'run',
    ingredientId: 'asset',
    nodeId: 'node',
    organizationId: 'org',
    ...fields,
  }) as Intent;

const avatarOutput = (organizationId = 'org'): IngredientRow => ({
  id: 'asset',
  isDeleted: false,
  metadata: { model: MODEL_KEYS.HEYGEN_AVATAR_IV },
  organizationId,
});

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
      const { costs, tx } = ledger([avatarOutput()]);

      await createWorkflowMediaCostIntent(
        tx,
        intent({ actionId, model: 'image-model', provider }),
        'continuation',
      );

      expect(costs).toEqual([
        expect.objectContaining({
          costEvidence: 'pending',
          model,
          pricingSnapshot: expect.objectContaining({
            billingDisposition,
            isByok,
          }),
          workflowExecutionId: 'run',
          workflowNodeId: 'node',
        }),
      ]);
    },
  );

  it.each([
    ['heygen', MODEL_KEYS.HEYGEN_AVATAR, false, 'pending_charge'],
    ['heygen', MODEL_KEYS.HEYGEN_AVATAR, true, 'not_charged'],
    ['replicate', 'sync/lipsync-2', false, 'pending_charge'],
    ['replicate', 'sync/lipsync-2', true, 'not_charged'],
  ] as const)(
    'resolves a %s lip-sync row (%s, BYOK %s) as %s',
    async (provider, model, isByok, billingDisposition) => {
      const { costs, tx } = ledger();

      await createWorkflowMediaCostIntent(
        tx,
        intent({ actionId: 'lipSync', isByok, model, provider }),
        'continuation',
      );

      expect(costs).toEqual([
        expect.objectContaining({
          pricingSnapshot: expect.objectContaining({
            billingDisposition,
            // A boolean stamp lets accounting reconcile the vendor cost.
            isByok,
          }),
        }),
      ]);
    },
  );

  it('resolves an upscale row as a held charge on the platform key', async () => {
    const { costs, tx } = ledger();

    await createWorkflowMediaCostIntent(
      tx,
      intent({
        actionId: 'upscale',
        model: MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
        provider: 'replicate',
      }),
      'continuation',
    );

    expect(costs).toEqual([
      expect.objectContaining({
        pricingSnapshot: expect.objectContaining({
          billingDisposition: 'pending_charge',
          isByok: false,
        }),
      }),
    ]);
  });

  it.each([
    ['records no engine', []],
    ['belongs to another organization', [avatarOutput('org-other')]],
  ])(
    'falls back to the flat avatar row when the output %s',
    async (_label, ingredients) => {
      const { costs, tx } = ledger(ingredients);

      await createWorkflowMediaCostIntent(
        tx,
        intent({ actionId: 'aiAvatarVideo', provider: 'heygen' }),
        'continuation',
      );

      expect(costs).toEqual([
        expect.objectContaining({ model: MODEL_KEYS.HEYGEN_AVATAR }),
      ]);
    },
  );

  it('records a BYOK Replicate continuation as BYOK in the pricing snapshot', async () => {
    const { costs, tx } = ledger();

    await createWorkflowMediaCostIntent(
      tx,
      intent({
        actionId: 'videoGen',
        isByok: true,
        model: 'video-model',
        provider: 'replicate',
      }),
      'continuation',
    );

    expect(costs).toEqual([
      expect.objectContaining({
        pricingSnapshot: expect.objectContaining({ isByok: true }),
      }),
    ]);
  });
});

import type { BrandedGenerationArtifactMaterialService } from '@api/services/branded-generation-receipts/branded-generation-artifact-material.service';
import { hashBrandedGenerationTextV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import type { BrandedGenerationReceiptsService } from '@api/services/branded-generation-receipts/branded-generation-receipts.service';
import { MediaGenerationReceiptsService } from '@api/services/media-generation-receipts/media-generation-receipts.service';
import type { MediaGenerationReceiptOpenInputV1 } from '@api/services/media-generation-receipts/media-generation-receipts.types';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CreditReservationStatus,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import {
  brandedGenerationReceiptV1Schema,
  brandedGenerationResolutionV1Schema,
} from '@genfeedai/contracts/api-types/contracts/branded-generation.contract';
import { MEDIA_GENERATION_WORKLOAD_TYPE } from '@genfeedai/contracts/constants';
import type { BrandedGenerationReceiptV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import type { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

const hash = `sha256:${'a'.repeat(64)}`;
const time = '2026-10-10T12:00:00.000Z';

const learning: NonNullable<BrandedGenerationReceiptV1['learning']> = {
  schemaVersion: 1,
  brandFeedback: { status: 'not_applicable', sourceIds: [] },
  global: {
    status: 'not_applicable',
    scope: { format: 'image', objective: 'engagement' },
  },
  privateAccount: {
    mode: 'no_destination',
    configVersion: 'media-raw-v1',
    synthetic: false,
    application: {
      status: 'unavailable',
      reasonCodes: ['no_destination'],
      privatePolicyApplied: false,
      sharedReleaseApplied: false,
      revalidatedAt: time,
    },
  },
};

/** A schema-valid projection for each lifecycle state the service reads. */
function receipt(
  overrides: Partial<BrandedGenerationReceiptV1> = {},
): BrandedGenerationReceiptV1 {
  const state = overrides.state ?? 'created';
  const isResolved = state !== 'created' && state !== 'cancelled';
  const isDispatched = ['dispatched', 'failed'].includes(state);
  const value = base();
  return brandedGenerationReceiptV1Schema.parse({
    ...value,
    ...(isResolved
      ? {
          resolutionHash: hash,
          learning,
          prompts: {
            ...value.prompts,
            compiled: {
              contentHash: hash,
              retention: 'retained',
              snapshotId: 'p2',
            },
          },
        }
      : {}),
    ...(isDispatched
      ? {
          execution: {
            provider: 'replicate',
            model: 'replicate/flux',
            providerAttemptRef: 'replicate:job-1',
            dispatchClaimedAt: time,
            providerAcceptedAt: time,
            result: state === 'failed' ? 'failed' : 'pending',
          },
          budget: { ...value.budget, generationAttemptsUsed: 1 },
        }
      : {}),
    ...overrides,
  });
}

function base(): BrandedGenerationReceiptV1 {
  return {
    schemaVersion: 1,
    id: 'receipt-1',
    organizationId: 'org-1',
    brandId: 'brand-1',
    actorId: 'user-1',
    requestKey: 'ingredient-1',
    candidateIndex: 0,
    requestHash: hash,
    revision: 0,
    state: 'created',
    mode: 'raw',
    surface: 'studio',
    contentType: 'image',
    format: 'image',
    generationId: 'ingredient-1',
    createdAt: time,
    updatedAt: time,
    snapshot: null,
    resolutionHash: null,
    layers: [],
    learning: null,
    prompts: {
      original: { contentHash: hash, retention: 'retained', snapshotId: 'p1' },
      enhanced: null,
      compiled: null,
    },
    execution: null,
    artifact: null,
    validation: null,
    compliance: 'not_claimed',
    diagnostics: [],
    costs: [],
    budget: {
      version: 'brand-enforcement-v1',
      maximumGenerationAttempts: 1,
      automaticPaidRetries: 0,
      generationAttemptsUsed: 0,
    },
    isDeleted: false,
  };
}

/** A mutation outcome only needs identity, revision and state for chaining. */
function outcome(
  state: BrandedGenerationReceiptV1['state'],
  revision = 0,
): BrandedGenerationReceiptV1 {
  return { ...base(), state, revision };
}

function openInput(
  overrides: Partial<MediaGenerationReceiptOpenInputV1> = {},
): MediaGenerationReceiptOpenInputV1 {
  return {
    organizationId: 'org-1',
    brandId: 'brand-1',
    actorId: 'user-1',
    ingredientId: 'ingredient-1',
    parentIngredientId: 'ingredient-1',
    mediaKind: 'image',
    surface: 'studio',
    provider: 'replicate',
    model: 'replicate/flux',
    originalPrompt: 'A lighthouse at dawn',
    enhancedPrompt: 'A lighthouse at dawn, brand-blue palette',
    compiledPrompt: 'A lighthouse at dawn, brand-blue palette, 35mm',
    generationParameters: { width: 1024, height: 1024, outputs: 1 },
    ...overrides,
  };
}

const actor = {
  organizationId: 'org-1',
  brandId: 'brand-1',
  actorId: 'user-1',
};

function fixture() {
  const mutationResult = (value: BrandedGenerationReceiptV1) => ({
    receipt: value,
    replayed: false,
  });
  const receipts = {
    create: vi.fn().mockResolvedValue(mutationResult(receipt())),
    recordResolution: vi
      .fn()
      .mockResolvedValue(mutationResult(outcome('resolved'))),
    recordDispatch: vi
      .fn()
      .mockImplementation(async (_actor, _id, mutation) =>
        mutationResult(outcome('dispatched', mutation.expectedRevision + 1)),
      ),
    blockBeforeDispatch: vi
      .fn()
      .mockResolvedValue(mutationResult(outcome('blocked'))),
    bindArtifact: vi
      .fn()
      .mockImplementation(async (_actor, _id, mutation) =>
        mutationResult(outcome('checking', mutation.expectedRevision + 1)),
      ),
    recordValidation: vi
      .fn()
      .mockImplementation(async (_actor, _id, mutation) =>
        mutationResult(outcome('ready', mutation.expectedRevision + 1)),
      ),
    blockUnboundCompletion: vi
      .fn()
      .mockImplementation(async (_actor, _id, mutation) =>
        mutationResult({
          ...outcome('blocked', mutation.expectedRevision + 1),
          execution: {
            provider: 'replicate',
            model: 'replicate/flux',
            providerAttemptRef: 'replicate:job-1',
            dispatchClaimedAt: time,
            providerAcceptedAt: time,
            completedAt: time,
            result: 'completed',
          },
        }),
      ),
    recordCosts: vi.fn().mockResolvedValue(mutationResult(outcome('ready'))),
    fail: vi.fn().mockResolvedValue(mutationResult(outcome('failed'))),
    cancel: vi.fn().mockResolvedValue(mutationResult(outcome('cancelled'))),
  };
  const binding = {
    artifact: {
      kind: 'ingredient' as const,
      id: 'ingredient-1',
      version: 's3:v:1',
      contentHash: hash,
      mediaKind: 'image' as const,
      parts: [
        {
          id: 'images/ingredient-1.png',
          version: 's3:v:1',
          contentHash: hash,
          role: 'image' as const,
        },
      ],
    },
    textHash: null,
  };
  const material = {
    describeIngredientArtifact: vi.fn().mockResolvedValue(binding),
  };
  const prisma = {
    ingredient: {
      findFirst: vi.fn().mockResolvedValue({
        brandId: 'brand-1',
        category: IngredientCategory.IMAGE,
        status: IngredientStatus.GENERATED,
        metadata: {
          model: 'replicate/flux',
          externalId: 'job-1',
          externalProvider: 'replicate',
        },
      }),
    },
    brandedGenerationReceipt: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ projection: receipt({ state: 'dispatched' }) }),
    },
    creditReservation: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'hold-1',
        amount: 4,
        settledAmount: null,
        status: CreditReservationStatus.RESERVED,
      }),
    },
  };
  const logger = { warn: vi.fn() };
  const service = new MediaGenerationReceiptsService(
    prisma as unknown as PrismaService,
    receipts as unknown as BrandedGenerationReceiptsService,
    material as unknown as BrandedGenerationArtifactMaterialService,
    logger as unknown as LoggerService,
  );
  return { service, receipts, material, prisma, logger, binding };
}

describe('MediaGenerationReceiptsService', () => {
  describe('open', () => {
    it('creates one raw receipt per output and resolves it with the dispatched prompt', async () => {
      const f = fixture();

      await f.service.open(
        openInput({
          ingredientId: 'ingredient-2',
          isApiKey: true,
          apiKeyId: 'key-1',
          scopes: ['images:write'],
        }),
      );

      const [request, authorizedActor] = f.receipts.create.mock.calls[0];
      expect(request).toEqual({
        schemaVersion: 1,
        actorId: 'user-1',
        organizationId: 'org-1',
        brandId: 'brand-1',
        requestKey: 'ingredient-2',
        candidateIndex: 0,
        surface: 'studio',
        contentType: 'image',
        format: 'image',
        mode: 'raw',
        originalPrompt: 'A lighthouse at dawn',
        provider: 'replicate',
        model: 'replicate/flux',
        generationParameters: { width: 1024, height: 1024, outputs: 1 },
        knowledgeSourceIds: [],
        knowledgeSpaceIds: [],
        generationId: 'ingredient-2',
        parentRequestId: 'ingredient-1',
      });
      expect(authorizedActor).toEqual({
        ...actor,
        isApiKey: true,
        apiKeyId: 'key-1',
        scopes: ['images:write'],
      });
      const [, id, mutation, resolution, enhanced] =
        f.receipts.recordResolution.mock.calls[0];
      expect(id).toBe('receipt-1');
      expect(mutation).toEqual({
        operationKey: 'receipt-1:resolve',
        expectedRevision: 0,
      });
      expect(brandedGenerationResolutionV1Schema.parse(resolution)).toEqual(
        resolution,
      );
      expect(resolution).toMatchObject({
        mode: 'raw',
        status: 'resolved',
        snapshot: null,
        layers: [],
        compiledPrompt: 'A lighthouse at dawn, brand-blue palette, 35mm',
        originalPromptHash: hashBrandedGenerationTextV1('A lighthouse at dawn'),
      });
      expect(enhanced).toBe('A lighthouse at dawn, brand-blue palette');
    });

    it('does not link the first output to itself and leaves replays untouched', async () => {
      const f = fixture();
      f.receipts.create.mockResolvedValue({
        receipt: receipt({ state: 'resolved' }),
        replayed: true,
      });

      await f.service.open(openInput());

      expect(f.receipts.create.mock.calls[0][0]).not.toHaveProperty(
        'parentRequestId',
      );
      expect(f.receipts.recordResolution).not.toHaveBeenCalled();
    });

    it('logs a receipt write failure and never rejects into the generation path', async () => {
      const f = fixture();
      f.receipts.create.mockRejectedValue(new Error('receipt_access_denied'));

      await expect(f.service.open(openInput())).resolves.toBeUndefined();

      expect(f.logger.warn).toHaveBeenCalledWith(
        'Media generation receipt write failed',
        {
          error: 'receipt_access_denied',
          ingredientId: 'ingredient-1',
          organizationId: 'org-1',
          step: 'open',
        },
      );
    });
  });

  describe('recordAccepted', () => {
    it('dispatches a resolved receipt with a provider-scoped attempt reference', async () => {
      const f = fixture();
      f.prisma.brandedGenerationReceipt.findFirst.mockResolvedValue({
        projection: receipt({ state: 'resolved', revision: 1 }),
      });

      await f.service.recordAccepted({
        organizationId: 'org-1',
        ingredientId: 'ingredient-1',
        provider: 'replicate',
        model: 'replicate/flux',
        externalId: 'job-1_0',
      });

      expect(f.prisma.ingredient.findFirst.mock.calls[0][0].where).toEqual({
        id: 'ingredient-1',
        organizationId: 'org-1',
        isDeleted: false,
      });
      expect(
        f.prisma.brandedGenerationReceipt.findFirst.mock.calls[0][0].where,
      ).toEqual({
        organizationId: 'org-1',
        brandId: 'brand-1',
        requestKey: 'ingredient-1',
        candidateIndex: 0,
        isDeleted: false,
      });
      const [dispatchActor, id, mutation, dispatch] =
        f.receipts.recordDispatch.mock.calls[0];
      expect(dispatchActor).toEqual(actor);
      expect(id).toBe('receipt-1');
      expect(mutation).toEqual({
        operationKey: 'receipt-1:dispatch',
        expectedRevision: 1,
      });
      expect(dispatch).toMatchObject({
        provider: 'replicate',
        model: 'replicate/flux',
        providerAttemptRef: 'replicate:job-1_0',
      });
      expect(dispatch.dispatchClaimedAt).toBe(dispatch.providerAcceptedAt);
    });

    it('waits for the open write of the same output before recording acceptance', async () => {
      const f = fixture();
      let finishOpen: () => void = () => undefined;
      f.receipts.create.mockReturnValue(
        new Promise((resolve) => {
          finishOpen = () => resolve({ receipt: receipt(), replayed: false });
        }),
      );
      f.prisma.brandedGenerationReceipt.findFirst.mockResolvedValue({
        projection: receipt({ state: 'resolved', revision: 1 }),
      });

      const opened = f.service.open(openInput());
      const accepted = f.service.recordAccepted({
        organizationId: 'org-1',
        ingredientId: 'ingredient-1',
        provider: 'replicate',
        model: 'replicate/flux',
        externalId: 'job-1',
      });
      await Promise.resolve();
      expect(f.prisma.ingredient.findFirst).not.toHaveBeenCalled();

      finishOpen();
      await Promise.all([opened, accepted]);

      expect(
        f.receipts.recordResolution.mock.invocationCallOrder[0],
      ).toBeLessThan(f.receipts.recordDispatch.mock.invocationCallOrder[0]);
    });

    it('ignores outputs whose receipt is missing or already past resolution', async () => {
      const f = fixture();
      f.prisma.brandedGenerationReceipt.findFirst.mockResolvedValueOnce(null);
      const acceptance = {
        organizationId: 'org-1',
        ingredientId: 'ingredient-1',
        provider: 'replicate',
        model: 'replicate/flux',
        externalId: 'job-1',
      };

      await f.service.recordAccepted(acceptance);
      await f.service.recordAccepted(acceptance);

      expect(f.receipts.recordDispatch).not.toHaveBeenCalled();
    });
  });

  describe('syncTerminal', () => {
    it('binds a completed output, records raw readiness and the hold as its cost', async () => {
      const f = fixture();
      f.prisma.brandedGenerationReceipt.findFirst.mockResolvedValue({
        projection: receipt({ state: 'dispatched', revision: 2 }),
      });

      await f.service.syncTerminal('org-1', 'ingredient-1', 'settled');

      expect(f.material.describeIngredientArtifact).toHaveBeenCalledWith(
        actor,
        'ingredient-1',
      );
      const [, , bindMutation, completion] =
        f.receipts.bindArtifact.mock.calls[0];
      expect(bindMutation).toEqual({
        operationKey: 'receipt-1:bind',
        expectedRevision: 2,
      });
      expect(completion).toMatchObject(f.binding);
      expect(f.receipts.recordValidation).toHaveBeenCalledWith(
        actor,
        'receipt-1',
        { operationKey: 'receipt-1:validate', expectedRevision: 3 },
        'validate',
        null,
      );
      expect(
        f.prisma.creditReservation.findFirst.mock.calls[0][0].where,
      ).toEqual({
        organizationId: 'org-1',
        workloadId: 'ingredient-1',
        workloadType: MEDIA_GENERATION_WORKLOAD_TYPE,
        isDeleted: false,
      });
      expect(f.receipts.recordCosts).toHaveBeenCalledWith(
        actor,
        'receipt-1',
        { operationKey: 'receipt-1:costs', expectedRevision: 4 },
        [
          {
            id: 'generation',
            stage: 'generation',
            status: 'known',
            ledgerId: 'hold-1',
            credits: 4,
          },
        ],
      );
    });

    it('records an honest unavailable cost when no credit hold paid for the output', async () => {
      const f = fixture();
      f.prisma.creditReservation.findFirst.mockResolvedValue({
        id: 'hold-1',
        amount: 4,
        settledAmount: null,
        status: CreditReservationStatus.RELEASED,
      });

      await f.service.syncTerminal('org-1', 'ingredient-1', 'settled');

      const costs = f.receipts.recordCosts.mock.calls[0][3];
      expect(costs).toEqual([
        {
          id: 'generation',
          stage: 'generation',
          status: 'unavailable',
          reasonCode: 'credit_hold_unavailable',
        },
      ]);
      expect(
        brandedGenerationReceiptV1Schema.shape.costs.safeParse(costs).success,
      ).toBe(true);
    });

    it('blocks without an artifact claim when the output cannot be fingerprinted', async () => {
      const f = fixture();
      f.material.describeIngredientArtifact.mockRejectedValue(
        new BadRequestException('receipt_material_limit_exceeded'),
      );

      await f.service.syncTerminal('org-1', 'ingredient-1', 'settled');

      expect(f.receipts.bindArtifact).not.toHaveBeenCalled();
      expect(f.receipts.blockUnboundCompletion).toHaveBeenCalledWith(
        actor,
        'receipt-1',
        { operationKey: 'receipt-1:unbound', expectedRevision: 0 },
        {
          reasonCode: 'receipt_material_limit_exceeded',
          completedAt: expect.any(String),
        },
      );
      expect(f.receipts.recordCosts).toHaveBeenCalled();
    });

    it('resumes a bound receipt at validation and never records its cost twice', async () => {
      const f = fixture();
      const parts = [
        {
          id: 'images/ingredient-1.png',
          version: 's3:v:1',
          contentHash: hash,
          role: 'image' as const,
        },
      ];
      const checking = receipt({
        state: 'dispatched',
        revision: 3,
      });
      f.prisma.brandedGenerationReceipt.findFirst.mockResolvedValueOnce({
        projection: {
          ...checking,
          state: 'checking',
          execution: {
            ...checking.execution,
            result: 'completed',
            completedAt: time,
          },
          artifact: {
            kind: 'ingredient',
            id: 'ingredient-1',
            version: 's3:v:1',
            contentHash: hash,
            mediaKind: 'image',
            parts,
          },
        },
      });

      await f.service.syncTerminal('org-1', 'ingredient-1', 'settled');

      expect(f.material.describeIngredientArtifact).not.toHaveBeenCalled();
      expect(f.receipts.recordValidation.mock.calls[0][2]).toEqual({
        operationKey: 'receipt-1:validate',
        expectedRevision: 3,
      });
      expect(f.receipts.recordCosts).toHaveBeenCalledTimes(1);

      f.receipts.recordValidation.mockResolvedValueOnce({
        receipt: {
          ...outcome('ready', 5),
          costs: [
            {
              id: 'generation',
              stage: 'generation',
              status: 'known',
              ledgerId: 'hold-1',
              credits: 4,
            },
          ],
        },
        replayed: true,
      });
      f.prisma.brandedGenerationReceipt.findFirst.mockResolvedValueOnce({
        projection: {
          ...checking,
          state: 'checking',
          execution: {
            ...checking.execution,
            result: 'completed',
            completedAt: time,
          },
          artifact: {
            kind: 'ingredient',
            id: 'ingredient-1',
            version: 's3:v:1',
            contentHash: hash,
            mediaKind: 'image',
            parts,
          },
        },
      });
      await f.service.syncTerminal('org-1', 'ingredient-1', 'settled');
      expect(f.receipts.recordCosts).toHaveBeenCalledTimes(1);
    });

    it('leaves the receipt dispatched when storage is temporarily unavailable', async () => {
      const f = fixture();
      f.material.describeIngredientArtifact.mockRejectedValue(
        new ServiceUnavailableException('receipt_material_unavailable'),
      );

      await expect(
        f.service.syncTerminal('org-1', 'ingredient-1', 'settled'),
      ).resolves.toBeUndefined();

      expect(f.receipts.blockUnboundCompletion).not.toHaveBeenCalled();
      expect(f.logger.warn).toHaveBeenCalledWith(
        'Media generation receipt write failed',
        expect.objectContaining({ error: 'receipt_material_unavailable' }),
      );
    });

    it('recovers a missed acceptance from persisted provider evidence before binding', async () => {
      const f = fixture();
      f.prisma.brandedGenerationReceipt.findFirst.mockResolvedValue({
        projection: receipt({ state: 'resolved', revision: 1 }),
      });

      await f.service.syncTerminal('org-1', 'ingredient-1', 'settled');

      expect(f.receipts.recordDispatch.mock.calls[0][3]).toMatchObject({
        provider: 'replicate',
        model: 'replicate/flux',
        providerAttemptRef: 'replicate:job-1',
      });
      expect(f.receipts.bindArtifact.mock.calls[0][2]).toEqual({
        operationKey: 'receipt-1:bind',
        expectedRevision: 2,
      });
    });

    it.each([
      ['dispatched', 'fail'],
      ['resolved', 'blockBeforeDispatch'],
      ['created', 'cancel'],
    ] as const)(
      'fails a %s receipt through %s when the output failed',
      async (state, method) => {
        const f = fixture();
        f.prisma.ingredient.findFirst.mockResolvedValue({
          brandId: 'brand-1',
          category: IngredientCategory.VIDEO,
          status: IngredientStatus.FAILED,
          metadata: null,
        });
        f.prisma.brandedGenerationReceipt.findFirst.mockResolvedValue({
          projection: receipt({ state }),
        });

        await f.service.syncTerminal('org-1', 'ingredient-1', 'released');

        expect(f.receipts[method]).toHaveBeenCalledTimes(1);
        expect(f.receipts[method].mock.calls[0][0]).toEqual(actor);
        if (method === 'blockBeforeDispatch')
          expect(f.receipts.blockBeforeDispatch.mock.calls[0][3]).toBe(
            'provider_submission_failed',
          );
        if (method === 'fail')
          expect(f.receipts.fail.mock.calls[0][3]).toEqual({
            reasonCode: 'provider_generation_failed',
            completedAt: expect.any(String),
          });
        expect(f.material.describeIngredientArtifact).not.toHaveBeenCalled();
      },
    );

    it('treats a released hold on a still-processing output as failed, but not a settled one', async () => {
      const f = fixture();
      f.prisma.ingredient.findFirst.mockResolvedValue({
        brandId: 'brand-1',
        category: IngredientCategory.VIDEO,
        status: IngredientStatus.PROCESSING,
        metadata: null,
      });

      await f.service.syncTerminal('org-1', 'ingredient-1', 'settled');
      expect(f.receipts.fail).not.toHaveBeenCalled();

      await f.service.syncTerminal('org-1', 'ingredient-1', 'released');
      expect(f.receipts.fail).toHaveBeenCalledTimes(1);
    });

    it('ignores outputs that are not Studio media or have no receipt', async () => {
      const f = fixture();
      f.prisma.ingredient.findFirst.mockResolvedValueOnce({
        brandId: 'brand-1',
        category: IngredientCategory.MUSIC,
        status: IngredientStatus.GENERATED,
        metadata: null,
      });
      await f.service.syncTerminal('org-1', 'ingredient-1', 'settled');
      expect(
        f.prisma.brandedGenerationReceipt.findFirst,
      ).not.toHaveBeenCalled();

      f.prisma.brandedGenerationReceipt.findFirst.mockResolvedValueOnce(null);
      await f.service.syncTerminal('org-1', 'ingredient-1', 'settled');
      expect(f.material.describeIngredientArtifact).not.toHaveBeenCalled();

      f.prisma.ingredient.findFirst.mockResolvedValueOnce(null);
      await f.service.syncTerminal('org-2', 'ingredient-1', 'settled');
      expect(
        f.prisma.ingredient.findFirst.mock.calls.at(-1)?.[0].where,
      ).toEqual({
        id: 'ingredient-1',
        organizationId: 'org-2',
        isDeleted: false,
      });
      expect(f.receipts.bindArtifact).not.toHaveBeenCalled();
    });
  });
});

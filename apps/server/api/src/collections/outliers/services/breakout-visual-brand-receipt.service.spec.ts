import type { BreakoutGenerationAdmission } from '@api/collections/outliers/services/breakout-generation-admission.util';
import {
  BreakoutVisualBrandReceiptService,
  breakoutVisualBrandRequestKey,
} from '@api/collections/outliers/services/breakout-visual-brand-receipt.service';
import type { BrandValidationReceiptService } from '@api/services/brand-validation/brand-validation-receipt.service';
import type { BrandIdentitySnapshotService } from '@api/services/branded-generation-receipts/brand-identity-snapshot.service';
import type { BrandedGenerationArtifactMaterialService } from '@api/services/branded-generation-receipts/branded-generation-artifact-material.service';
import type { BrandedGenerationReceiptsService } from '@api/services/branded-generation-receipts/branded-generation-receipts.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientCategory } from '@genfeedai/contracts';
import type {
  BrandedGenerationReceiptV1,
  BrandIdentitySnapshotV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import type { LoggerService } from '@libs/logger/logger.service';
import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

type ReceiptState = BrandedGenerationReceiptV1['state'];
const snapshot = { contentHash: 'sha256:snap' } as BrandIdentitySnapshotV1;
const reauthorize = vi.fn(async () => undefined);
const admission = {
  scope: {
    organizationId: 'org-a',
    brandId: 'brand-a',
    credentialId: 'cred-a',
    platform: 'twitter',
    format: 'image',
    strategyId: 'strategy-a',
  },
  actorUserId: 'actor-a',
  workflowExecutionId: 'execution-a',
  reauthorize,
} as unknown as BreakoutGenerationAdmission;
const actor = {
  actorId: 'actor-a',
  brandId: 'brand-a',
  organizationId: 'org-a',
};

function receipt(
  state: ReceiptState,
  revision = 0,
): BrandedGenerationReceiptV1 {
  return { id: 'receipt-a', revision, state } as BrandedGenerationReceiptV1;
}
function setup(
  options: {
    created?: ReceiptState;
    category?: string | null;
    externalId?: string | null;
    validated?: ReceiptState;
  } = {},
) {
  const ingredient =
    options.category === null
      ? null
      : {
          category: options.category ?? IngredientCategory.IMAGE,
          metadata: {
            externalId:
              options.externalId === undefined ? 'ext-1' : options.externalId,
            externalProvider: 'fal',
            model: 'fal/model',
          },
        };
  const prisma = { ingredient: { findFirst: vi.fn(async () => ingredient) } };
  const receipts = {
    create: vi.fn(async () => ({
      receipt: receipt(options.created ?? 'created'),
      replayed: false,
    })),
    recordResolution: vi.fn(async () => ({
      receipt: receipt('resolved', 1),
      replayed: false,
    })),
    recordDispatch: vi.fn(async () => ({
      receipt: receipt('dispatched', 2),
      replayed: false,
    })),
    bindArtifact: vi.fn(async () => ({
      receipt: receipt('checking', 3),
      replayed: false,
    })),
    blockUnboundCompletion: vi.fn(async () => ({
      receipt: receipt('blocked', 3),
      replayed: false,
    })),
  };
  const material = {
    describeIngredientArtifact: vi.fn(async () => ({
      artifact: { id: 'ingredient-1' },
      textHash: null,
    })),
  };
  const snapshots = { preview: vi.fn(async () => snapshot) };
  const validation = {
    validateReceipt: vi.fn(async () => ({
      receipt: receipt(options.validated ?? 'needs_review', 4),
      replayed: false,
    })),
  };
  const logger = { warn: vi.fn() };
  const service = new BreakoutVisualBrandReceiptService(
    prisma as unknown as PrismaService,
    receipts as unknown as BrandedGenerationReceiptsService,
    material as unknown as BrandedGenerationArtifactMaterialService,
    snapshots as unknown as BrandIdentitySnapshotService,
    validation as unknown as BrandValidationReceiptService,
    logger as unknown as LoggerService,
  );
  return { logger, material, prisma, receipts, service, snapshots, validation };
}
const visuals = [{ ingredientId: 'ingredient-1', prompt: 'A scene of it' }];

describe('BreakoutVisualBrandReceiptService', () => {
  it('runs create, resolve, dispatch, bind and validate for a finished visual', async () => {
    const h = setup();
    const outcome = await h.service.validate(admission, visuals);
    expect(outcome).toEqual({ isBlocked: false, states: ['needs_review'] });
    expect(h.receipts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-a',
        contentType: 'image',
        format: 'image',
        generationId: 'ingredient-1',
        mode: 'approved_brand',
        model: 'fal/model',
        organizationId: 'org-a',
        originalPrompt: 'A scene of it',
        provider: 'fal',
        requestKey: 'ingredient-1:brand-validation',
        workflowExecutionId: 'execution-a',
      }),
      actor,
    );
    expect(h.snapshots.preview).toHaveBeenCalledWith(actor);
    const [, id, mutation, resolution] =
      h.receipts.recordResolution.mock.calls[0];
    expect(id).toBe('receipt-a');
    expect(mutation).toEqual({
      expectedRevision: 0,
      operationKey: 'receipt-a:resolve',
    });
    expect(resolution).toMatchObject({
      compiledPrompt: 'A scene of it',
      mode: 'approved_brand',
      snapshot,
      status: 'resolved',
      layers: [{ kind: 'identity', status: 'not_applicable' }],
    });
    expect(h.receipts.recordDispatch.mock.calls[0][3]).toMatchObject({
      model: 'fal/model',
      provider: 'fal',
      providerAttemptRef: 'fal:ext-1',
    });
    expect(h.material.describeIngredientArtifact).toHaveBeenCalledWith(
      actor,
      'ingredient-1',
    );
    expect(h.receipts.bindArtifact.mock.calls[0][3]).toMatchObject({
      artifact: { id: 'ingredient-1' },
      completedAt: expect.any(String),
    });
    expect(h.validation.validateReceipt).toHaveBeenCalledWith(
      actor,
      'receipt-a',
    );
    expect(reauthorize).toHaveBeenCalled();
  });
  it('names the visual itself as the attempt when the provider gave no id', async () => {
    const h = setup({ externalId: null });
    await h.service.validate(admission, visuals);
    expect(h.receipts.recordDispatch.mock.calls[0][3]).toMatchObject({
      providerAttemptRef: 'fal:ingredient-1',
    });
  });
  it.each([
    ['checking', 0, 0, 1],
    ['ready', 0, 0, 0],
    ['needs_review', 0, 0, 0],
    ['blocked', 0, 0, 0],
  ] as const)(
    'resumes a receipt found %s without repeating earlier steps',
    async (state, resolves, dispatches, validations) => {
      const h = setup({ created: state });
      const outcome = await h.service.validate(admission, visuals);
      expect(h.receipts.recordResolution).toHaveBeenCalledTimes(resolves);
      expect(h.receipts.recordDispatch).toHaveBeenCalledTimes(dispatches);
      expect(h.validation.validateReceipt).toHaveBeenCalledTimes(validations);
      expect(outcome.states).toHaveLength(1);
    },
  );
  it('reports a visual whose receipt is blocked as blocking the output', async () => {
    const h = setup({ validated: 'blocked' });
    expect(await h.service.validate(admission, visuals)).toEqual({
      isBlocked: true,
      states: ['blocked'],
    });
  });
  it('records a visual that cannot be fingerprinted as an unbound, blocked completion', async () => {
    const h = setup();
    h.material.describeIngredientArtifact.mockRejectedValueOnce(
      new ConflictException('receipt_artifact_unsupported'),
    );
    expect(await h.service.validate(admission, visuals)).toEqual({
      isBlocked: true,
      states: ['blocked'],
    });
    expect(h.receipts.blockUnboundCompletion).toHaveBeenCalledTimes(1);
    expect(h.validation.validateReceipt).not.toHaveBeenCalled();
  });
  it('leaves a visual whose bytes cannot be read right now for a later pass, never as evidence', async () => {
    const h = setup();
    h.material.describeIngredientArtifact.mockRejectedValueOnce(
      new ServiceUnavailableException('receipt_material_unavailable'),
    );
    expect(await h.service.validate(admission, visuals)).toEqual({
      isBlocked: false,
      states: ['unavailable'],
    });
    expect(h.receipts.blockUnboundCompletion).not.toHaveBeenCalled();
    expect(h.validation.validateReceipt).not.toHaveBeenCalled();
    expect(h.logger.warn).toHaveBeenCalled();
  });
  it('writes nothing when the approved identity cannot be read, and surfaces access failures', async () => {
    const unavailable = setup();
    unavailable.snapshots.preview.mockRejectedValueOnce(
      new ConflictException('brand_identity_unavailable'),
    );
    expect(await unavailable.service.validate(admission, visuals)).toEqual({
      isBlocked: false,
      states: ['unavailable'],
    });
    expect(unavailable.receipts.create).not.toHaveBeenCalled();
    const denied = setup();
    denied.snapshots.preview.mockRejectedValueOnce(new ForbiddenException());
    await expect(denied.service.validate(admission, visuals)).rejects.toThrow(
      ForbiddenException,
    );
  });
  it('skips a visual that is missing or not an image or video', async () => {
    for (const category of [null, IngredientCategory.AUDIO]) {
      const h = setup({ category });
      expect(await h.service.validate(admission, visuals)).toEqual({
        isBlocked: false,
        states: ['unavailable'],
      });
      expect(h.receipts.create).not.toHaveBeenCalled();
    }
  });
  it('keys the receipt by the visual', () => {
    expect(breakoutVisualBrandRequestKey('abc')).toBe('abc:brand-validation');
  });
});

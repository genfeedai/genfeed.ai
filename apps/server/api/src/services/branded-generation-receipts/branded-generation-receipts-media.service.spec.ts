import {
  hashBrandedGenerationArtifactManifestV1,
  hashBrandedGenerationTextV1,
} from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { BrandedGenerationPromptStoreService } from '@api/services/branded-generation-receipts/branded-generation-prompt-store.service';
import { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import { BrandedGenerationReceiptsService } from '@api/services/branded-generation-receipts/branded-generation-receipts.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { brandAccessFixture } from '@api/shared/testing/brand-access.fixture';
import type {
  BrandedGenerationInputV1,
  BrandedGenerationReceiptV1,
  BrandedGenerationResolutionV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import type { Prisma } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

/**
 * Receipt lifecycle steps Studio image and video outputs use (#6484): costs,
 * an output that completed but cannot be fingerprinted, and a provider that
 * never accepted the attempt. Kept beside the frozen service spec so its
 * runtime-acceptance hash stays pinned.
 */
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});
const actor = { organizationId: 'org', brandId: 'brand', actorId: 'user' };
function input(): BrandedGenerationInputV1 {
  return {
    schemaVersion: 1,
    ...actor,
    requestKey: 'request',
    candidateIndex: 0,
    surface: 'api',
    contentType: 'post',
    format: 'text',
    mode: 'raw',
    originalPrompt: '  Exact 😀  ',
    provider: 'provider',
    model: 'model',
    generationParameters: {},
    knowledgeSourceIds: [],
    knowledgeSpaceIds: [],
    parentRequestId: 'parent',
    runId: 'run',
  };
}
function fixture() {
  const access = new BrandedGenerationReceiptAccessService(
    brandAccessFixture(),
  );
  vi.spyOn(access, 'assertBrand').mockResolvedValue({ isOwnerOrAdmin: false });
  const prompts = new BrandedGenerationPromptStoreService(access);
  vi.spyOn(prompts, 'prepare').mockImplementation((text) => ({
    reference: {
      retention: 'retained',
      snapshotId: `prompt-${hashBrandedGenerationTextV1(text)}`,
      contentHash: hashBrandedGenerationTextV1(text),
    },
    record: {
      id: `prompt-${hashBrandedGenerationTextV1(text)}`,
      format: 'genfeed.branded-generation-prompt.v1',
      ciphertext: `${'a'.repeat(32)}:aa:${'b'.repeat(32)}`,
      contentHash: hashBrandedGenerationTextV1(text),
    },
  }));
  vi.spyOn(prompts, 'persist').mockResolvedValue();
  vi.spyOn(prompts, 'purge').mockResolvedValue();
  vi.spyOn(prompts, 'read').mockResolvedValue({
    status: 'retained',
    text: 'fixture',
    contentHash: hashBrandedGenerationTextV1('fixture'),
  });
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'brand' }]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    post: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: 'artifact', description: 'completed text' }),
    },
    ingredient: { findFirst: vi.fn().mockResolvedValue(null) },
    brandedGenerationReceipt: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    brandedGenerationReceiptEvent: {
      create: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    $transaction: vi
      .fn()
      .mockImplementation(
        (run: (client: Prisma.TransactionClient) => Promise<unknown>) =>
          run(tx as unknown as Prisma.TransactionClient),
      ),
  };
  return {
    service: new BrandedGenerationReceiptsService(
      prisma as unknown as PrismaService,
      access,
      prompts,
    ),
    tx,
    prisma,
    prompts,
    access,
  };
}
function blockedResolution(): BrandedGenerationResolutionV1 {
  return {
    schemaVersion: 1,
    mode: 'raw',
    status: 'blocked',
    reasonCode: 'context_unavailable',
    snapshot: null,
    layers: [],
    diagnostics: [
      {
        code: 'context_unavailable',
        severity: 'error',
        message: 'Unavailable',
      },
    ],
    learning: {
      schemaVersion: 1,
      brandFeedback: { status: 'not_applicable', sourceIds: [] },
      global: {
        status: 'not_applicable',
        scope: { format: 'text', objective: 'engagement' },
      },
      privateAccount: {
        mode: 'no_destination',
        configVersion: 'v1',
        synthetic: false,
        application: {
          status: 'unavailable',
          reasonCodes: ['no_destination'],
          privatePolicyApplied: false,
          sharedReleaseApplied: false,
          revalidatedAt: '2026-10-01T17:00:00.000Z',
        },
      },
    },
  };
}
async function saved(f: ReturnType<typeof fixture>) {
  const result = await f.service.create(input(), {
    ...actor,
    actorId: input().actorId,
  });
  f.tx.brandedGenerationReceipt.findFirst.mockResolvedValue({
    projection: result.receipt,
    isDeleted: false,
  });
  return result.receipt;
}
const hash = `sha256:${'a'.repeat(64)}`;
function loadCompletion(
  f: ReturnType<typeof fixture>,
  current: BrandedGenerationReceiptV1,
) {
  f.tx.brandedGenerationReceipt.findFirst.mockResolvedValue({
    projection: current,
    isDeleted: current.isDeleted,
  });
  return current;
}
async function resolvedReceipt(f: ReturnType<typeof fixture>) {
  const current = await saved(f);
  const resolved = (
    await f.service.recordResolution(
      actor,
      current.id,
      { operationKey: 'resolve', expectedRevision: 0 },
      {
        schemaVersion: 1,
        mode: 'raw',
        status: 'resolved',
        snapshot: null,
        layers: [],
        diagnostics: [],
        learning: blockedResolution().learning,
        compiledPrompt: 'compiled',
        originalPromptHash: current.prompts.original.contentHash,
      },
    )
  ).receipt;
  return loadCompletion(f, resolved);
}
function dispatchInput(current: BrandedGenerationReceiptV1) {
  return {
    provider: 'provider',
    model: 'model',
    providerAttemptRef: 'attempt',
    dispatchClaimedAt: current.updatedAt,
    providerAcceptedAt: current.updatedAt,
  };
}
describe('Studio media receipt lifecycle (#6484)', () => {
  async function dispatchedImage(f: ReturnType<typeof fixture>) {
    const created = (
      await f.service.create(
        {
          ...input(),
          contentType: 'image',
          format: 'image',
          requestKey: 'ingredient-1',
          generationId: 'ingredient-1',
        },
        actor,
      )
    ).receipt;
    loadCompletion(f, created);
    const resolved = (
      await f.service.recordResolution(
        actor,
        created.id,
        { operationKey: 'resolve', expectedRevision: 0 },
        {
          schemaVersion: 1,
          mode: 'raw',
          status: 'resolved',
          snapshot: null,
          layers: [],
          diagnostics: [],
          learning: blockedResolution().learning,
          compiledPrompt: 'compiled image prompt',
          originalPromptHash: created.prompts.original.contentHash,
        },
      )
    ).receipt;
    loadCompletion(f, resolved);
    const dispatched = (
      await f.service.recordDispatch(
        actor,
        resolved.id,
        { operationKey: 'dispatch', expectedRevision: resolved.revision },
        {
          ...dispatchInput(resolved),
          provider: 'replicate',
          model: 'replicate/flux',
          providerAttemptRef: 'replicate:job-1',
        },
      )
    ).receipt;
    return loadCompletion(f, dispatched);
  }
  function imageBinding(completedAt: string) {
    const parts = [
      {
        id: 'images/ingredient-1.png',
        role: 'image' as const,
        version: 's3:v:1',
        contentHash: hash,
      },
    ];
    return {
      artifact: {
        kind: 'ingredient' as const,
        id: 'ingredient-1',
        mediaKind: 'image' as const,
        version: 's3:v:1',
        parts,
        contentHash: hashBrandedGenerationArtifactManifestV1({
          mediaKind: 'image',
          textHash: null,
          parts,
        }),
      },
      textHash: null,
      completedAt,
    };
  }

  it('drives a raw image output to ready with its ingredient, model and known cost', async () => {
    const f = fixture();
    const dispatched = await dispatchedImage(f);
    f.tx.ingredient.findFirst.mockResolvedValue({
      id: 'ingredient-1',
      s3Key: 'images/ingredient-1.png',
    });

    const bound = (
      await f.service.bindArtifact(
        actor,
        dispatched.id,
        { operationKey: 'bind', expectedRevision: dispatched.revision },
        imageBinding(dispatched.updatedAt),
      )
    ).receipt;
    expect(f.tx.ingredient.findFirst.mock.calls.at(-1)?.[0].where).toEqual({
      id: 'ingredient-1',
      organizationId: 'org',
      brandId: 'brand',
      isDeleted: false,
    });
    loadCompletion(f, bound);
    const ready = (
      await f.service.recordValidation(
        actor,
        bound.id,
        { operationKey: 'validate', expectedRevision: bound.revision },
        'validate',
        null,
      )
    ).receipt;
    loadCompletion(f, ready);
    const costed = (
      await f.service.recordCosts(
        actor,
        ready.id,
        { operationKey: 'costs', expectedRevision: ready.revision },
        [
          {
            id: 'generation',
            stage: 'generation',
            status: 'known',
            ledgerId: 'hold-1',
            credits: 4,
          },
        ],
      )
    ).receipt;

    expect(costed).toMatchObject({
      state: 'ready',
      compliance: 'not_claimed',
      contentType: 'image',
      generationId: 'ingredient-1',
      artifact: { kind: 'ingredient', id: 'ingredient-1', mediaKind: 'image' },
      execution: {
        provider: 'replicate',
        model: 'replicate/flux',
        result: 'completed',
      },
      costs: [
        {
          id: 'generation',
          status: 'known',
          ledgerId: 'hold-1',
          credits: 4,
        },
      ],
    });
    expect(
      f.tx.brandedGenerationReceiptEvent.create.mock.calls.at(-1)?.[0].data,
    ).toMatchObject({ type: 'record_costs', revision: costed.revision });
  });

  it('replaces cost lines by id and rejects a known cost without a ledger entry', async () => {
    const f = fixture();
    const current = loadCompletion(f, await dispatchedImage(f));
    const first = (
      await f.service.recordCosts(
        actor,
        current.id,
        { operationKey: 'costs-1', expectedRevision: current.revision },
        [
          {
            id: 'generation',
            stage: 'generation',
            status: 'unavailable',
            reasonCode: 'credit_hold_unavailable',
          },
        ],
      )
    ).receipt;
    expect(first.state).toBe('dispatched');
    loadCompletion(f, first);
    const second = (
      await f.service.recordCosts(
        actor,
        first.id,
        { operationKey: 'costs-2', expectedRevision: first.revision },
        [
          {
            id: 'generation',
            stage: 'generation',
            status: 'known',
            ledgerId: 'hold-1',
            credits: 2,
          },
        ],
      )
    ).receipt;
    expect(second.costs).toEqual([
      {
        id: 'generation',
        stage: 'generation',
        status: 'known',
        ledgerId: 'hold-1',
        credits: 2,
      },
    ]);
    loadCompletion(f, second);
    await expect(
      f.service.recordCosts(
        actor,
        second.id,
        { operationKey: 'costs-3', expectedRevision: second.revision },
        [
          {
            id: 'generation',
            stage: 'generation',
            status: 'known',
            credits: 2,
          },
        ],
      ),
    ).rejects.toThrow('receipt_costs_invalid');
  });

  it('records a completed but unfingerprinted output as blocked without an artifact', async () => {
    const f = fixture();
    const dispatched = await dispatchedImage(f);

    const blocked = (
      await f.service.blockUnboundCompletion(
        actor,
        dispatched.id,
        { operationKey: 'unbound', expectedRevision: dispatched.revision },
        {
          reasonCode: 'receipt_material_limit_exceeded',
          completedAt: dispatched.updatedAt,
        },
      )
    ).receipt;

    expect(blocked).toMatchObject({
      state: 'blocked',
      artifact: null,
      execution: { result: 'completed', completedAt: dispatched.updatedAt },
      diagnostics: [{ code: 'receipt_material_limit_exceeded' }],
    });
    const fresh = fixture();
    const resolved = await resolvedReceipt(fresh);
    await expect(
      fresh.service.blockUnboundCompletion(
        actor,
        resolved.id,
        { operationKey: 'unbound-2', expectedRevision: resolved.revision },
        {
          reasonCode: 'receipt_material_limit_exceeded',
          completedAt: dispatched.updatedAt,
        },
      ),
    ).rejects.toThrow('receipt_state_conflict');
  });

  it('blocks a resolved output the provider never accepted', async () => {
    const f = fixture();
    const resolved = await resolvedReceipt(f);
    const blocked = await f.service.blockBeforeDispatch(
      actor,
      resolved.id,
      { operationKey: 'block', expectedRevision: resolved.revision },
      'provider_submission_failed',
    );
    expect(blocked.receipt).toMatchObject({
      state: 'blocked',
      execution: null,
      diagnostics: [
        {
          code: 'provider_submission_failed',
          message: 'Provider did not accept the generation',
        },
      ],
    });
  });
});

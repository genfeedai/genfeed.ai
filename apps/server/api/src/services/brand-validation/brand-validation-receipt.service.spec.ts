import { brandAccessFixture } from '@test/helpers/brand-access.fixture';
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { BrandValidationModule } from '@api/services/brand-validation/brand-validation.module';
import { BrandValidationService } from '@api/services/brand-validation/brand-validation.service';
import { BrandValidationReceiptModule } from '@api/services/brand-validation/brand-validation-receipt.module';
import { BrandValidationReceiptService } from '@api/services/brand-validation/brand-validation-receipt.service';
import { BrandedGenerationArtifactMaterialService } from '@api/services/branded-generation-receipts/branded-generation-artifact-material.service';
import {
  hashBrandArtifactValidationReportV1,
  hashBrandIdentitySnapshotV1,
} from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { BrandedGenerationPromptStoreService } from '@api/services/branded-generation-receipts/branded-generation-prompt-store.service';
import { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import { BrandedGenerationReceiptsModule } from '@api/services/branded-generation-receipts/branded-generation-receipts.module';
import { BrandedGenerationReceiptsService } from '@api/services/branded-generation-receipts/branded-generation-receipts.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientCategory } from '@genfeedai/contracts';
import { brandedGenerationReceiptV1Schema } from '@genfeedai/contracts/api-types/contracts';
import type {
  BrandedGenerationReceiptV1,
  BrandIdentitySnapshotV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import type { Prisma } from '@genfeedai/prisma';
import {
  StorageReadError,
  type VersionedStorageProvider,
} from '@genfeedai/storage';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
  readVersionedBytes: vi.fn<VersionedStorageProvider['readVersionedBytes']>(),
}));
vi.mock('@genfeedai/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/storage')>()),
  createStorageProvider: () => storage,
}));
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});
const actor = {
  organizationId: 'org-a',
  brandId: 'brand-a',
  actorId: 'user-a',
};
const hash = `sha256:${'a'.repeat(64)}`;
const zeroHash = `sha256:${'0'.repeat(64)}`;
const time = '2026-10-01T00:00:00.000Z';
function snapshot(): BrandIdentitySnapshotV1 {
  const value: BrandIdentitySnapshotV1 = {
    schemaVersion: 1,
    organizationId: 'org-a',
    brandId: 'brand-a',
    revisionId: 'revision-a',
    revisionVersion: 1,
    approval: 'approved',
    resolvedAt: '2026-10-01T00:00:00Z',
    contentHash: zeroHash,
    identity: { name: 'Example Co' },
    voice: { audience: [], values: [], messagingPillars: [], avoid: [] },
    generationRules: {
      schemaVersion: 1,
      evidence: [
        { id: 'evidence-a', sourceType: 'manual', label: 'Synthetic source' },
      ],
      facts: [],
      palette: [],
      typography: [],
      mandatory: [
        {
          id: 'mandatory-a',
          text: 'Example Co',
          match: 'literal',
          required: true,
          evidenceIds: ['evidence-a'],
        },
      ],
      avoid: [
        {
          id: 'avoid-a',
          text: 'Guaranteed returns',
          match: 'literal',
          required: true,
          evidenceIds: ['evidence-a'],
        },
      ],
      examples: [],
      assets: [],
    },
    diagnostics: [],
  };
  value.contentHash = hashBrandIdentitySnapshotV1(value);
  return value;
}
function receipt(): BrandedGenerationReceiptV1 {
  return {
    schemaVersion: 1,
    id: 'receipt-a',
    organizationId: 'org-a',
    brandId: 'brand-a',
    actorId: 'user-a',
    requestKey: 'request',
    candidateIndex: 0,
    requestHash: hash,
    revision: 0,
    state: 'dispatched',
    mode: 'approved_brand',
    surface: 'api',
    contentType: 'post',
    format: 'text',
    createdAt: time,
    updatedAt: time,
    snapshot: snapshot(),
    resolutionHash: hash,
    layers: [],
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
          revalidatedAt: time,
        },
      },
    },
    prompts: {
      original: {
        contentHash: hash,
        retention: 'retained',
        snapshotId: 'original',
      },
      enhanced: null,
      compiled: {
        contentHash: hash,
        retention: 'retained',
        snapshotId: 'compiled',
      },
    },
    execution: {
      provider: 'provider',
      model: 'model',
      providerAttemptRef: 'attempt',
      dispatchClaimedAt: time,
      result: 'pending',
    },
    artifact: null,
    validation: null,
    compliance: 'unverified',
    diagnostics: [],
    costs: [
      { id: 'pending-cost', stage: 'generation', status: 'pending' },
      {
        id: 'unavailable-cost',
        stage: 'validation',
        status: 'unavailable',
        reasonCode: 'ledger_unavailable',
      },
    ],
    budget: {
      version: 'brand-enforcement-v1',
      maximumGenerationAttempts: 1,
      automaticPaidRetries: 0,
      generationAttemptsUsed: 1,
    },
    isDeleted: false,
  };
}
function fixture(description = 'Example Co offers a plan.') {
  const access = new BrandedGenerationReceiptAccessService(
    brandAccessFixture(),
  );
  vi.spyOn(access, 'assertBrand').mockResolvedValue({ isOwnerOrAdmin: false });
  const prompts = new BrandedGenerationPromptStoreService(access);
  const initial = brandedGenerationReceiptV1Schema.parse(receipt());
  const rows = [
    {
      id: initial.id,
      organizationId: initial.organizationId,
      brandId: initial.brandId,
      isDeleted: initial.isDeleted,
      projection: initial,
      revision: initial.revision,
      state: initial.state,
    },
  ];
  const events: Prisma.BrandedGenerationReceiptEventUncheckedCreateInput[] = [];
  const post = { id: 'post-a', description };
  const ingredient = {
    id: 'ingredient-a',
    s3Key: 'ingredients/images/ingredient-a',
    category: IngredientCategory.IMAGE,
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'brand-a' }]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    brandedGenerationReceipt: {
      findFirst: vi.fn(
        async ({ where }: Prisma.BrandedGenerationReceiptFindFirstArgs) => {
          if (!where) return null;
          const row = rows.find(
            (candidate) =>
              candidate.id === where.id &&
              candidate.organizationId === where.organizationId &&
              candidate.brandId === where.brandId &&
              (where.isDeleted !== false || !candidate.isDeleted),
          );
          return row ? structuredClone(row) : null;
        },
      ),
      update: vi.fn(
        async ({ where, data }: Prisma.BrandedGenerationReceiptUpdateArgs) => {
          const row = rows.find((candidate) => candidate.id === where.id);
          if (!row) throw new Error('Missing fixture receipt');
          const projection = brandedGenerationReceiptV1Schema.parse(
            data.projection,
          );
          row.projection = projection;
          row.revision = projection.revision;
          row.state = projection.state;
          return structuredClone(row);
        },
      ),
    },
    brandedGenerationReceiptEvent: {
      create: vi.fn(
        async ({ data }: Prisma.BrandedGenerationReceiptEventCreateArgs) => {
          const event = structuredClone(
            data,
          ) as Prisma.BrandedGenerationReceiptEventUncheckedCreateInput;
          events.push(event);
          return event;
        },
      ),
      findFirst: vi.fn(
        async ({
          where,
        }: Prisma.BrandedGenerationReceiptEventFindFirstArgs) => {
          if (!where) return null;
          const event = events.find(
            (candidate) =>
              candidate.receiptId === where.receiptId &&
              candidate.organizationId === where.organizationId &&
              candidate.brandId === where.brandId &&
              candidate.operationKey === where.operationKey,
          );
          return event ? structuredClone(event) : null;
        },
      ),
    },
    post: {
      findFirst: vi.fn(async ({ where }: Prisma.PostFindFirstArgs) =>
        where?.organizationId === actor.organizationId &&
        where.brandId === actor.brandId
          ? { ...post }
          : null,
      ),
    },
    ingredient: {
      findFirst: vi.fn(async ({ where }: Prisma.IngredientFindFirstArgs) =>
        where?.organizationId === actor.organizationId &&
        where.brandId === actor.brandId
          ? { ...ingredient }
          : null,
      ),
    },
    asset: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const prisma = {
    ...tx,
    $transaction: vi
      .fn()
      .mockImplementation(
        (run: (client: Prisma.TransactionClient) => Promise<unknown>) =>
          run(tx as unknown as Prisma.TransactionClient),
      ),
  };
  const receipts = new BrandedGenerationReceiptsService(
    prisma as unknown as PrismaService,
    access,
    prompts,
  );
  const material = new BrandedGenerationArtifactMaterialService(
    prisma as unknown as PrismaService,
    access,
    receipts,
  );
  const validator = new BrandValidationService();
  const adapter = new BrandValidationReceiptService(
    material,
    receipts,
    validator,
  );
  const bytes = readFileSync(
    new URL('./fixtures/approved.png', import.meta.url),
  );
  storage.readVersionedBytes.mockResolvedValue({ bytes, version: 's3:v:1' });
  return {
    rows,
    events,
    post,
    ingredient,
    tx,
    material,
    receipts,
    validator,
    adapter,
  };
}
async function bindPost(f: ReturnType<typeof fixture>) {
  const binding = await f.material.describePostArtifact(actor, f.post.id);
  return f.receipts.bindArtifact(
    actor,
    'receipt-a',
    {
      operationKey: 'bind',
      expectedRevision: f.rows[0].projection.revision,
    },
    { ...binding, completedAt: time },
  );
}
async function bindImage(f: ReturnType<typeof fixture>) {
  const binding = await f.material.describeIngredientArtifact(
    actor,
    f.ingredient.id,
  );
  return f.receipts.bindArtifact(
    actor,
    'receipt-a',
    {
      operationKey: 'bind',
      expectedRevision: f.rows[0].projection.revision,
    },
    { ...binding, completedAt: time },
  );
}
function writes(f: ReturnType<typeof fixture>) {
  return {
    updates: f.tx.brandedGenerationReceipt.update.mock.calls.length,
    events: f.events.length,
  };
}
function expectNoWrite(
  f: ReturnType<typeof fixture>,
  before: ReturnType<typeof writes>,
) {
  expect(writes(f)).toEqual(before);
}

describe('brand validation receipt completion adapter', () => {
  beforeEach(() => storage.readVersionedBytes.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it('T1: persists text validation through the real completion chain', async () => {
    const f = fixture();
    const bound = (await bindPost(f)).receipt;
    const result = await f.adapter.validateReceipt(actor, 'receipt-a');
    expect(result.replayed).toBe(false);
    expect(result.receipt).toMatchObject({
      state: 'needs_review',
      compliance: 'unverified',
    });
    const validation = result.receipt.validation;
    if (!validation || !bound.artifact || !bound.snapshot)
      throw new Error('Missing bound validation');
    expect(validation).toMatchObject({
      snapshotHash: bound.snapshot.contentHash,
      artifactId: bound.artifact.id,
      artifactVersion: bound.artifact.version,
      artifactHash: bound.artifact.contentHash,
      quality: null,
    });
    expect(validation.checks.map((check) => check.result)).toEqual([
      'pass',
      'pass',
      'unknown',
    ]);
    expect(validation.checks.at(-1)).toMatchObject({
      ruleId: 'system:factual_coverage',
      severity: 'hard',
      result: 'unknown',
    });
    expect(result.receipt.costs).toEqual(bound.costs);
    expect(result.receipt.budget).toEqual(bound.budget);
    expect(f.rows[0].projection).toEqual(result.receipt);
    expect(f.events.at(-1)).toMatchObject({
      type: 'validate',
      operationKey: `brand-validation:validate:${hashBrandArtifactValidationReportV1(validation)}`,
    });
  });

  it('T2: persists a hard literal failure as blocked and failed', async () => {
    const f = fixture('Example Co offers Guaranteed returns.');
    await bindPost(f);
    const result = await f.adapter.validateReceipt(actor, 'receipt-a');
    expect(result.receipt).toMatchObject({
      state: 'blocked',
      compliance: 'failed',
    });
    expect(
      result.receipt.validation?.checks.find(
        (check) => check.ruleId === 'avoid-a',
      ),
    ).toMatchObject({
      result: 'fail',
      reasonCode: 'forbidden_literal_present',
    });
    expect(result.receipt.validation?.quality).toBeNull();
    expect(f.rows[0].projection).toEqual(result.receipt);
  });

  it('T3: persists unsupported image coverage as unknown with pinned bytes', async () => {
    const f = fixture();
    await bindImage(f);
    const result = await f.adapter.validateReceipt(actor, 'receipt-a');
    expect(result.receipt).toMatchObject({
      state: 'needs_review',
      compliance: 'unverified',
    });
    const validation = result.receipt.validation;
    if (!validation) throw new Error('Missing image validation');
    expect(validation.checks.slice(0, 2)).toEqual([
      expect.objectContaining({
        ruleId: 'mandatory-a',
        result: 'unknown',
        reasonCode: 'text_coverage_incomplete',
      }),
      expect.objectContaining({
        ruleId: 'avoid-a',
        result: 'unknown',
        reasonCode: 'text_coverage_incomplete',
      }),
    ]);
    expect(validation.checks.at(-1)).toMatchObject({
      ruleId: 'system:factual_coverage',
      severity: 'hard',
      result: 'unknown',
    });
    expect(validation.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'artifact_media_unsupported' }),
    );
    expect(validation.quality).toBeNull();
    expect(storage.readVersionedBytes).toHaveBeenCalledTimes(2);
    expect(storage.readVersionedBytes.mock.calls[1]).toEqual([
      f.ingredient.s3Key,
      expect.objectContaining({ expectedVersion: 's3:v:1' }),
    ]);
    expect(f.rows[0].projection).toEqual(result.receipt);
  });

  it('T4: completes raw receipts without calling the validator', async () => {
    const f = fixture();
    f.rows[0].projection.mode = 'raw';
    f.rows[0].projection.snapshot = null;
    f.rows[0].projection.compliance = 'not_claimed';
    await bindPost(f);
    const validate = vi.spyOn(f.validator, 'validateBrandArtifact');
    const result = await f.adapter.validateReceipt(actor, 'receipt-a');
    expect(result.receipt).toMatchObject({
      state: 'ready',
      compliance: 'not_claimed',
      validation: null,
    });
    expect(f.events.at(-1)).toMatchObject({
      type: 'validate',
      operationKey: 'brand-validation:validate:raw',
    });
    expect(validate).not.toHaveBeenCalled();
  });

  it('T5: denies cross-tenant and cross-brand receipt access without writes', async () => {
    const f = fixture();
    await bindPost(f);
    const before = writes(f);
    const validate = vi.spyOn(f.validator, 'validateBrandArtifact');
    await expect(
      f.adapter.validateReceipt(
        { ...actor, organizationId: 'org-b' },
        'receipt-a',
      ),
    ).rejects.toThrow('receipt_not_found');
    await expect(
      f.adapter.validateReceipt({ ...actor, brandId: 'brand-b' }, 'receipt-a'),
    ).rejects.toThrow('receipt_not_found');
    expect(storage.readVersionedBytes).not.toHaveBeenCalled();
    expect(validate).not.toHaveBeenCalled();
    expectNoWrite(f, before);
  });

  it('T6: rejects edited text, drifted bytes and changed storage versions without writes', async () => {
    const text = fixture();
    await bindPost(text);
    const textBefore = writes(text);
    const textValidate = vi.spyOn(text.validator, 'validateBrandArtifact');
    text.post.description = 'edited';
    await expect(
      text.adapter.validateReceipt(actor, 'receipt-a'),
    ).rejects.toThrow('receipt_artifact_version_mismatch');
    expectNoWrite(text, textBefore);
    expect(text.rows[0].projection).toMatchObject({
      state: 'checking',
      validation: null,
    });
    expect(textValidate).not.toHaveBeenCalled();

    const image = fixture();
    await bindImage(image);
    const imageBefore = writes(image);
    const imageValidate = vi.spyOn(image.validator, 'validateBrandArtifact');
    storage.readVersionedBytes.mockResolvedValueOnce({
      bytes: Buffer.from('drift'),
      version: 's3:v:1',
    });
    await expect(
      image.adapter.validateReceipt(actor, 'receipt-a'),
    ).rejects.toThrow('receipt_artifact_hash_mismatch');
    expectNoWrite(image, imageBefore);
    expect(image.rows[0].projection).toMatchObject({
      state: 'checking',
      validation: null,
    });
    expect(imageValidate).not.toHaveBeenCalled();

    storage.readVersionedBytes.mockRejectedValueOnce(
      new StorageReadError('storage_read_changed'),
    );
    await expect(
      image.adapter.validateReceipt(actor, 'receipt-a'),
    ).rejects.toThrow('receipt_artifact_version_mismatch');
    expectNoWrite(image, imageBefore);
    expect(image.rows[0].projection).toMatchObject({
      state: 'checking',
      validation: null,
    });
    expect(imageValidate).not.toHaveBeenCalled();
  });

  it('T7: reuses exact reports and replays revalidation after a lost response', async () => {
    const f = fixture();
    await bindPost(f);
    const first = await f.adapter.validateReceipt(actor, 'receipt-a');
    const before = writes(f);
    const repeat = await f.adapter.validateReceipt(actor, 'receipt-a');
    expect(repeat.replayed).toBe(true);
    expect(repeat.receipt).toEqual(f.rows[0].projection);
    expect(repeat.receipt.validation?.snapshotHash).toBe(
      snapshot().contentHash,
    );
    expect(repeat.receipt).toEqual(first.receipt);
    expectNoWrite(f, before);

    const revalidation = fixture();
    await bindPost(revalidation);
    revalidation.rows[0].projection.state = 'needs_review';
    revalidation.rows[0].state = 'needs_review';
    const previous = structuredClone(revalidation.rows[0]);
    const result = await revalidation.adapter.validateReceipt(
      actor,
      'receipt-a',
    );
    expect(result.replayed).toBe(false);
    expect(result.receipt.revision).toBe(previous.revision + 1);
    expect(result.receipt.validation).not.toBeNull();
    expect(revalidation.events.at(-1)).toMatchObject({
      type: 'revalidate',
      operationKey: expect.stringMatching(/^brand-validation:revalidate:/),
    });
    const after = writes(revalidation);
    const replay = await revalidation.adapter.validateReceipt(
      actor,
      'receipt-a',
    );
    expect(replay.replayed).toBe(true);
    expect(replay.receipt).toEqual(result.receipt);
    expectNoWrite(revalidation, after);

    revalidation.rows[0] = previous;
    const lostResponse = await revalidation.adapter.validateReceipt(
      actor,
      'receipt-a',
    );
    expect(lostResponse.replayed).toBe(true);
    expect(lostResponse.receipt).toEqual(result.receipt);
    expectNoWrite(revalidation, after);
  });

  it('T8: composes receipt completion without changing the validator module boundary', () => {
    expect(
      Reflect.getMetadata(
        MODULE_METADATA.IMPORTS,
        BrandValidationReceiptModule,
      ),
    ).toEqual([BrandValidationModule, BrandedGenerationReceiptsModule]);
    expect(
      Reflect.getMetadata(
        MODULE_METADATA.PROVIDERS,
        BrandValidationReceiptModule,
      ),
    ).toEqual([BrandValidationReceiptService]);
    expect(
      Reflect.getMetadata(
        MODULE_METADATA.EXPORTS,
        BrandValidationReceiptModule,
      ),
    ).toEqual([BrandValidationReceiptService]);
    expect(
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, BrandValidationModule),
    ).toBeUndefined();
  });
});

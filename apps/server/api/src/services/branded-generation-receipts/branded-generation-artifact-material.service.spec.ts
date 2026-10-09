import { createHash } from 'node:crypto';
import { copyBrandValidationMaterial } from '@api/services/brand-validation/brand-validation-material.util';
import { BrandedGenerationArtifactMaterialService } from '@api/services/branded-generation-receipts/branded-generation-artifact-material.service';
import {
  hashBrandedGenerationArtifactManifestV1,
  hashBrandedGenerationTextV1,
} from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import type { BrandedPostMaterialRecord } from '@api/services/branded-generation-receipts/branded-generation-post-material.util';
import { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import { BrandedGenerationReceiptsService } from '@api/services/branded-generation-receipts/branded-generation-receipts.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AssetParent,
  IngredientCategory,
  Platform,
  PostCategory,
  PostFormat,
} from '@genfeedai/contracts';
import type { BrandedGenerationReceiptV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import type { Prisma } from '@genfeedai/prisma';
import {
  STORAGE_READ_MAX_BYTES,
  StorageReadError,
  type VersionedStorageProvider,
} from '@genfeedai/storage';
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
const actor = { organizationId: 'org', brandId: 'brand', actorId: 'user' };
const hash = `sha256:${'a'.repeat(64)}`;
const time = '2026-10-01T00:00:00.000Z';
function materialPost(
  description = 'completed text',
): BrandedPostMaterialRecord {
  return {
    id: 'artifact',
    organizationId: 'org',
    brandId: 'brand',
    isDeleted: false,
    parentId: null,
    order: 0,
    platform: Platform.TWITTER,
    credentialId: 'credential',
    targetAttachments: [],
    targetSettings: {},
    category: PostCategory.TEXT,
    format: PostFormat.STANDARD,
    description,
    ingredients: [],
    children: [],
  };
}
function materialIngredient(
  id: string,
  category = IngredientCategory.IMAGE,
): BrandedPostMaterialRecord['ingredients'][number] {
  return {
    id,
    organizationId: actor.organizationId,
    brandId: actor.brandId,
    isDeleted: false,
    category,
    s3Key: `ingredients/${id}`,
    version: 1,
    mimeType: category === IngredientCategory.VIDEO ? 'video/mp4' : 'image/png',
    fileSize: 5,
    cdnUrl: `https://example.test/${id}`,
  };
}
function bytesHash(bytes: Uint8Array) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
function receipt(): BrandedGenerationReceiptV1 {
  return {
    schemaVersion: 1,
    id: 'receipt',
    organizationId: 'org',
    brandId: 'brand',
    actorId: 'user',
    requestKey: 'request',
    candidateIndex: 0,
    requestHash: hash,
    revision: 0,
    state: 'checking',
    mode: 'approved_brand',
    surface: 'api',
    contentType: 'post',
    format: 'text',
    createdAt: time,
    updatedAt: time,
    snapshot: {
      schemaVersion: 1,
      organizationId: 'org',
      brandId: 'brand',
      revisionId: 'revision',
      revisionVersion: 1,
      approval: 'approved',
      resolvedAt: time,
      contentHash: hash,
      identity: { name: 'Acme' },
      voice: { audience: [], values: [], messagingPillars: [], avoid: [] },
      generationRules: {
        schemaVersion: 1,
        evidence: [
          { id: 'evidence', sourceType: 'manual', label: 'Owner attestation' },
        ],
        facts: [
          {
            id: 'fact',
            kind: 'statement',
            subject: 'Acme',
            predicate: 'name',
            value: 'Acme',
            evidenceIds: ['evidence'],
            required: true,
            match: 'literal',
          },
        ],
        palette: [],
        typography: [],
        mandatory: [],
        avoid: [],
        examples: [],
        assets: [],
      },
      diagnostics: [],
    },
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
      result: 'completed',
    },
    artifact: {
      kind: 'post',
      id: 'artifact',
      version: '1',
      contentHash: hash,
      mediaKind: 'text',
      parts: [],
    },
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
function fixture() {
  const access = new BrandedGenerationReceiptAccessService();
  vi.spyOn(access, 'assertBrand').mockResolvedValue({ isOwnerOrAdmin: false });
  const receipts = Object.create(
    BrandedGenerationReceiptsService.prototype,
  ) as BrandedGenerationReceiptsService;
  const current = receipt();
  const bytes = Buffer.from('image');
  const version = 's3:v:1';
  const parts = [
    {
      id: 'ingredients/images/artifact',
      version,
      role: 'image' as const,
      contentHash: bytesHash(bytes),
    },
  ];
  current.artifact = {
    kind: 'ingredient',
    id: 'artifact',
    mediaKind: 'image',
    version,
    parts,
    contentHash: hashBrandedGenerationArtifactManifestV1({
      mediaKind: 'image',
      textHash: null,
      parts,
    }),
  };
  vi.spyOn(receipts, 'get').mockResolvedValue(current);
  const tx = {
    ingredient: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'artifact',
        s3Key: parts[0].id,
        category: IngredientCategory.IMAGE,
      }),
    },
    post: {
      findFirst: vi.fn().mockResolvedValue(materialPost()),
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
  storage.readVersionedBytes.mockResolvedValue({ bytes, version });
  return {
    service: new BrandedGenerationArtifactMaterialService(
      prisma as unknown as PrismaService,
      access,
      receipts,
    ),
    tx,
    prisma,
    access,
    receipts,
    current,
    bytes,
    version,
  };
}
function addReference(
  f: ReturnType<typeof fixture>,
  bytes = Buffer.from('reference'),
) {
  if (!f.current.snapshot) throw new Error('Missing snapshot');
  const reference = {
    id: 'reference',
    assetId: 'asset',
    role: 'logo' as const,
    required: true,
    evidenceIds: [],
    contentHash: bytesHash(bytes),
  };
  f.current.snapshot.generationRules.assets = [reference];
  f.tx.asset.findMany.mockResolvedValue([
    { id: 'asset', cloudObjectKey: null },
  ]);
  storage.readVersionedBytes.mockReset();
  storage.readVersionedBytes
    .mockResolvedValueOnce({ bytes: f.bytes, version: f.version })
    .mockResolvedValueOnce({ bytes, version: 's3:e:reference' });
  return reference;
}
beforeEach(() => {
  storage.readVersionedBytes.mockReset();
});
afterEach(() => vi.restoreAllMocks());
describe('versioned artifact material', () => {
  it.each(['image', 'video', 'short', 'carousel', 'thread'] as const)(
    'describes and reacquires the complete %s post material',
    async (format) => {
      const f = fixture();
      const post = materialPost();
      if (format === 'thread') {
        post.format = PostFormat.THREAD;
        post.children = [
          {
            ...materialPost('Second segment'),
            id: 'child',
            parentId: post.id,
            order: 1,
          },
        ];
      } else {
        post.category =
          format === 'short'
            ? PostCategory.REEL
            : format === 'video'
              ? PostCategory.VIDEO
              : PostCategory.IMAGE;
        post.ingredients = [
          materialIngredient(
            'first',
            format === 'short' || format === 'video'
              ? IngredientCategory.VIDEO
              : IngredientCategory.IMAGE,
          ),
        ];
        if (format === 'carousel')
          post.ingredients.push(materialIngredient('second'));
      }
      f.tx.post.findFirst.mockResolvedValue(post);
      f.current.format = format;
      const binding = await f.service.describePostArtifact(actor, post.id);
      expect(binding.artifact.kind).toBe('post');
      expect(binding.textHash).toBe(
        hashBrandedGenerationTextV1(post.description),
      );
      expect(binding.artifact.parts).toHaveLength(
        format === 'carousel' ? 2 : 1,
      );
      f.current.artifact = binding.artifact;
      storage.readVersionedBytes.mockClear();
      const result = await f.service.acquire(actor, 'receipt');
      expect(copyBrandValidationMaterial(result.material)).toEqual(
        result.material,
      );
      expect(result.material.textBytes).toEqual(Buffer.from(post.description));
      expect(result.material.parts).toHaveLength(binding.artifact.parts.length);
      if (format === 'thread') {
        expect(result.material.parts[0].bytes).toEqual(
          Buffer.from('Second segment'),
        );
        expect(storage.readVersionedBytes).not.toHaveBeenCalled();
        post.children[0].description = 'Edited segment';
      } else {
        expect(storage.readVersionedBytes).toHaveBeenCalledWith(
          'ingredients/first',
          expect.objectContaining({ expectedVersion: f.version }),
        );
        post.ingredients[0].version += 1;
      }
      await expect(f.service.acquire(actor, 'receipt')).rejects.toThrow(
        'receipt_artifact_version_mismatch',
      );
    },
  );

  it('detects changed composed bytes under a retained storage version', async () => {
    const f = fixture();
    const post = materialPost();
    post.category = PostCategory.IMAGE;
    post.ingredients = [materialIngredient('image')];
    f.tx.post.findFirst.mockResolvedValue(post);
    f.current.format = 'image';
    f.current.artifact = (
      await f.service.describePostArtifact(actor, post.id)
    ).artifact;
    storage.readVersionedBytes.mockResolvedValue({
      bytes: Buffer.from('changed'),
      version: f.version,
    });
    await expect(f.service.acquire(actor, 'receipt')).rejects.toThrow(
      'receipt_artifact_hash_mismatch',
    );
  });

  it('describes image and video with the hash and version captured in one read', async () => {
    const f = fixture();
    expect(
      await f.service.describeIngredientArtifact(actor, 'artifact'),
    ).toEqual({ artifact: f.current.artifact, textHash: null });
    expect(f.tx.ingredient.findFirst.mock.calls[0][0].where).toEqual({
      id: 'artifact',
      organizationId: 'org',
      brandId: 'brand',
      isDeleted: false,
    });
    expect(storage.readVersionedBytes).toHaveBeenCalledWith(
      'ingredients/images/artifact',
      { maxBytes: STORAGE_READ_MAX_BYTES, timeoutMs: 15000 },
    );
    f.tx.ingredient.findFirst.mockResolvedValue({
      id: 'artifact',
      category: IngredientCategory.VIDEO,
      s3Key: 'videos/artifact',
    });
    expect(
      (await f.service.describeIngredientArtifact(actor, 'artifact')).artifact,
    ).toMatchObject({
      mediaKind: 'video',
      parts: [{ role: 'video', id: 'videos/artifact' }],
    });
  });
  it('rejects missing, unsafe or unsupported sources and empty posts', async () => {
    const f = fixture();
    f.tx.ingredient.findFirst.mockResolvedValue(null);
    await expect(
      f.service.describeIngredientArtifact(actor, 'foreign'),
    ).rejects.toThrow('receipt_artifact_not_found');
    f.tx.ingredient.findFirst.mockResolvedValue({
      id: 'artifact',
      category: IngredientCategory.IMAGE,
      s3Key: '../escape',
    });
    await expect(
      f.service.describeIngredientArtifact(actor, 'artifact'),
    ).rejects.toThrow('receipt_artifact_not_found');
    f.tx.ingredient.findFirst.mockResolvedValue({
      id: 'artifact',
      category: IngredientCategory.AUDIO,
      s3Key: 'audio',
    });
    await expect(
      f.service.describeIngredientArtifact(actor, 'artifact'),
    ).rejects.toThrow('receipt_artifact_unsupported');
    f.tx.post.findFirst.mockResolvedValue(materialPost(''));
    await expect(
      f.service.describePostArtifact(actor, 'artifact'),
    ).rejects.toThrow('receipt_artifact_unsupported');
    expect(storage.readVersionedBytes).not.toHaveBeenCalled();
  });
  it('acquires pinned parts and reference bytes that round-trip through the validation copy', async () => {
    const f = fixture();
    const reference = addReference(f);
    const result = await f.service.acquire(actor, 'receipt');
    expect(copyBrandValidationMaterial(result.material)).toEqual(
      result.material,
    );
    expect(result.material.references).toEqual([
      {
        assetReferenceId: reference.id,
        assetId: 'asset',
        bytes: Buffer.from('reference'),
      },
    ]);
    expect(storage.readVersionedBytes.mock.calls[0]).toEqual([
      'ingredients/images/artifact',
      {
        expectedVersion: f.version,
        maxBytes: STORAGE_READ_MAX_BYTES,
        timeoutMs: 15000,
      },
    ]);
    expect(storage.readVersionedBytes.mock.calls[1]).toEqual([
      'logos/asset',
      { maxBytes: STORAGE_READ_MAX_BYTES - f.bytes.length, timeoutMs: 15000 },
    ]);
    expect(f.tx.asset.findMany.mock.calls[0][0].where).toEqual({
      id: { in: ['asset'] },
      parentType: AssetParent.BRAND,
      parentOrgId: 'org',
      parentBrandId: 'brand',
      isDeleted: false,
    });
  });
  it('describes and acquires exact UTF-8 post bytes, detecting edits', async () => {
    const f = fixture();
    const binding = await f.service.describePostArtifact(actor, 'artifact');
    expect(binding.textHash).toBe(
      hashBrandedGenerationTextV1('completed text'),
    );
    expect(binding.artifact).toMatchObject({
      kind: 'post',
      version: binding.textHash,
      parts: [],
    });
    f.current.artifact = binding.artifact;
    expect(
      copyBrandValidationMaterial(
        (await f.service.acquire(actor, 'receipt')).material,
      ).textBytes,
    ).toEqual(Buffer.from('completed text'));
    f.tx.post.findFirst.mockResolvedValue(materialPost('edited'));
    await expect(f.service.acquire(actor, 'receipt')).rejects.toThrow(
      'receipt_artifact_version_mismatch',
    );
  });
  it.each([
    ['storage_read_changed', 'receipt_artifact_version_mismatch', 409],
    ['storage_read_unavailable', 'receipt_material_unavailable', 503],
    ['storage_read_limit_exceeded', 'receipt_material_limit_exceeded', 400],
  ] as const)('maps %s to %s', async (code, message, status) => {
    const f = fixture();
    storage.readVersionedBytes.mockRejectedValueOnce(
      new StorageReadError(code),
    );
    await expect(f.service.acquire(actor, 'receipt')).rejects.toMatchObject({
      message,
      status,
    });
  });
  it('rejects changed part and manifest hashes and changed reference hashes', async () => {
    const f = fixture();
    storage.readVersionedBytes.mockResolvedValueOnce({
      bytes: Buffer.from('drift'),
      version: f.version,
    });
    await expect(f.service.acquire(actor, 'receipt')).rejects.toThrow(
      'receipt_artifact_hash_mismatch',
    );
    if (!f.current.artifact) throw new Error('Missing artifact');
    const manifest = f.current.artifact.contentHash;
    f.current.artifact.contentHash = hash;
    await expect(f.service.acquire(actor, 'receipt')).rejects.toThrow(
      'receipt_artifact_hash_mismatch',
    );
    f.current.artifact.contentHash = manifest;
    addReference(f);
    storage.readVersionedBytes.mockReset();
    storage.readVersionedBytes
      .mockResolvedValueOnce({ bytes: f.bytes, version: f.version })
      .mockResolvedValueOnce({
        bytes: Buffer.from('drift'),
        version: 'reference',
      });
    await expect(f.service.acquire(actor, 'receipt')).rejects.toThrow(
      'receipt_reference_hash_mismatch',
    );
  });
  it.each([0, 1])(
    'enforces the cumulative boundary with %s excess bytes',
    async (excess) => {
      const f = fixture();
      const referenceBytes = Buffer.alloc(
        STORAGE_READ_MAX_BYTES - f.bytes.length + excess,
        1,
      );
      addReference(f, referenceBytes);
      storage.readVersionedBytes.mockReset();
      storage.readVersionedBytes.mockImplementation(async (key, options) => {
        const bytes = key.startsWith('logos/') ? referenceBytes : f.bytes;
        if (bytes.length > options.maxBytes)
          throw new StorageReadError('storage_read_limit_exceeded');
        return { bytes, version: f.version };
      });
      if (excess)
        await expect(f.service.acquire(actor, 'receipt')).rejects.toMatchObject(
          { message: 'receipt_material_limit_exceeded', status: 400 },
        );
      else
        expect(
          (await f.service.acquire(actor, 'receipt')).material.references[0]
            .bytes.byteLength + f.bytes.length,
        ).toBe(STORAGE_READ_MAX_BYTES);
      expect(storage.readVersionedBytes.mock.calls[1][1].maxBytes).toBe(
        STORAGE_READ_MAX_BYTES - f.bytes.length,
      );
    },
  );
  it('rejects a further reference without reading when the artifact exhausts the budget', async () => {
    const f = fixture();
    const description = 'x'.repeat(STORAGE_READ_MAX_BYTES);
    f.tx.post.findFirst.mockResolvedValue(materialPost(description));
    f.current.artifact = (
      await f.service.describePostArtifact(actor, 'artifact')
    ).artifact;
    addReference(f);
    await expect(f.service.acquire(actor, 'receipt')).rejects.toMatchObject({
      message: 'receipt_material_limit_exceeded',
      status: 400,
    });
    expect(storage.readVersionedBytes).not.toHaveBeenCalled();
  });
  it('counts text bytes against the same reference budget', async () => {
    const f = fixture();
    f.current.artifact = (
      await f.service.describePostArtifact(actor, 'artifact')
    ).artifact;
    addReference(f);
    storage.readVersionedBytes.mockReset();
    storage.readVersionedBytes.mockResolvedValueOnce({
      bytes: Buffer.from('reference'),
      version: 'reference',
    });
    await f.service.acquire(actor, 'receipt');
    expect(storage.readVersionedBytes.mock.calls[0][1].maxBytes).toBe(
      STORAGE_READ_MAX_BYTES - Buffer.byteLength('completed text'),
    );
  });
  it('requires completed state and non-raw snapshot, while raw mode acquires no references', async () => {
    const f = fixture();
    addReference(f);
    f.current.mode = 'raw';
    f.current.snapshot = null;
    expect(
      (await f.service.acquire(actor, 'receipt')).material.references,
    ).toEqual([]);
    expect(f.tx.asset.findMany).not.toHaveBeenCalled();
    f.current.mode = 'approved_brand';
    await expect(f.service.acquire(actor, 'receipt')).rejects.toThrow(
      'receipt_state_conflict',
    );
    f.current.mode = 'raw';
    f.current.state = 'dispatched';
    await expect(f.service.acquire(actor, 'receipt')).rejects.toThrow(
      'receipt_state_conflict',
    );
  });
  it('selects hashed references required-first, preserves order and caps at eight', async () => {
    const f = fixture();
    if (!f.current.snapshot) throw new Error('Missing snapshot');
    f.current.snapshot.generationRules.assets = Array.from(
      { length: 10 },
      (_, index) => ({
        id: `ref-${index}`,
        assetId: `asset-${index}`,
        role: 'style' as const,
        required: index % 2 === 1,
        evidenceIds: [],
        ...(index !== 0 ? { contentHash: bytesHash(f.bytes) } : {}),
      }),
    );
    f.tx.asset.findMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, index) => ({
        id: `asset-${index}`,
        cloudObjectKey: `references/asset-${index}`,
      })),
    );
    const result = await f.service.acquire(actor, 'receipt');
    expect(result.material.references.map((ref) => ref.assetId)).toEqual(
      [1, 3, 5, 7, 9, 2, 4, 6].map((index) => `asset-${index}`),
    );
  });
});

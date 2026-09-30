import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { VisualProjectAssetsService } from '@api/collections/visual-projects/services/visual-project-assets.service';
import type { IVisualSandboxMedia } from '@genfeedai/contracts/interfaces';
import type { VisualRevision } from '@genfeedai/prisma';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock('@genfeedai/storage', () => ({ createStorageProvider: () => storage }));
interface AdmittedOutput {
  id: string;
  metadataId: string;
  s3Key: string;
  generationSource: string;
  providerData: unknown;
  metadata: { id: string; result: string };
}
function fixture() {
  const user = {
    id: 'user',
    userId: 'user',
    organizationId: 'org',
    brandId: 'brand',
  } as AuthenticatedUser;
  const revision = {
    id: 'revision',
    projectId: 'project',
    number: 1,
    userId: 'user',
    organizationId: 'org',
    brandId: 'brand',
    sourceHash: 'source',
    rendererVersion: '4.0.530',
    sourceAssetIds: [],
    settings: { durationFrames: 30, fps: 30 },
    cancelRequestedAt: null,
  } as unknown as VisualRevision;
  let stored: AdmittedOutput | null = null;
  let isDeleted = false;
  const ingredient = {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn(async () => (isDeleted ? null : stored)),
    findFirstOrThrow: vi.fn(async () => {
      if (!stored || isDeleted) throw new Error('not found');
      return stored;
    }),
    create: vi.fn(async ({ data }) => {
      if (stored) throw new Error('unique collision');
      stored = {
        id: data.id,
        metadataId: data.metadata.create.id,
        s3Key: data.s3Key,
        generationSource: data.generationSource,
        providerData: data.providerData,
        metadata: {
          id: data.metadata.create.id,
          result: data.metadata.create.result,
        },
      };
      return stored;
    }),
    update: vi.fn(async ({ data }) => {
      if (!stored) throw new Error('missing admission');
      stored.metadata.result = data.metadata.update.result;
      return stored;
    }),
  };
  const transaction = {
    $queryRaw: vi.fn(),
    ingredient,
    visualRevision: { findFirstOrThrow: vi.fn(async () => revision) },
  };
  let queue = Promise.resolve();
  const prisma = {
    ...transaction,
    $transaction: vi.fn((callback) => {
      const next = queue.then(() => callback(transaction));
      queue = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    }),
  };
  const ingredients = { patch: vi.fn().mockResolvedValue({}) };
  const service = new VisualProjectAssetsService(
    prisma as never,
    { authorizeBrand: vi.fn().mockResolvedValue(undefined) } as never,
    ingredients as never,
  );
  const media: IVisualSandboxMedia = {
    format: 'png',
    width: 640,
    height: 360,
    bytes: Buffer.from('verified-png').toString('base64'),
  };
  storage.upload.mockImplementation(async () => {
    expect(stored).not.toBeNull();
    return 'https://storage/result.png';
  });
  const commit = (item = media) =>
    service.commit(user, revision, [item], async () => {});
  return {
    commit,
    media,
    ingredients,
    ingredient,
    revision,
    remove: () => {
      isDeleted = true;
    },
  };
}
beforeEach(() => storage.upload.mockReset());
describe('canonical visual output admission', () => {
  it('admits immutable hashes before upload and replays the canonical stored URL', async () => {
    const { commit, ingredient } = fixture();
    const first = await commit();
    const second = await commit();
    expect(second).toEqual(first);
    expect(storage.upload).toHaveBeenCalledOnce();
    expect(ingredient.create).toHaveBeenCalledOnce();
  });
  it('rejects contradictory concurrent media before a second upload', async () => {
    const { commit, media } = fixture();
    const results = await Promise.allSettled([
      commit(),
      commit({ ...media, bytes: Buffer.from('different').toString('base64') }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(storage.upload).toHaveBeenCalledOnce();
  });
  it('does not resurrect a deleted deterministic output', async () => {
    const { commit, remove } = fixture();
    await commit();
    remove();
    await expect(commit()).rejects.toThrow('unique collision');
    expect(storage.upload).toHaveBeenCalledOnce();
  });
  it('recovers an upload failure from its durable admission without duplicating the ingredient', async () => {
    const { commit, ingredient } = fixture();
    storage.upload.mockRejectedValueOnce(new Error('upload interrupted'));
    await expect(commit()).rejects.toThrow('upload interrupted');
    await commit();
    expect(ingredient.create).toHaveBeenCalledOnce();
  });
  it('recovers failure between canonical URL persistence and asset-gate patch', async () => {
    const { commit, ingredients } = fixture();
    ingredients.patch.mockRejectedValueOnce(new Error('gate unavailable'));
    await expect(commit()).rejects.toThrow('gate unavailable');
    await commit();
    expect(storage.upload).toHaveBeenCalledOnce();
    expect(ingredients.patch).toHaveBeenCalledTimes(2);
  });
  it('cancellation during upload preserves pending admission and cannot mark generated', async () => {
    const { commit, revision, ingredients } = fixture();
    storage.upload.mockImplementationOnce(async () => {
      revision.cancelRequestedAt = new Date();
      return 'https://storage/result.png';
    });
    await expect(commit()).rejects.toThrow('visual_cancelled');
    expect(ingredients.patch).not.toHaveBeenCalled();
  });
});

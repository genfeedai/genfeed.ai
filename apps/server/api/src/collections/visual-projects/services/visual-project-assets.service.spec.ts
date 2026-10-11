import { runWithActionOrigin } from '@api/action-origin/action-origin.context';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { VisualProjectAssetsService } from '@api/collections/visual-projects/services/visual-project-assets.service';
import { BrandRenderEvidenceService } from '@api/services/brand-render-evidence/brand-render-evidence.service';
import { verifyBrandRenderEvidenceManifest } from '@api/services/brand-render-evidence/brand-render-evidence-manifest.util';
import realRender from '@api-test/fixtures/brand-render-evidence/visual-code-still.fixture.json';
import { ActionOrigin } from '@genfeedai/contracts';
import type { IVisualSandboxMedia } from '@genfeedai/contracts/interfaces';
import {
  GenerationEntryAttribution,
  GenerationEntryChannel,
} from '@genfeedai/contracts/interfaces/content/generation-entry.interface';
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
  const preview = vi.fn().mockResolvedValue({
    revisionId: 'brand-revision',
    revisionVersion: 3,
    contentHash: `sha256:${'d'.repeat(64)}`,
  });
  const service = new VisualProjectAssetsService(
    prisma as never,
    { authorizeBrand: vi.fn().mockResolvedValue(undefined) } as never,
    ingredients as never,
    new BrandRenderEvidenceService(
      prisma as never,
      { preview } as never,
      { warn: vi.fn() } as never,
    ),
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
    preview,
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
  it('stamps visual output admission once and retains the original entry on replay', async () => {
    const { commit, ingredient } = fixture();
    const generationEntry = {
      channel: GenerationEntryChannel.MCP,
      attribution: GenerationEntryAttribution.SERVER_VERIFIED,
    };
    await runWithActionOrigin(
      { origin: ActionOrigin.MCP, generationEntry },
      () => commit(),
    );
    expect(ingredient.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerData: expect.objectContaining({
            generationEntry,
            revisionId: 'revision',
            sourceHash: 'source',
          }),
        }),
      }),
    );
    await runWithActionOrigin(
      {
        origin: ActionOrigin.UI,
        generationEntry: {
          channel: GenerationEntryChannel.WEB,
          attribution: GenerationEntryAttribution.CLIENT_REPORTED,
        },
      },
      () => commit(),
    );
    expect(ingredient.create).toHaveBeenCalledOnce();
    expect(
      ingredient.create.mock.calls[0][0].data.providerData.generationEntry,
    ).toEqual(generationEntry);
  });
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

describe('render evidence persistence', () => {
  const png = Buffer.from(realRender.png, 'base64');
  const rendered: IVisualSandboxMedia = {
    format: 'png',
    width: realRender.width,
    height: realRender.height,
    frame: realRender.frame,
    bytes: realRender.png,
    evidence: realRender.evidence,
  };
  const storedManifest = (create: { mock: { calls: unknown[][] } }) =>
    (
      create.mock.calls[0][0] as {
        data: { providerData: { renderEvidence?: unknown } };
      }
    ).data.providerData.renderEvidence;

  it('stores the manifest with the artifact in the same admission', async () => {
    const { commit, ingredient, preview } = fixture();
    await commit(rendered);
    const manifest = storedManifest(ingredient.create);
    expect(manifest).toMatchObject({
      organizationId: 'org',
      brandId: 'brand',
      artifact: {
        id: expect.any(String),
        format: 'png',
        byteLength: png.byteLength,
        storageKey: 'visual-code/org/brand/revision/outputs/0.png',
      },
      brandSnapshot: {
        binding: 'approved_at_render',
        revisionId: 'brand-revision',
      },
    });
    expect(preview).toHaveBeenCalledWith({
      actorId: 'user',
      organizationId: 'org',
      brandId: 'brand',
    });
    const created = ingredient.create.mock.calls[0][0].data;
    expect(
      verifyBrandRenderEvidenceManifest(manifest, {
        organizationId: 'org',
        brandId: 'brand',
        artifactId: created.id,
        bytes: png,
      }).status,
    ).toBe('verified');
  });

  it('does not let the stored manifest vouch for different bytes', async () => {
    const { commit, ingredient } = fixture();
    await commit(rendered);
    const created = ingredient.create.mock.calls[0][0].data;
    const stale = Buffer.from(png);
    stale[stale.length - 1] ^= 1;
    expect(
      verifyBrandRenderEvidenceManifest(storedManifest(ingredient.create), {
        organizationId: 'org',
        brandId: 'brand',
        artifactId: created.id,
        bytes: stale,
      }),
    ).toMatchObject({
      status: 'rejected',
      reasonCode: 'artifact_hash_mismatch',
    });
  });

  it('stores no manifest for output the renderer did not observe', async () => {
    const { commit, ingredient, preview } = fixture();
    await commit();
    expect(storedManifest(ingredient.create)).toBeUndefined();
    expect(preview).not.toHaveBeenCalled();
  });

  it('still admits the output when its observations are unusable', async () => {
    const { commit, ingredient } = fixture();
    await commit({ ...rendered, evidence: { schemaVersion: 1 } });
    expect(ingredient.create).toHaveBeenCalledOnce();
    expect(storedManifest(ingredient.create)).toBeUndefined();
  });

  it('keeps the first manifest when the commit is replayed', async () => {
    const { commit, ingredient } = fixture();
    await commit(rendered);
    const first = storedManifest(ingredient.create);
    await commit(rendered);
    expect(ingredient.create).toHaveBeenCalledOnce();
    expect(storedManifest(ingredient.create)).toBe(first);
  });
});

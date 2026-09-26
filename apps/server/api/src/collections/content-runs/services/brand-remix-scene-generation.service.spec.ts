import type { ImageGenerationService } from '@api/collections/images/services/image-generation.service';
import type { AvatarVideoGenerationService } from '@api/collections/videos/services/avatar-video-generation.service';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type { MediaUrlService } from '@api/services/media-urls/media-url.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BRAND_REMIX_RUN_CONTRACT,
  brandRemixRunConfigSchema,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrandRemixRunPlanningService } from './brand-remix-run-planning.service';
import type { BrandRemixSceneBillingService } from './brand-remix-scene-billing.service';
import { BrandRemixSceneGenerationService } from './brand-remix-scene-generation.service';
import type { BrandRemixSceneStoreService } from './brand-remix-scene-store.service';

vi.mock('@api/index', () => ({
  scopedWhere: (organizationId: string, value: object) => ({
    ...value,
    organizationId,
    isDeleted: false,
  }),
}));
vi.mock(
  '@api/collections/content-runs/services/brand-remix-scene-store.service',
  () => ({ BrandRemixSceneStoreService: class {} }),
);
vi.mock(
  '@api/collections/content-runs/services/brand-remix-scene-billing.service',
  () => ({ BrandRemixSceneBillingService: class {} }),
);
vi.mock(
  '@api/collections/content-runs/services/brand-remix-run-planning.service',
  () => ({ BrandRemixRunPlanningService: class {} }),
);
vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
vi.mock('@api/services/files-microservice/client/files-client.service', () => ({
  FilesClientService: class {},
}));
vi.mock('@api/services/media-urls/media-url.service', () => ({
  MediaUrlService: class {},
}));
vi.mock('@api/collections/images/services/image-generation.service', () => ({
  ImageGenerationService: class {},
}));
vi.mock(
  '@api/collections/videos/services/avatar-video-generation.service',
  () => ({ AvatarVideoGenerationService: class {} }),
);
function fixture() {
  return brandRemixRunConfigSchema.parse({
    contract: BRAND_REMIX_RUN_CONTRACT,
    version: 1,
    recipeVersion: 1,
    revision: 1,
    phase: 'generating',
    readiness: { state: 'ready', issues: [] },
    draft: {
      fidelityMode: 'guided',
      identity: { avatarAssetId: 'identity', speechVoiceId: 'voice' },
      intent: { objective: 'Brand' },
      output: { kind: 'avatar', count: 1, aspectRatio: '9:16' },
      references: [],
      reviewRequired: true,
      target: { kind: 'organic', platform: 'instagram' },
    },
    sourceSnapshot: {
      capturedAt: '2026-09-24T00:00:00.000Z',
      evidence: [],
      metrics: {},
      pattern: {},
      platform: 'instagram',
      selector: { kind: 'source_post', sourcePostId: 'source' },
      sourceId: 'source',
      title: 'Imported',
    },
    concept: {
      savedAt: '2026-09-24T00:00:00.000Z',
      storyboard: [
        {
          id: 'scene',
          ordinal: 1,
          narration: 'Original spoken line',
          durationSeconds: 5,
          visualIntent: 'Original brand product',
        },
      ],
    },
    scenePipeline: {
      version: 1,
      language: 'en',
      state: 'generating',
      cancellationGeneration: 0,
      replacedAssetIds: [],
      receipts: [],
      operation: {
        id: 'operation',
        quoteId: 'quote',
        revision: 1,
        cancellationGeneration: 0,
        startedAt: '2026-09-24T00:00:00.000Z',
        userId: 'user',
        sequence: 0,
      },
      quote: {
        id: 'quote',
        revision: 1,
        operation: 'generate',
        inputHash: 'hash',
        createdAt: '2026-09-24T00:00:00.000Z',
        expiresAt: '2026-09-24T00:15:00.000Z',
        total: 1,
        items: [
          {
            key: 'scene-video-1',
            sceneId: 'scene',
            stage: 'video',
            model: 'heygen',
            credits: 1,
            billingMode: 'platform',
            attempt: 1,
          },
        ],
      },
      scenes: {
        scene: {
          identity: { avatarAssetId: 'identity', speechVoiceId: 'voice' },
          referenceAssetIds: [],
          image: {
            state: 'ready',
            attempt: 1,
            assetId: 'still',
            groupId: 'still-group',
          },
          video: { state: 'pending', attempt: 1, groupId: 'clip-group' },
          replacedAssetIds: [],
        },
      },
    },
  });
}
describe('canonical generated still to avatar boundary', () => {
  let config = fixture();
  const store = { fence: vi.fn(), save: vi.fn() };
  const billing = { reserve: vi.fn(), settle: vi.fn(), release: vi.fn() };
  const planning = { assertDraftAssetsAuthorized: vi.fn() };
  const prisma = { ingredient: { findFirst: vi.fn(), updateMany: vi.fn() } };
  const files = { probeMediaFromUrl: vi.fn() };
  const images = { generateImage: vi.fn() };
  const avatars = { generateAvatarVideo: vi.fn() };
  let service: BrandRemixSceneGenerationService;
  beforeEach(() => {
    vi.clearAllMocks();
    config = fixture();
    store.fence.mockImplementation(async () => ({ config, brandId: 'brand' }));
    store.save.mockImplementation(async (_org, _run, _old, next) => {
      config = brandRemixRunConfigSchema.parse(next);
    });
    prisma.ingredient.findFirst.mockResolvedValue({
      id: 'still',
      status: 'GENERATED',
      s3Key: 'ingredients/images/still.jpg',
    });
    avatars.generateAvatarVideo.mockImplementation(
      async (_input, _actor, placeholder, _scope, creditFence) => {
        await placeholder('clip');
        await creditFence();
        return { ingredientId: 'clip' };
      },
    );
    service = new BrandRemixSceneGenerationService(
      store as unknown as BrandRemixSceneStoreService,
      billing as unknown as BrandRemixSceneBillingService,
      planning as unknown as BrandRemixRunPlanningService,
      prisma as unknown as PrismaService,
      files as unknown as FilesClientService,
      {
        buildUrl: () => 'https://cdn.test/authorized-still',
      } as unknown as MediaUrlService,
      images as unknown as ImageGenerationService,
      avatars as unknown as AvatarVideoGenerationService,
    );
  });
  it('passes only the scoped generated IMAGE URL, saved voice and original narration to canonical avatar generation', async () => {
    await service.step('org', 'run', 'operation');
    expect(prisma.ingredient.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'still',
          organizationId: 'org',
          brandId: 'brand',
          isDeleted: false,
          groupId: 'still-group',
          category: 'IMAGE',
        }),
      }),
    );
    expect(avatars.generateAvatarVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        photoIngredientId: 'still',
        photoUrl: 'https://cdn.test/authorized-still',
        clonedVoiceId: 'voice',
        text: 'Original spoken line',
      }),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ settleCreditsExternally: true }),
      expect.anything(),
    );
    expect(config.scenePipeline?.scenes.scene.video.assetId).toBe('clip');
    expect(config.scenePipeline?.scenes.scene.video.state).toBe('submitted');
    expect(billing.reserve).toHaveBeenCalledOnce();
    // Accepted work is charged only once the provider output is usable.
    expect(billing.settle).not.toHaveBeenCalled();
  });
  it('rejects a deleted/foreign still or source-copy still before paid avatar dispatch', async () => {
    for (const asset of [
      null,
      {
        id: 'source',
        sourceActionId: 'remix-source:external',
        status: 'GENERATED',
      },
    ]) {
      config = fixture();
      prisma.ingredient.findFirst.mockResolvedValueOnce(asset);
      await expect(service.step('org', 'run', 'operation')).rejects.toThrow();
    }
    expect(avatars.generateAvatarVideo).not.toHaveBeenCalled();
    expect(billing.reserve).not.toHaveBeenCalled();
  });
  it('rejects strict fidelity before avatar or image dispatch', async () => {
    config.draft.fidelityMode = 'strict';
    await expect(service.step('org', 'run', 'operation')).rejects.toThrow(
      /Strict fidelity/,
    );
    expect(avatars.generateAvatarVideo).not.toHaveBeenCalled();
    expect(images.generateImage).not.toHaveBeenCalled();
    expect(billing.reserve).not.toHaveBeenCalled();
  });
  it('waits on a live claim without a placeholder instead of redispatching', async () => {
    const claimed = config.scenePipeline;
    if (!claimed) throw new Error('missing pipeline');
    claimed.scenes.scene.video = {
      ...claimed.scenes.scene.video,
      state: 'claimed',
      claimedAt: new Date().toISOString(),
    };
    prisma.ingredient.findFirst.mockResolvedValueOnce(null);
    await expect(service.step('org', 'run', 'operation')).resolves.toBe(false);
    expect(config.scenePipeline?.scenes.scene.video.state).toBe('claimed');
    expect(avatars.generateAvatarVideo).not.toHaveBeenCalled();
  });
  it('returns an abandoned claim that never created a placeholder to its same accepted attempt', async () => {
    const claimed = config.scenePipeline;
    if (!claimed) throw new Error('missing pipeline');
    claimed.scenes.scene.video = {
      ...claimed.scenes.scene.video,
      state: 'claimed',
      claimedAt: '2026-09-24T00:00:00.000Z',
    };
    prisma.ingredient.findFirst.mockResolvedValueOnce(null);
    await expect(service.step('org', 'run', 'operation')).resolves.toBe(false);
    expect(config.scenePipeline?.scenes.scene.video).toMatchObject({
      attempt: 1,
      state: 'pending',
      groupId: 'clip-group',
    });
    expect(avatars.generateAvatarVideo).not.toHaveBeenCalled();
    expect(billing.release).not.toHaveBeenCalled();
  });
  it('fails and requeues an abandoned placeholder that never reached a provider', async () => {
    const claimed = config.scenePipeline;
    if (!claimed) throw new Error('missing pipeline');
    claimed.scenes.scene.video = {
      ...claimed.scenes.scene.video,
      state: 'claimed',
      claimedAt: '2026-09-24T00:00:00.000Z',
      assetId: 'orphan',
    };
    prisma.ingredient.findFirst.mockResolvedValueOnce({
      id: 'orphan',
      status: 'PROCESSING',
      metadata: {},
    });
    await service.step('org', 'run', 'operation');
    expect(prisma.ingredient.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'orphan',
        organizationId: 'org',
        isDeleted: false,
        status: 'PROCESSING',
      }),
      data: { status: 'FAILED' },
    });
    const video = config.scenePipeline?.scenes.scene.video;
    expect(video?.state).toBe('pending');
    expect(video?.assetId).toBeUndefined();
    expect(config.scenePipeline?.scenes.scene.replacedAssetIds).toContain(
      'orphan',
    );
  });
  it('keeps waiting on a placeholder a provider already accepted', async () => {
    const claimed = config.scenePipeline;
    if (!claimed) throw new Error('missing pipeline');
    claimed.scenes.scene.video = {
      ...claimed.scenes.scene.video,
      state: 'claimed',
      claimedAt: '2026-09-24T00:00:00.000Z',
      assetId: 'clip',
    };
    prisma.ingredient.findFirst.mockResolvedValueOnce({
      id: 'clip',
      status: 'PROCESSING',
      metadata: { externalProvider: 'heygen' },
    });
    await expect(service.step('org', 'run', 'operation')).resolves.toBe(false);
    expect(prisma.ingredient.updateMany).not.toHaveBeenCalled();
    expect(config.scenePipeline?.scenes.scene.video.state).toBe('claimed');
  });
  it('settles a completed clip once it has speech and supported duration', async () => {
    const submitted = config.scenePipeline;
    if (!submitted) throw new Error('missing pipeline');
    submitted.scenes.scene.video = {
      attempt: 1,
      state: 'submitted',
      assetId: 'clip',
      groupId: 'clip-group',
    };
    prisma.ingredient.findFirst.mockResolvedValueOnce({
      id: 'clip',
      status: 'GENERATED',
      s3Key: 'ingredients/avatars/clip.mp4',
      metadata: {},
    });
    files.probeMediaFromUrl.mockResolvedValueOnce({
      durationSeconds: 6,
      width: 1080,
      height: 1920,
      audioCodec: 'aac',
    });
    await expect(service.step('org', 'run', 'operation')).resolves.toBe(true);
    expect(billing.settle).toHaveBeenCalledWith(
      'org',
      'run',
      'operation',
      expect.objectContaining({ key: 'scene-video-1' }),
      false,
    );
    expect(config.scenePipeline?.scenes.scene.video.state).toBe('ready');
    expect(config.scenePipeline?.scenes.scene.actualDurationSeconds).toBe(6);
  });
  it('marks a dispatch that failed before any placeholder as a repairable failure', async () => {
    avatars.generateAvatarVideo.mockRejectedValueOnce(
      new Error('Saved voice is unavailable.'),
    );
    await expect(service.step('org', 'run', 'operation')).rejects.toThrow(
      'Saved voice is unavailable.',
    );
    expect(config.scenePipeline?.scenes.scene.video).toMatchObject({
      state: 'failed',
      error: 'Saved voice is unavailable.',
    });
  });
  it('never claims or dispatches while reconciling a cancelled operation', async () => {
    const cancelled = config.scenePipeline;
    if (!cancelled) throw new Error('missing pipeline');
    cancelled.state = 'cancelled';
    await expect(
      service.step('org', 'run', 'operation', { reconcileOnly: true }),
    ).resolves.toBe(true);
    expect(store.fence).toHaveBeenCalledWith('org', 'run', 'operation', {
      allowCancelled: true,
    });
    expect(avatars.generateAvatarVideo).not.toHaveBeenCalled();
    expect(billing.reserve).not.toHaveBeenCalled();
  });
  it('dispatches every ready scene in one step instead of one scene at a time', async () => {
    const pipeline = config.scenePipeline;
    const concept = config.concept;
    if (!pipeline || !concept) throw new Error('missing pipeline');
    concept.storyboard.push({
      id: 'second',
      ordinal: 2,
      narration: 'Another original line',
      durationSeconds: 5,
      visualIntent: 'Brand close-up',
    });
    pipeline.scenes.second = structuredClone(pipeline.scenes.scene);
    pipeline.scenes.second.image = {
      state: 'ready',
      attempt: 1,
      assetId: 'still',
      groupId: 'still-group',
    };
    pipeline.scenes.second.video = {
      state: 'pending',
      attempt: 1,
      groupId: 'second-clip-group',
    };
    pipeline.quote?.items.push({
      key: 'second-video-1',
      sceneId: 'second',
      stage: 'video',
      model: 'heygen',
      credits: 1,
      billingMode: 'platform',
      attempt: 1,
    });
    await expect(service.step('org', 'run', 'operation')).resolves.toBe(false);
    expect(avatars.generateAvatarVideo).toHaveBeenCalledTimes(2);
    expect(billing.reserve).toHaveBeenCalledTimes(2);
  });
  it('records definitive provider failure so a repair quote can preserve the still', async () => {
    const submitted = config.scenePipeline;
    if (!submitted) throw new Error('missing pipeline');
    submitted.scenes.scene.video = {
      attempt: 1,
      state: 'submitted',
      assetId: 'clip',
      groupId: 'clip-group',
    };
    prisma.ingredient.findFirst.mockResolvedValueOnce({
      id: 'clip',
      status: 'FAILED',
    });
    await expect(service.step('org', 'run', 'operation')).rejects.toThrow(
      'need repair',
    );
    const saved = config.scenePipeline;
    if (!saved) throw new Error('missing pipeline');
    expect(saved.scenes.scene.video.state).toBe('failed');
    expect(saved.scenes.scene.image.assetId).toBe('still');
    expect(avatars.generateAvatarVideo).not.toHaveBeenCalled();
    // A definitive provider failure returns its hold instead of charging.
    expect(billing.release).toHaveBeenCalledWith(
      'org',
      'run',
      'operation',
      expect.objectContaining({ key: 'scene-video-1' }),
      false,
    );
    expect(billing.settle).not.toHaveBeenCalled();
  });
});

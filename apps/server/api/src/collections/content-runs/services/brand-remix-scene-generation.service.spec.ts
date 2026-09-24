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
  const billing = { reserve: vi.fn(), settle: vi.fn() };
  const planning = { assertDraftAssetsAuthorized: vi.fn() };
  const prisma = { ingredient: { findFirst: vi.fn() } };
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
    expect(billing.reserve).toHaveBeenCalledOnce();
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
  it('does not redispatch an uncertain accepted clip without a reconciled placeholder', async () => {
    const claimed = config.scenePipeline;
    if (!claimed) throw new Error('missing pipeline');
    claimed.scenes.scene.video.state = 'claimed';
    prisma.ingredient.findFirst.mockResolvedValueOnce(null);
    await expect(service.step('org', 'run', 'operation')).rejects.toThrow(
      'uncertain',
    );
    expect(avatars.generateAvatarVideo).not.toHaveBeenCalled();
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
      'failed',
    );
    const saved = config.scenePipeline;
    if (!saved) throw new Error('missing pipeline');
    expect(saved.scenes.scene.video.state).toBe('failed');
    expect(saved.scenes.scene.image.assetId).toBe('still');
    expect(avatars.generateAvatarVideo).not.toHaveBeenCalled();
  });
});

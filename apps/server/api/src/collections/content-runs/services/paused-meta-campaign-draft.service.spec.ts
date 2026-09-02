import { BRAND_REMIX_DOWNSTREAM_ACTION_IDS } from '@api/collections/content-runs/services/brand-remix-downstream-workflow-definition';
import { PausedMetaCampaignDraftService } from '@api/collections/content-runs/services/paused-meta-campaign-draft.service';
import { MetaGraphPaginationLimitError } from '@api/services/integrations/meta-ads/services/meta-ads.service';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type CapturedWorkflowAction = (request: {
  input: Record<string, unknown>;
  provenance: {
    executionId: string;
    workflowId: string;
    workflowLabel: string;
  };
}) => Promise<unknown> | unknown;

describe('PausedMetaCampaignDraftService', () => {
  const prisma = {
    credential: { findFirst: vi.fn() },
    ingredient: { findFirst: vi.fn() },
    post: { findFirst: vi.fn(), updateMany: vi.fn() },
  };
  const metaAdsService = {
    createAd: vi.fn(),
    createAdSet: vi.fn(),
    createCampaign: vi.fn(),
    getAdAccounts: vi.fn(),
    getAdVideoThumbnailUrl: vi.fn(),
    listAds: vi.fn(),
    listAdSets: vi.fn(),
    listAdVideos: vi.fn(),
    listCampaigns: vi.fn(),
    pauseAd: vi.fn(),
    pauseAdSet: vi.fn(),
    pauseCampaign: vi.fn(),
    uploadAdImage: vi.fn(),
    uploadAdVideo: vi.fn(),
  };
  const actions = new Map<string, CapturedWorkflowAction>();
  const workflowRunner = {
    registerAction: vi.fn((id: string, action: CapturedWorkflowAction) => {
      actions.set(id, action);
    }),
    registerWorkflow: vi.fn(),
    runWorkflow: vi.fn(),
  };
  const adCreativeMappingsService = {
    create: vi.fn(),
    findByContentId: vi.fn(),
  };
  const service = new PausedMetaCampaignDraftService(
    prisma as never,
    metaAdsService as never,
    workflowRunner as never,
    adCreativeMappingsService as never,
  );
  const input = {
    adAccountId: 'act_123',
    brandId: 'brand-1',
    config: {
      contract: 'brand-remix-run' as const,
      draft: {
        fidelityMode: 'guided' as const,
        identity: {},
        intent: {
          hook: 'Proof first',
          objective: 'An original Northstar campaign.',
        },
        output: { aspectRatio: '1:1', count: 1, kind: 'image' as const },
        references: [],
        reviewRequired: true as const,
        target: { kind: 'paid' as const, platform: 'meta' as const },
      },
      phase: 'paid_draft_creating' as const,
      readiness: { issues: [], state: 'ready' as const },
      recipeVersion: 1 as const,
      review: {
        approvedPostIds: ['post-1'],
        batchId: 'batch-1',
        postIds: ['post-1'],
        workflowExecutionId: 'review-workflow-execution-1',
        workflowId: 'review-workflow-1',
      },
      revision: 2,
      sourceSnapshot: {
        capturedAt: '2026-08-22T10:00:00.000Z',
        evidence: [],
        metrics: {},
        pattern: {},
        platform: 'meta' as const,
        selector: { adPerformanceId: 'source-1', kind: 'public_ad' as const },
        sourceId: 'source-1',
        title: 'Source pattern',
      },
      version: 1 as const,
    },
    credentialId: 'credential-1',
    linkUrl: 'https://northstar.example/product',
    organizationId: 'org-1',
    runId: 'run-1',
    userId: 'user-1',
    variant: {
      assetIds: ['image-1'],
      id: 'variant-1',
      recipeRevision: 2,
      status: 'ready' as const,
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    actions.clear();
    workflowRunner.registerAction.mockImplementation(
      (id: string, action: CapturedWorkflowAction) => {
        actions.set(id, action);
      },
    );
    service.onModuleInit();
    prisma.credential.findFirst.mockResolvedValue({
      accessToken: 'legacy-plaintext-token',
      externalId: 'page-1',
      grantedScopes: ['ads_management', 'ads_read'],
      grantedScopesCapturedAt: new Date('2026-08-20T09:00:00.000Z'),
      id: 'credential-1',
    });
    prisma.post.findFirst.mockResolvedValue({ id: 'post-1' });
    prisma.ingredient.findFirst.mockResolvedValue({
      category: IngredientCategory.IMAGE,
      cdnUrl: 'https://cdn.northstar.example/image.jpg',
      id: 'image-1',
      status: IngredientStatus.GENERATED,
    });
    metaAdsService.getAdAccounts.mockResolvedValue([
      { id: '123', name: 'Northstar' },
    ]);
    metaAdsService.listCampaigns.mockResolvedValue([]);
    metaAdsService.listAdSets.mockResolvedValue([]);
    metaAdsService.listAds.mockResolvedValue([]);
    metaAdsService.listAdVideos.mockResolvedValue([]);
    metaAdsService.createCampaign.mockResolvedValue('campaign-1');
    metaAdsService.createAdSet.mockResolvedValue('adset-1');
    metaAdsService.uploadAdImage.mockResolvedValue({
      hash: 'image-hash-1',
      url: 'https://meta.example/image.jpg',
    });
    metaAdsService.createAd.mockResolvedValue('ad-1');
    metaAdsService.getAdVideoThumbnailUrl.mockResolvedValue(
      'https://meta.example/video-thumbnail.jpg',
    );
    metaAdsService.uploadAdVideo.mockResolvedValue({ videoId: 'video-1' });
    workflowRunner.runWorkflow.mockImplementation(async (request) => {
      const provenance = {
        executionId: 'workflow-execution-1',
        workflowId: 'workflow-1',
        workflowLabel: 'Paused Meta Draft',
      };
      const execute = async (
        id: string,
        stateInput: Record<string, unknown>,
      ) => {
        const action = actions.get(id);
        if (!action) throw new Error(`Missing action ${id}`);
        return action({ input: stateInput, provenance });
      };
      const ids = BRAND_REMIX_DOWNSTREAM_ACTION_IDS;
      let state = (await execute(ids.META_VALIDATE_SOURCE, {
        request: request.inputValues.request,
      })) as { hasExistingAd?: boolean };
      state = (await execute(ids.META_RESOLVE_ACCOUNT, {
        state,
      })) as typeof state;
      state = (await execute(ids.META_ENSURE_CAMPAIGN, {
        state,
      })) as typeof state;
      state = (await execute(ids.META_ENSURE_AD_SET, {
        state,
      })) as typeof state;
      state = (await execute(ids.META_FIND_AD, { state })) as typeof state;
      if (!state.hasExistingAd) {
        state = (await execute(ids.META_PREPARE_CREATIVE, {
          state,
        })) as typeof state;
        state = (await execute(ids.META_CREATE_AD, { state })) as typeof state;
      }
      state = (await execute(ids.META_PAUSE_CAMPAIGN, {
        state,
      })) as typeof state;
      state = (await execute(ids.META_PAUSE_AD_SET, { state })) as typeof state;
      state = (await execute(ids.META_PAUSE_AD, { state })) as typeof state;
      state = (await execute(ids.META_PERSIST_MAPPING, {
        state,
      })) as typeof state;
      const result = await execute(ids.META_PERSIST_LINEAGE, { state });
      return { provenance, result };
    });
    adCreativeMappingsService.findByContentId.mockResolvedValue([]);
    prisma.post.updateMany.mockResolvedValue({ count: 1 });
  });

  it('creates all three objects with PAUSED-only inputs and complete lineage', async () => {
    const result = await service.prepare(input);

    expect(workflowRunner.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalId: 'brand-remix.meta.paused-draft' }),
    );
    expect(
      JSON.stringify(workflowRunner.runWorkflow.mock.calls[0]?.[0].inputValues),
    ).not.toContain('legacy-plaintext-token');
    expect(metaAdsService.createCampaign).toHaveBeenCalledWith(
      'legacy-plaintext-token',
      'act_123',
      expect.objectContaining({ dailyBudget: 5, status: 'PAUSED' }),
    );
    expect(metaAdsService.createAdSet).toHaveBeenCalledWith(
      'legacy-plaintext-token',
      'act_123',
      expect.not.objectContaining({ status: 'ACTIVE' }),
    );
    expect(metaAdsService.createAd).toHaveBeenCalledWith(
      'legacy-plaintext-token',
      'act_123',
      expect.objectContaining({
        creative: expect.objectContaining({ pageId: 'page-1' }),
      }),
    );
    expect(metaAdsService.pauseCampaign).toHaveBeenCalledWith(
      'legacy-plaintext-token',
      'campaign-1',
    );
    expect(metaAdsService.pauseAdSet).toHaveBeenCalledWith(
      'legacy-plaintext-token',
      'adset-1',
    );
    expect(metaAdsService.pauseAd).toHaveBeenCalledWith(
      'legacy-plaintext-token',
      'ad-1',
    );
    expect(result).toMatchObject({
      adId: 'ad-1',
      adSetId: 'adset-1',
      campaignId: 'campaign-1',
      ingredientId: 'image-1',
      postId: 'post-1',
      recipeRevision: 2,
      status: 'PAUSED',
      variantId: 'variant-1',
      workflowExecutionId: 'workflow-execution-1',
      workflowId: 'workflow-1',
    });
  });

  it('replays deterministic provider objects instead of creating duplicates', async () => {
    metaAdsService.listCampaigns.mockResolvedValue([
      { id: 'campaign-1', name: 'Genfeed Remix run-1-2-variant-1' },
    ]);
    metaAdsService.listAdSets.mockResolvedValue([
      { id: 'adset-1', name: 'Genfeed Remix run-1-2-variant-1 Ad Set' },
    ]);
    metaAdsService.listAds.mockResolvedValue([
      { id: 'ad-1', name: 'Genfeed Remix run-1-2-variant-1 Ad' },
    ]);

    const result = await service.prepare(input);

    expect(result.replayed).toBe(true);
    expect(metaAdsService.createCampaign).not.toHaveBeenCalled();
    expect(metaAdsService.createAdSet).not.toHaveBeenCalled();
    expect(metaAdsService.createAd).not.toHaveBeenCalled();
    expect(metaAdsService.uploadAdImage).not.toHaveBeenCalled();
    expect(metaAdsService.listCampaigns).toHaveBeenCalledWith(
      'legacy-plaintext-token',
      'act_123',
      { limit: 1, name: 'Genfeed Remix run-1-2-variant-1' },
    );
    expect(metaAdsService.listAdSets).toHaveBeenCalledWith(
      'legacy-plaintext-token',
      'act_123',
      'campaign-1',
      { name: 'Genfeed Remix run-1-2-variant-1 Ad Set' },
    );
    expect(metaAdsService.listAds).toHaveBeenCalledWith(
      'legacy-plaintext-token',
      'act_123',
      'adset-1',
      { name: 'Genfeed Remix run-1-2-variant-1 Ad' },
    );
  });

  it('recovers a partial ad failure without duplicating campaign or ad set objects', async () => {
    metaAdsService.createAd
      .mockRejectedValueOnce(new Error('Meta ad creation failed'))
      .mockResolvedValueOnce('ad-1');

    await expect(service.prepare(input)).rejects.toThrow(
      'Meta ad creation failed',
    );

    metaAdsService.listCampaigns.mockResolvedValue([
      { id: 'campaign-1', name: 'Genfeed Remix run-1-2-variant-1' },
    ]);
    metaAdsService.listAdSets.mockResolvedValue([
      { id: 'adset-1', name: 'Genfeed Remix run-1-2-variant-1 Ad Set' },
    ]);

    const result = await service.prepare(input);

    expect(result).toMatchObject({
      adId: 'ad-1',
      adSetId: 'adset-1',
      campaignId: 'campaign-1',
      status: 'PAUSED',
    });
    expect(metaAdsService.createCampaign).toHaveBeenCalledTimes(1);
    expect(metaAdsService.createAdSet).toHaveBeenCalledTimes(1);
    expect(metaAdsService.createAd).toHaveBeenCalledTimes(2);
    expect(result.replayed).toBe(true);
  });

  it('reuses a named video upload after an ad-creation failure and selects its thumbnail', async () => {
    prisma.ingredient.findFirst.mockResolvedValue({
      category: IngredientCategory.VIDEO,
      cdnUrl: 'https://cdn.northstar.example/video.mp4',
      id: 'video-ingredient-1',
      status: IngredientStatus.GENERATED,
    });
    const videoInput = {
      ...input,
      variant: { ...input.variant, assetIds: ['video-ingredient-1'] },
    };
    metaAdsService.listAdVideos
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'video-1',
          title: 'Genfeed Remix run-1-2-variant-1 Ad',
        },
      ]);
    metaAdsService.createAd
      .mockRejectedValueOnce(new Error('Meta ad creation failed'))
      .mockResolvedValueOnce('ad-1');

    await expect(service.prepare(videoInput)).rejects.toThrow(
      'Meta ad creation failed',
    );
    metaAdsService.listCampaigns.mockResolvedValue([
      {
        id: 'campaign-1',
        name: 'Genfeed Remix run-1-2-variant-1',
      },
    ]);
    metaAdsService.listAdSets.mockResolvedValue([
      {
        id: 'adset-1',
        name: 'Genfeed Remix run-1-2-variant-1 Ad Set',
      },
    ]);

    await service.prepare(videoInput);

    expect(metaAdsService.uploadAdVideo).toHaveBeenCalledTimes(1);
    expect(metaAdsService.listAdVideos).toHaveBeenCalledWith(
      'legacy-plaintext-token',
      'act_123',
      { allPages: true },
    );
    expect(metaAdsService.getAdVideoThumbnailUrl).toHaveBeenCalledWith(
      'legacy-plaintext-token',
      'video-1',
    );
    expect(metaAdsService.createAd).toHaveBeenCalledWith(
      'legacy-plaintext-token',
      'act_123',
      expect.objectContaining({
        creative: expect.objectContaining({
          thumbnailUrl: 'https://meta.example/video-thumbnail.jpg',
          videoId: 'video-1',
        }),
      }),
    );
  });

  it('fails closed when video replay cannot be proven within the safe scan limit', async () => {
    prisma.ingredient.findFirst.mockResolvedValue({
      category: IngredientCategory.VIDEO,
      cdnUrl: 'https://cdn.northstar.example/video.mp4',
      id: 'video-ingredient-1',
      status: IngredientStatus.GENERATED,
    });
    metaAdsService.listAdVideos.mockRejectedValue(
      new MetaGraphPaginationLimitError('act_123/advideos'),
    );

    await expect(
      service.prepare({
        ...input,
        variant: { ...input.variant, assetIds: ['video-ingredient-1'] },
      }),
    ).rejects.toThrow('no duplicate object was created');
    expect(metaAdsService.uploadAdVideo).not.toHaveBeenCalled();
    expect(metaAdsService.createAd).not.toHaveBeenCalled();
  });

  it('rejects a foreign ad account before any upload or create', async () => {
    metaAdsService.getAdAccounts.mockResolvedValue([]);

    await expect(service.prepare(input)).rejects.toThrow(
      'selected Meta ad account is unavailable',
    );

    expect(metaAdsService.uploadAdImage).not.toHaveBeenCalled();
    expect(metaAdsService.createCampaign).not.toHaveBeenCalled();
  });

  it('rejects missing ads_management before the first Meta provider call', async () => {
    prisma.credential.findFirst.mockResolvedValue({
      accessToken: 'legacy-plaintext-token',
      externalId: 'page-1',
      grantedScopes: ['ads_read'],
      grantedScopesCapturedAt: new Date('2026-08-20T09:00:00.000Z'),
      id: 'credential-1',
    });

    await expect(service.prepare(input)).rejects.toThrow('ads_management');

    expect(metaAdsService.getAdAccounts).not.toHaveBeenCalled();
    expect(metaAdsService.uploadAdImage).not.toHaveBeenCalled();
    expect(metaAdsService.createCampaign).not.toHaveBeenCalled();
  });
});

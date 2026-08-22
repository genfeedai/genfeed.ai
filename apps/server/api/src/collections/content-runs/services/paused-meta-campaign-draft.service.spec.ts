import { PausedMetaCampaignDraftService } from '@api/collections/content-runs/services/paused-meta-campaign-draft.service';
import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('PausedMetaCampaignDraftService', () => {
  const prisma = {
    credential: { findFirst: vi.fn() },
    ingredient: { findFirst: vi.fn() },
    post: { findFirst: vi.fn() },
  };
  const metaAdsService = {
    createAd: vi.fn(),
    createAdSet: vi.fn(),
    createCampaign: vi.fn(),
    getAdAccounts: vi.fn(),
    listAds: vi.fn(),
    listAdSets: vi.fn(),
    listCampaigns: vi.fn(),
    pauseAd: vi.fn(),
    pauseAdSet: vi.fn(),
    pauseCampaign: vi.fn(),
    uploadAdImage: vi.fn(),
    uploadAdVideo: vi.fn(),
  };
  const workflowProvenanceService = { runAction: vi.fn() };
  const adCreativeMappingsService = {
    create: vi.fn(),
    findByContentId: vi.fn(),
  };
  const service = new PausedMetaCampaignDraftService(
    prisma as never,
    metaAdsService as never,
    workflowProvenanceService as never,
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
    metaAdsService.createCampaign.mockResolvedValue('campaign-1');
    metaAdsService.createAdSet.mockResolvedValue('adset-1');
    metaAdsService.uploadAdImage.mockResolvedValue({
      hash: 'image-hash-1',
      url: 'https://meta.example/image.jpg',
    });
    metaAdsService.createAd.mockResolvedValue('ad-1');
    workflowProvenanceService.runAction.mockImplementation(
      async (_options, action) => ({
        provenance: {
          executionId: 'workflow-execution-1',
          workflowId: 'workflow-1',
          workflowLabel: 'Paused Meta Draft',
        },
        result: await action(),
      }),
    );
    adCreativeMappingsService.findByContentId.mockResolvedValue([]);
  });

  it('creates all three objects with PAUSED-only inputs and complete lineage', async () => {
    const result = await service.prepare(input);

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

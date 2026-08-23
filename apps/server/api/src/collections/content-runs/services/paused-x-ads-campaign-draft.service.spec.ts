import { PausedXAdsCampaignDraftService } from '@api/collections/content-runs/services/paused-x-ads-campaign-draft.service';
import { IngredientStatus } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('PausedXAdsCampaignDraftService', () => {
  const prisma = {
    credential: { findFirst: vi.fn() },
    ingredient: { findFirst: vi.fn() },
    post: { findFirst: vi.fn() },
  };
  const xAdsService = {
    createCampaign: vi.fn(),
    createLineItem: vi.fn(),
    createPromotedTweet: vi.fn(),
    getAdAccounts: vi.fn(),
    getFundingInstruments: vi.fn(),
    listPublishedTweets: vi.fn(),
    listCampaigns: vi.fn(),
    listLineItems: vi.fn(),
    listPromotedTweets: vi.fn(),
  };
  const workflowProvenanceService = { runAction: vi.fn() };
  const adCreativeMappingsService = {
    create: vi.fn(),
    findByContentId: vi.fn(),
  };
  const service = new PausedXAdsCampaignDraftService(
    prisma as never,
    xAdsService as never,
    workflowProvenanceService as never,
    adCreativeMappingsService as never,
  );
  const input = {
    adAccountId: 'act-123',
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
        target: { kind: 'paid' as const, platform: 'x' as const },
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
        platform: 'x' as const,
        selector: { adPerformanceId: 'source-1', kind: 'public_ad' as const },
        sourceId: 'source-1',
        title: 'Source pattern',
      },
      version: 1 as const,
    },
    credentialId: 'credential-1',
    organizationId: 'org-1',
    runId: 'run-1',
    sourceTweetId: 'tweet-1',
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
      grantedScopes: ['ads.read', 'ads.write', 'offline.access'],
      grantedScopesCapturedAt: new Date('2026-08-20T09:00:00.000Z'),
      id: 'credential-1',
    });
    prisma.post.findFirst.mockResolvedValue({
      externalId: 'tweet-1',
      id: 'post-1',
      platform: 'twitter',
    });
    prisma.ingredient.findFirst.mockResolvedValue({
      id: 'image-1',
      status: IngredientStatus.GENERATED,
    });
    xAdsService.getAdAccounts.mockResolvedValue([
      { id: 'act-123', name: 'Northstar' },
    ]);
    xAdsService.getFundingInstruments.mockResolvedValue([
      {
        currency: 'USD',
        entityStatus: 'ACTIVE',
        id: 'funding-1',
        type: 'CREDIT_CARD',
      },
    ]);
    xAdsService.listPublishedTweets.mockResolvedValue([{ id: 'tweet-1' }]);
    xAdsService.listCampaigns.mockResolvedValue([]);
    xAdsService.listLineItems.mockResolvedValue([]);
    xAdsService.listPromotedTweets.mockResolvedValue([]);
    xAdsService.createCampaign.mockResolvedValue({
      id: 'campaign-1',
      name: 'Genfeed Remix run-1-2-variant-1',
    });
    xAdsService.createLineItem.mockResolvedValue({
      id: 'line-item-1',
      name: 'Genfeed Remix run-1-2-variant-1 Line Item',
    });
    xAdsService.createPromotedTweet.mockResolvedValue({
      id: 'promoted-tweet-1',
      tweetId: 'tweet-1',
    });
    workflowProvenanceService.runAction.mockImplementation(
      async (_options, action) => ({
        provenance: {
          executionId: 'workflow-execution-1',
          workflowId: 'workflow-1',
          workflowLabel: 'Paused X Ads Draft',
        },
        result: await action(),
      }),
    );
    adCreativeMappingsService.findByContentId.mockResolvedValue([]);
  });

  it('creates all three objects with PAUSED-only inputs and complete lineage', async () => {
    const result = await service.prepare(input);

    expect(xAdsService.createCampaign).toHaveBeenCalledWith(
      'legacy-plaintext-token',
      'act-123',
      expect.objectContaining({
        entityStatus: 'PAUSED',
        fundingInstrumentId: 'funding-1',
      }),
    );
    expect(xAdsService.listPublishedTweets).toHaveBeenCalledWith(
      'legacy-plaintext-token',
      'act-123',
      ['tweet-1'],
    );
    expect(prisma.post.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { externalId: true, id: true, platform: true },
        where: expect.objectContaining({
          externalId: 'tweet-1',
          platform: 'twitter',
        }),
      }),
    );
    expect(xAdsService.createLineItem).toHaveBeenCalledWith(
      'legacy-plaintext-token',
      'act-123',
      expect.objectContaining({
        campaignId: 'campaign-1',
        entityStatus: 'PAUSED',
      }),
    );
    expect(xAdsService.createPromotedTweet).toHaveBeenCalledWith(
      'legacy-plaintext-token',
      'act-123',
      { lineItemId: 'line-item-1', tweetId: 'tweet-1' },
    );
    expect(result).toMatchObject({
      adId: 'promoted-tweet-1',
      adSetId: 'line-item-1',
      campaignId: 'campaign-1',
      ingredientId: 'image-1',
      postId: 'post-1',
      recipeRevision: 2,
      status: 'PAUSED',
      variantId: 'variant-1',
      workflowExecutionId: 'workflow-execution-1',
      workflowId: 'workflow-1',
    });
    expect(adCreativeMappingsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'x', status: 'paused' }),
    );
  });

  it('replays deterministic provider objects instead of creating duplicates', async () => {
    xAdsService.listCampaigns.mockResolvedValue([
      { id: 'campaign-1', name: 'Genfeed Remix run-1-2-variant-1' },
    ]);
    xAdsService.listLineItems.mockResolvedValue([
      { id: 'line-item-1', name: 'Genfeed Remix run-1-2-variant-1 Line Item' },
    ]);
    xAdsService.listPromotedTweets.mockResolvedValue([
      { id: 'promoted-tweet-1', tweetId: 'tweet-1' },
    ]);

    const result = await service.prepare(input);

    expect(result.replayed).toBe(true);
    expect(xAdsService.createCampaign).not.toHaveBeenCalled();
    expect(xAdsService.createLineItem).not.toHaveBeenCalled();
    expect(xAdsService.createPromotedTweet).not.toHaveBeenCalled();
  });

  it('rejects a foreign ad account before any create call', async () => {
    xAdsService.getAdAccounts.mockResolvedValue([]);

    await expect(service.prepare(input)).rejects.toThrow(
      'selected X Ads account is unavailable',
    );

    expect(xAdsService.getFundingInstruments).not.toHaveBeenCalled();
    expect(xAdsService.createCampaign).not.toHaveBeenCalled();
  });

  it('rejects missing ads.write before the first X Ads provider call', async () => {
    prisma.credential.findFirst.mockResolvedValue({
      accessToken: 'legacy-plaintext-token',
      grantedScopes: ['ads.read'],
      grantedScopesCapturedAt: new Date('2026-08-20T09:00:00.000Z'),
      id: 'credential-1',
    });

    await expect(service.prepare(input)).rejects.toThrow('ads.write');

    expect(xAdsService.getAdAccounts).not.toHaveBeenCalled();
    expect(xAdsService.createCampaign).not.toHaveBeenCalled();
  });

  it('rejects when the account has no funding instrument', async () => {
    xAdsService.getFundingInstruments.mockResolvedValue([]);

    await expect(service.prepare(input)).rejects.toThrow(
      'no available funding instrument',
    );

    expect(xAdsService.createCampaign).not.toHaveBeenCalled();
  });

  it('rejects a Tweet id that is not the approved remix post external id', async () => {
    prisma.post.findFirst.mockResolvedValue({
      externalId: 'different-tweet',
      id: 'post-1',
      platform: 'twitter',
    });

    await expect(service.prepare(input)).rejects.toThrow(
      'approved Review draft is not the supplied published X post',
    );

    expect(xAdsService.listPublishedTweets).not.toHaveBeenCalled();
    expect(workflowProvenanceService.runAction).not.toHaveBeenCalled();
    expect(xAdsService.createCampaign).not.toHaveBeenCalled();
  });

  it('rejects a Tweet that is not owned by the selected Ads account promotable user', async () => {
    xAdsService.listPublishedTweets.mockResolvedValue([]);

    await expect(service.prepare(input)).rejects.toThrow(
      'published Tweet is unavailable to the selected X Ads account',
    );

    expect(workflowProvenanceService.runAction).not.toHaveBeenCalled();
    expect(xAdsService.createCampaign).not.toHaveBeenCalled();
    expect(xAdsService.createLineItem).not.toHaveBeenCalled();
    expect(xAdsService.createPromotedTweet).not.toHaveBeenCalled();
  });
});

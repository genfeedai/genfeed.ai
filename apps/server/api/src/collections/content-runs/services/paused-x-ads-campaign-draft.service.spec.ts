import { BRAND_REMIX_DOWNSTREAM_ACTION_IDS } from '@api/collections/content-runs/services/brand-remix-downstream-workflow-definition';
import { PausedXAdsCampaignDraftService } from '@api/collections/content-runs/services/paused-x-ads-campaign-draft.service';
import { IngredientStatus } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type CapturedWorkflowAction = (request: {
  input: Record<string, unknown>;
  provenance: {
    executionId: string;
    workflowId: string;
    workflowLabel: string;
  };
}) => Promise<unknown> | unknown;

describe('PausedXAdsCampaignDraftService', () => {
  const prisma = {
    credential: { findFirst: vi.fn() },
    ingredient: { findFirst: vi.fn() },
    post: { findFirst: vi.fn(), updateMany: vi.fn() },
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
  const service = new PausedXAdsCampaignDraftService(
    prisma as never,
    xAdsService as never,
    workflowRunner as never,
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
  const oauthCredentials = {
    accessToken: 'legacy-plaintext-token',
    accessTokenSecret: 'legacy-plaintext-token-secret',
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
      accessTokenSecret: 'legacy-plaintext-token-secret',
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
    workflowRunner.runWorkflow.mockImplementation(async (request) => {
      const provenance = {
        executionId: 'workflow-execution-1',
        workflowId: 'workflow-1',
        workflowLabel: 'Paused X Ads Draft',
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
      let state = await execute(ids.X_VALIDATE_SOURCE, {
        request: request.inputValues.request,
      });
      for (const id of [
        ids.X_RESOLVE_ACCOUNT,
        ids.X_RESOLVE_FUNDING,
        ids.X_VALIDATE_TWEET,
        ids.X_ENSURE_CAMPAIGN,
        ids.X_ENSURE_LINE_ITEM,
        ids.X_ENSURE_PROMOTED_TWEET,
        ids.X_PERSIST_MAPPING,
      ]) {
        state = await execute(id, { state });
      }
      const result = await execute(ids.X_PERSIST_LINEAGE, { state });
      return { provenance, result };
    });
    adCreativeMappingsService.findByContentId.mockResolvedValue([]);
    prisma.post.updateMany.mockResolvedValue({ count: 1 });
  });

  it('creates all three objects with PAUSED-only inputs and complete lineage', async () => {
    const result = await service.prepare(input);

    expect(workflowRunner.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalId: 'brand-remix.x.paused-draft' }),
    );
    expect(
      JSON.stringify(workflowRunner.runWorkflow.mock.calls[0]?.[0].inputValues),
    ).not.toContain('legacy-plaintext-token');
    expect(xAdsService.createCampaign).toHaveBeenCalledWith(
      oauthCredentials,
      'act-123',
      expect.objectContaining({
        entityStatus: 'PAUSED',
        fundingInstrumentId: 'funding-1',
      }),
    );
    expect(xAdsService.listPublishedTweets).toHaveBeenCalledWith(
      oauthCredentials,
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
      oauthCredentials,
      'act-123',
      expect.objectContaining({
        campaignId: 'campaign-1',
        entityStatus: 'PAUSED',
      }),
    );
    expect(xAdsService.createPromotedTweet).toHaveBeenCalledWith(
      oauthCredentials,
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

  it('rejects a missing OAuth token secret before the first X Ads provider call', async () => {
    prisma.credential.findFirst.mockResolvedValue({
      accessToken: 'legacy-plaintext-token',
      accessTokenSecret: null,
      id: 'credential-1',
    });

    await expect(service.prepare(input)).rejects.toThrow(
      'selected X Ads credential is unavailable',
    );

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
    expect(workflowRunner.runWorkflow).toHaveBeenCalledOnce();
    expect(xAdsService.createCampaign).not.toHaveBeenCalled();
  });

  it('rejects a Tweet that is not owned by the selected Ads account promotable user', async () => {
    xAdsService.listPublishedTweets.mockResolvedValue([]);

    await expect(service.prepare(input)).rejects.toThrow(
      'published Tweet is unavailable to the selected X Ads account',
    );

    expect(workflowRunner.runWorkflow).toHaveBeenCalledOnce();
    expect(xAdsService.createCampaign).not.toHaveBeenCalled();
    expect(xAdsService.createLineItem).not.toHaveBeenCalled();
    expect(xAdsService.createPromotedTweet).not.toHaveBeenCalled();
  });
});

import type { AgentToolResult } from '@genfeedai/interfaces';
import { AgentAdsResearchToolHandler } from '@server/services/agent-orchestrator/tools/agent-ads-research-tool-handler.service';
import type { ToolExecutionContext } from '@server/services/agent-orchestrator/tools/agent-tool-executor.service';
import { describe, expect, it, vi } from 'vitest';

const CONTEXT: ToolExecutionContext = {
  organizationId: 'organization-1',
  userId: 'user-1',
};
const BRANDED_CONTEXT: ToolExecutionContext = {
  ...CONTEXT,
  brandId: 'brand-1',
};

function createAdsResearchService(overrides: Record<string, unknown> = {}) {
  return {
    createRemixWorkflow: vi.fn().mockResolvedValue({
      adPack: {},
      reviewRequired: true,
      workflowDescription: 'Draft remix workflow',
      workflowId: 'workflow-1',
      workflowName: 'Ad remix',
    }),
    generateAdPack: vi.fn().mockResolvedValue({
      assetCreativeBrief: 'Lead with the proof shot.',
      headlines: ['Proof in seven days'],
    }),
    getAdDetail: vi.fn(),
    listAds: vi.fn(),
    prepareCampaignForReview: vi.fn().mockResolvedValue({
      channel: 'feed',
      platform: 'meta',
      publishMode: 'paused',
      status: 'pending_review',
      workflowId: 'workflow-1',
    }),
    ...overrides,
  };
}

function createHandler(overrides: Record<string, unknown> = {}) {
  const adsResearchService = createAdsResearchService(overrides);
  const brandsService = { findOne: vi.fn().mockResolvedValue(null) };
  const handler = new AgentAdsResearchToolHandler(
    adsResearchService as never,
    brandsService as never,
  );

  return { adsResearchService, handler };
}

function readCtaHrefs(result: AgentToolResult): string[] {
  return (result.nextActions ?? []).flatMap((action) =>
    (action.ctas ?? [])
      .map((cta) => cta.href)
      .filter((href): href is string => typeof href === 'string'),
  );
}

describe('AgentAdsResearchToolHandler CTA hrefs', () => {
  // Every emitted href is a bare app path; AgentRouteRewriteService scopes it to
  // `/{orgSlug}/{brandSlug}` (or `/{orgSlug}/~`) before the result reaches the
  // UI. The bare path must therefore match a real route segment — the app has
  // no compatibility redirect for retired surfaces.
  it('points ads CTAs at the discovery ads routes', async () => {
    const { adsResearchService, handler } = createHandler({
      listAds: vi.fn().mockResolvedValue({
        connectedAds: [],
        filters: {},
        publicAds: [],
        summary: {
          connectedCount: 0,
          publicCount: 0,
          reviewPolicy: 'manual',
          selectedPlatform: 'meta',
        },
      }),
    });

    const result = await handler.listAdsResearch({}, CONTEXT);

    expect(adsResearchService.listAds).toHaveBeenCalled();
    expect(readCtaHrefs(result)).toEqual([
      '/discovery/ads/meta',
      '/discovery/ads',
    ]);
  });

  it('passes the resolved context brand through list and detail reads', async () => {
    const { adsResearchService, handler } = createHandler({
      getAdDetail: vi.fn().mockResolvedValue({
        channel: 'all',
        creative: {},
        id: 'public:x:ad-1',
        metrics: {},
        platform: 'x',
        source: 'public',
        sourceId: 'ad-1',
        title: 'Disclosure',
      }),
      listAds: vi.fn().mockResolvedValue({
        connectedAds: [],
        filters: {},
        publicAds: [],
        summary: {
          connectedCount: 0,
          publicCount: 0,
          reviewPolicy: 'manual',
          selectedPlatform: 'x',
        },
      }),
    });

    await handler.listAdsResearch({}, BRANDED_CONTEXT);
    await handler.getAdResearchDetail(
      { adId: 'ad-1', source: 'public' },
      BRANDED_CONTEXT,
    );

    expect(adsResearchService.listAds).toHaveBeenCalledWith(
      'organization-1',
      expect.objectContaining({ brandId: 'brand-1' }),
    );
    expect(adsResearchService.getAdDetail).toHaveBeenCalledWith(
      'organization-1',
      expect.objectContaining({ brandId: 'brand-1' }),
    );
  });

  it('points remix workflow CTAs at the automation workflows routes', async () => {
    const { handler } = createHandler();

    const result = await handler.createAdRemixWorkflow(
      { adId: 'ad-1', source: 'public' },
      CONTEXT,
    );

    expect(readCtaHrefs(result)).toEqual([
      '/automation/workflows/workflow-1',
      '/automation/workflows',
    ]);
  });

  it('points launch prep CTAs at the automation workflows and ads routes', async () => {
    const { handler } = createHandler();

    const result = await handler.prepareAdLaunchReview(
      { adId: 'ad-1', source: 'public' },
      CONTEXT,
    );

    expect(readCtaHrefs(result)).toEqual([
      '/automation/workflows/workflow-1',
      '/discovery/ads',
    ]);
  });

  it('never emits the retired /workflows surface', async () => {
    const { handler } = createHandler();

    const results = await Promise.all([
      handler.createAdRemixWorkflow(
        { adId: 'ad-1', source: 'public' },
        CONTEXT,
      ),
      handler.generateAdPack({ adId: 'ad-1', source: 'public' }, CONTEXT),
      handler.prepareAdLaunchReview(
        { adId: 'ad-1', source: 'public' },
        CONTEXT,
      ),
    ]);

    for (const href of results.flatMap(readCtaHrefs)) {
      expect(href.startsWith('/workflows')).toBe(false);
    }
  });
});

import type { AgentToolResult } from '@genfeedai/interfaces';
import { AgentRouteRewriteService } from '@server/services/agent-orchestrator/tools/agent-route-rewrite.service';

describe('AgentRouteRewriteService', () => {
  const loggerService = {
    warn: vi.fn(),
  };
  const brandsService = {
    findOne: vi.fn(),
  };
  const organizationsService = {
    findOne: vi.fn(),
  };

  const context = {
    organizationId: 'org-1',
    userId: 'user-1',
  };

  const createService = () =>
    new AgentRouteRewriteService(
      loggerService as never,
      brandsService as never,
      organizationsService as never,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    organizationsService.findOne.mockResolvedValue({ slug: 'genfeed-ai' });
    brandsService.findOne.mockResolvedValue({ slug: 'launch-brand' });
  });

  it('rewrites nested route hrefs with active organization and brand slugs', async () => {
    const service = createService();
    const result: AgentToolResult = {
      nextActions: [
        {
          ctas: [
            {
              href: '/analytics/overview?period=30d#top',
              label: 'Open analytics',
            },
            {
              ctaHref: '/automation/workflows/workflow-1',
              label: 'Open workflow',
            },
          ],
          editorUrl: '/publishing/review?filter=ready',
          id: 'action-review',
          title: 'Review',
          type: 'content_preview_card',
        },
      ],
      success: true,
    };

    const scoped = await service.scopeToolResultHrefs(result, context);

    expect(scoped.nextActions?.[0]).toMatchObject({
      ctas: [
        {
          href: '/genfeed-ai/launch-brand/analytics/overview?period=30d#top',
        },
        {
          ctaHref: '/genfeed-ai/launch-brand/automation/workflows/workflow-1',
        },
      ],
      editorUrl: '/genfeed-ai/launch-brand/publishing/review?filter=ready',
    });
  });

  // The ads tools emit bare `/discovery/ads*` paths. Discovery has no org-level
  // exemption, so it scopes to the brand route when a brand is resolvable and
  // to the `~` route otherwise — both exist in the app router.
  it('scopes bare ads hub hrefs onto the brand and org discovery routes', async () => {
    const service = createService();
    const adsResult: AgentToolResult = {
      creditsUsed: 0,
      nextActions: [
        {
          ctas: [
            { href: '/discovery/ads/meta', label: 'Open Meta ads' },
            { href: '/discovery/ads/google', label: 'Open Google ads' },
            { href: '/discovery/ads', label: 'Open ads hub' },
          ],
          id: 'ads-search-results-1',
          title: 'Ads search results',
          type: 'ads_search_results_card',
        },
      ],
      success: true,
    };

    const scopedToBrand = await service.scopeToolResultHrefs(
      adsResult,
      context,
    );

    expect(scopedToBrand.nextActions?.[0].ctas).toEqual([
      {
        href: '/genfeed-ai/launch-brand/discovery/ads/meta',
        label: 'Open Meta ads',
      },
      {
        href: '/genfeed-ai/launch-brand/discovery/ads/google',
        label: 'Open Google ads',
      },
      { href: '/genfeed-ai/launch-brand/discovery/ads', label: 'Open ads hub' },
    ]);

    brandsService.findOne.mockResolvedValueOnce(null);
    const scopedToOrg = await service.scopeToolResultHrefs(adsResult, context);

    expect(scopedToOrg.nextActions?.[0].ctas?.[0]).toMatchObject({
      href: '/genfeed-ai/~/discovery/ads/meta',
    });
  });

  it('uses org-level routes when no brand slug is available', async () => {
    brandsService.findOne.mockResolvedValueOnce(null);
    const service = createService();

    const scoped = await service.scopeToolResultHrefs(
      {
        nextActions: [
          {
            ctas: [{ href: '/settings/api-keys', label: 'Settings' }],
            title: 'Connect',
            type: 'oauth_connect_card',
          },
        ],
        success: true,
      },
      context,
    );

    expect(scoped.nextActions?.[0].ctas?.[0]).toMatchObject({
      href: '/genfeed-ai/~/settings/api-keys',
    });
  });

  it('preserves already scoped, admin, external, and protocol-relative hrefs', async () => {
    const service = createService();

    const scoped = await service.scopeToolResultHrefs(
      {
        nextActions: [
          {
            ctas: [
              { href: '/genfeed-ai/launch-brand/analytics', label: 'Scoped' },
              { href: '/admin/agent', label: 'Admin' },
              { href: 'https://genfeed.ai/docs', label: 'External' },
              { href: '//cdn.example.com/image.png', label: 'Protocol' },
            ],
            id: 'action-links',
            title: 'Links',
            type: 'content_preview_card',
          },
        ],
        creditsUsed: 0,
        success: true,
      },
      context,
    );

    expect(scoped.nextActions?.[0].ctas).toEqual([
      { href: '/genfeed-ai/launch-brand/analytics', label: 'Scoped' },
      { href: '/admin/agent', label: 'Admin' },
      { href: 'https://genfeed.ai/docs', label: 'External' },
      { href: '//cdn.example.com/image.png', label: 'Protocol' },
    ]);
  });

  it('does not rewrite url fields', async () => {
    const service = createService();

    const scoped = await service.scopeToolResultHrefs(
      {
        data: {
          href: '/publishing/review',
          url: '/media/generated-image.png',
        },
        success: true,
      },
      context,
    );

    expect(scoped.data).toEqual({
      href: '/genfeed-ai/launch-brand/publishing/review',
      url: '/media/generated-image.png',
    });
  });

  it('rewrites legacy /review and /calendar paths before brand scoping', async () => {
    const service = createService();

    const scoped = await service.scopeToolResultHrefs(
      {
        nextActions: [
          {
            ctas: [
              { href: '/review', label: 'Review Queue' },
              { href: '/calendar/posts', label: 'View Calendar' },
            ],
            id: 'action-calendar',
            title: 'Content calendar',
            type: 'content_preview_card',
          },
        ],
        creditsUsed: 0,
        success: true,
      },
      context,
    );

    expect(scoped.nextActions?.[0].ctas).toEqual([
      {
        href: '/genfeed-ai/launch-brand/publishing/review',
        label: 'Review Queue',
      },
      {
        href: '/genfeed-ai/launch-brand/publishing/calendar',
        label: 'View Calendar',
      },
    ]);
  });

  it('preserves the original result when organization slug resolution fails', async () => {
    organizationsService.findOne.mockResolvedValueOnce({ id: 'org-1' });
    const service = createService();
    const result: AgentToolResult = {
      nextActions: [
        {
          ctas: [{ href: '/settings/api-keys', label: 'Settings' }],
          title: 'Connect',
          type: 'oauth_connect_card',
        },
      ],
      success: true,
    };

    const scoped = await service.scopeToolResultHrefs(result, context);

    expect(scoped).toBe(result);
    expect(brandsService.findOne).not.toHaveBeenCalled();
  });

  it('uses the explicit context brand before selected-brand fallback', async () => {
    const service = createService();

    await service.scopeToolResultHrefs(
      {
        nextActions: [
          {
            ctas: [{ href: '/analytics', label: 'Analytics' }],
            title: 'Analytics',
            type: 'analytics_card',
          },
        ],
        success: true,
      },
      { ...context, brandId: 'brand-1' },
    );

    expect(brandsService.findOne).toHaveBeenCalledWith({
      id: 'brand-1',
      organizationId: 'org-1',
    });
  });
});

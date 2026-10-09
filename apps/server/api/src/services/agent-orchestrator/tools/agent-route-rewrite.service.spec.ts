import { AGENT_NEXT_STEP_DESTINATIONS } from '@api/services/agent-orchestrator/constants/agent-next-step-destinations.constant';
import { AgentRouteRewriteService } from '@api/services/agent-orchestrator/tools/agent-route-rewrite.service';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';

describe('AgentRouteRewriteService', () => {
  const loggerService = {
    warn: vi.fn(),
  };
  const brandsService = {
    findOne: vi.fn(),
  };
  const membersService = {
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
      membersService as never,
      organizationsService as never,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    organizationsService.findOne.mockResolvedValue({ slug: 'genfeed-ai' });
    brandsService.findOne.mockResolvedValue({ slug: 'launch-brand' });
    membersService.findOne.mockResolvedValue({
      currentBrandId: 'member-current-brand',
    });
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
      creditsUsed: 0,
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
      creditsUsed: 0,
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
        creditsUsed: 0,
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
        creditsUsed: 0,
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
              { href: '/calendar?release=r-1', label: 'Open release' },
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
        href: '/genfeed-ai/launch-brand/publishing/posts?view=calendar',
        label: 'View Calendar',
      },
      {
        href: '/genfeed-ai/launch-brand/publishing/posts?view=calendar&release=r-1',
        label: 'Open release',
      },
    ]);
  });

  it.each(['connected-accounts', 'agent', 'publishing', 'skills', 'knowledge'])(
    'scopes brand-only Settings %s with the resolved brand',
    async (page) => {
      const scoped = await createService().scopeToolResultHrefs(
        {
          creditsUsed: 0,
          success: true,
          data: { href: `/settings/${page}?q=1#top` },
        },
        context,
      );
      expect(scoped.data).toEqual({
        href: `/genfeed-ai/launch-brand/settings/${page}?q=1#top`,
      });
    },
  );

  it('repairs saved organization-only brand settings, preserves explicit brands and settings roots', async () => {
    const scoped = await createService().scopeToolResultHrefs(
      {
        creditsUsed: 0,
        success: true,
        data: {
          href: '/genfeed-ai/~/settings/connected-accounts?platform=x#top',
          ctaHref: '/genfeed-ai/other/settings/connected-accounts',
          editorUrl: '/genfeed-ai/launch-brand/settings',
        },
      },
      context,
    );
    expect(scoped.data).toEqual({
      href: '/genfeed-ai/launch-brand/settings/connected-accounts?platform=x#top',
      ctaHref: '/genfeed-ai/other/settings/connected-accounts',
      editorUrl: '/genfeed-ai/launch-brand/settings',
    });
  });

  it('falls back to the organization Brands hub when no brand is available', async () => {
    brandsService.findOne.mockResolvedValueOnce(null);
    const scoped = await createService().scopeToolResultHrefs(
      {
        creditsUsed: 0,
        success: true,
        data: { href: '/settings/connected-accounts' },
      },
      context,
    );
    expect(scoped.data).toEqual({ href: '/genfeed-ai/~/settings/brands' });
  });

  it.each([
    'subscription',
    'credits',
    'integrations',
    'models',
    'members',
    'brands',
  ])('keeps organization Settings %s in organization scope', async (page) => {
    const scoped = await createService().scopeToolResultHrefs(
      { creditsUsed: 0, success: true, data: { href: `/settings/${page}` } },
      context,
    );
    expect(scoped.data).toEqual({ href: `/genfeed-ai/~/settings/${page}` });
  });

  it('keeps personal Settings unscoped and repairs retired content destinations', async () => {
    const scoped = await createService().scopeToolResultHrefs(
      {
        creditsUsed: 0,
        success: true,
        data: {
          href: '/settings/personal',
          ctaHref: '/content/articles?search=launch#top',
          editorUrl: '/genfeed-ai/launch-brand/content/posts',
        },
      },
      context,
    );
    expect(scoped.data).toEqual({
      href: '/settings/personal',
      ctaHref:
        '/genfeed-ai/launch-brand/publishing/posts?type=article&search=launch#top',
      editorUrl: '/genfeed-ai/launch-brand/publishing/posts',
    });
  });

  it('repairs dynamic retired content links without changing their entity or query', async () => {
    const scoped = await createService().scopeToolResultHrefs(
      {
        creditsUsed: 0,
        success: true,
        data: { href: '/content/articles/article-1?view=edit#body' },
      },
      context,
    );
    expect(scoped.data).toEqual({
      href: '/genfeed-ai/launch-brand/publishing/posts/article-1?view=edit#body',
    });
  });

  it('scopes every canonical next-step destination to its owning surface', async () => {
    const destinations = Object.entries(AGENT_NEXT_STEP_DESTINATIONS);
    const scoped = await createService().scopeToolResultHrefs(
      {
        creditsUsed: 0,
        success: true,
        data: {
          destinations: destinations.map(([key, value]) => ({
            key,
            href: value.href,
          })),
        },
      },
      context,
    );
    const organizationKeys = new Set([
      'agent',
      'billing',
      'brand_settings',
      'credits',
      'members',
      'models',
      'provider_keys',
    ]);
    expect(scoped.data?.destinations).toEqual(
      destinations.map(([key, value]) => ({
        key,
        href:
          key === 'settings'
            ? value.href
            : `/genfeed-ai/${organizationKeys.has(key) ? '~' : 'launch-brand'}${value.href}`,
      })),
    );
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
      creditsUsed: 0,
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
        creditsUsed: 0,
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

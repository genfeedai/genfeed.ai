import { AgentRouteRewriteService } from '@api/services/agent-orchestrator/tools/agent-route-rewrite.service';
import type { AgentToolResult } from '@genfeedai/interfaces';

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
              ctaHref: '/automations/editor/workflow-1',
              label: 'Open workflow',
            },
          ],
          editorUrl: '/posts/review?filter=ready',
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
          ctaHref: '/genfeed-ai/launch-brand/automations/editor/workflow-1',
        },
      ],
      editorUrl: '/genfeed-ai/launch-brand/posts/review?filter=ready',
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
            title: 'Links',
            type: 'content_preview_card',
          },
        ],
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
          href: '/posts/review',
          url: '/media/generated-image.png',
        },
        success: true,
      },
      context,
    );

    expect(scoped.data).toEqual({
      href: '/genfeed-ai/launch-brand/posts/review',
      url: '/media/generated-image.png',
    });
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
      _id: 'brand-1',
      isDeleted: false,
      organization: 'org-1',
    });
  });
});

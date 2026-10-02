import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/collections/articles/services/articles.service', () => ({
  ArticlesService: class {},
}));
vi.mock('@libs/security/destination-guard', () => ({ safeFetch: vi.fn() }));

import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { safeFetch } from '@libs/security/destination-guard';
import { ArticleTrafficService } from './article-traffic.service';

describe('ArticleTrafficService', () => {
  const input = {
    articleId: 'article-1',
    brandId: 'brand-1',
    organizationId: 'org-1',
    period: '7d' as const,
    userId: 'user-1',
  };
  const article = {
    id: 'article-1',
    slug: 'tested-guide',
    publishedAt: new Date('2026-09-30T12:00:00Z'),
  };
  const findOne = vi.fn();
  const findPublicArticleBySlug = vi.fn();
  let settings: Record<string, string>;
  function service() {
    return new ArticleTrafficService(
      { findOne, findPublicArticleBySlug } as unknown as ArticlesService,
      { get: (key: string) => settings[key] } as unknown as ConfigService,
      { warn: vi.fn() } as unknown as LoggerService,
    );
  }
  beforeEach(() => {
    vi.resetAllMocks();
    settings = {
      GENFEEDAI_PUBLIC_URL: 'https://genfeed.ai',
      POSTHOG_QUERY_API_KEY: 'server-read-key',
      POSTHOG_PROJECT_ID: '192631',
    };
    findOne.mockResolvedValue(article);
    findPublicArticleBySlug.mockResolvedValue(article);
    vi.mocked(safeFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [['2026-10-01', 3, 1]] }),
    } as Response);
  });
  it('checks tenant, brand and article visibility before contacting PostHog', async () => {
    findOne.mockResolvedValue(null);
    await expect(
      service().getTraffic(input, new Date('2026-10-02T12:00:00Z')),
    ).rejects.toThrow();
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        id: input.articleId,
        organizationId: input.organizationId,
        brandId: input.brandId,
        isDeleted: false,
      }),
    );
    expect(safeFetch).not.toHaveBeenCalled();
  });
  it('distinguishes unavailable configuration from zero readers', async () => {
    delete settings.POSTHOG_QUERY_API_KEY;
    const result = await service().getTraffic(
      input,
      new Date('2026-10-02T12:00:00Z'),
    );
    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'not_configured',
      totalViews: null,
      days: [],
    });
    expect(safeFetch).not.toHaveBeenCalled();
  });
  it('does not expose another article’s traffic when a public slug collides', async () => {
    findPublicArticleBySlug.mockResolvedValue({
      ...article,
      id: 'other-tenant-article',
    });
    const result = await service().getTraffic(
      input,
      new Date('2026-10-02T12:00:00Z'),
    );
    expect(result.reason).toBe('not_canonical');
    expect(safeFetch).not.toHaveBeenCalled();
  });
  it('returns UTC daily history with zero-filled dates and separate resource actions', async () => {
    const result = await service().getTraffic(
      input,
      new Date('2026-10-02T12:00:00Z'),
    );
    expect(result).toMatchObject({
      status: 'available',
      totalViews: 3,
      totalResourceClicks: 1,
      startDate: '2026-09-30T12:00:00.000Z',
    });
    expect(result.days).toEqual([
      { date: '2026-09-30', views: 0, resourceClicks: 0 },
      { date: '2026-10-01', views: 3, resourceClicks: 1 },
      { date: '2026-10-02', views: 0, resourceClicks: 0 },
    ]);
    const [url, request] = vi.mocked(safeFetch).mock.calls[0];
    expect(String(url)).toBe(
      'https://eu.posthog.com/api/projects/192631/query/',
    );
    expect(request?.headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer server-read-key' }),
    );
    const body = JSON.parse(String(request?.body));
    expect(body.query.query).toContain("properties.$host = 'genfeed.ai'");
    expect(body.query.query).toContain(
      "properties.$pathname = '/articles/tested-guide'",
    );
    expect(body.query.query).toContain('previewToken');
    expect(JSON.stringify(result)).not.toContain('server-read-key');
  });
  it('rejects malformed analytics and provider failures instead of fabricating zeros', async () => {
    vi.mocked(safeFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [['2026-10-01', -5, 0]] }),
    } as Response);
    expect(
      (await service().getTraffic(input, new Date('2026-10-02T12:00:00Z')))
        .reason,
    ).toBe('upstream_error');
  });
  it('returns zero only after a successful empty query', async () => {
    vi.mocked(safeFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    } as Response);
    expect(
      await service().getTraffic(input, new Date('2026-10-02T12:00:00Z')),
    ).toMatchObject({
      status: 'available',
      totalViews: 0,
      totalResourceClicks: 0,
    });
  });
  it('handles malformed publication dates without a runtime exception', async () => {
    findOne.mockResolvedValue({ ...article, publishedAt: 'invalid' });
    expect(
      (await service().getTraffic(input, new Date('2026-10-02T12:00:00Z')))
        .reason,
    ).toBe('not_published');
    expect(safeFetch).not.toHaveBeenCalled();
  });
  it('does not query an article without a public slug', async () => {
    findOne.mockResolvedValue({ ...article, slug: null });
    expect(
      (await service().getTraffic(input, new Date('2026-10-02T12:00:00Z')))
        .reason,
    ).toBe('not_published');
    expect(safeFetch).not.toHaveBeenCalled();
  });
  it('does not convert missing provider counts into zero', async () => {
    vi.mocked(safeFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [['2026-10-01', null, 0]] }),
    } as Response);
    expect(
      (await service().getTraffic(input, new Date('2026-10-02T12:00:00Z')))
        .reason,
    ).toBe('upstream_error');
  });
  it('uses publication time for the all-time range', async () => {
    const result = await service().getTraffic(
      { ...input, period: 'all' },
      new Date('2026-10-02T12:00:00Z'),
    );
    expect(result.startDate).toBe(article.publishedAt.toISOString());
  });
  it('does not query scheduled or unpublished content', async () => {
    findPublicArticleBySlug.mockResolvedValue(null);
    expect(
      (await service().getTraffic(input, new Date('2026-10-02T12:00:00Z')))
        .reason,
    ).toBe('not_published');
    expect(safeFetch).not.toHaveBeenCalled();
  });
  it('never sends a read credential to an arbitrary configured host', async () => {
    settings.POSTHOG_QUERY_HOST = 'https://attacker.example';
    expect(
      (await service().getTraffic(input, new Date('2026-10-02T12:00:00Z')))
        .reason,
    ).toBe('not_configured');
    expect(safeFetch).not.toHaveBeenCalled();
  });
});

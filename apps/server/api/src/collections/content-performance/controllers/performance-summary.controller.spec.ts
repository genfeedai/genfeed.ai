import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { PerformanceSummaryController } from '@api/collections/content-performance/controllers/performance-summary.controller';
import type { PerformanceSummaryService } from '@api/collections/content-performance/services/performance-summary.service';
import { runWithTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import { testId } from '@helpers/testing/test-id.helper';
import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/response/response.util', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@api/helpers/utils/response/response.util')
    >();
  return {
    ...actual,
    serializeSingle: (_req: unknown, _serializer: unknown, data: unknown) => ({
      data,
    }),
  };
});

interface Post {
  brandId: string;
  engagementRate: number;
  id: string;
  organizationId: string;
  publishedAt: string;
}

interface DateRange {
  endDate?: string;
  startDate?: string;
}

const ORG = testId('org');
const OTHER_ORG = testId('org', 2);
const BRAND = testId('brand');
const TOP_TEN = [
  'post-1',
  'post-2',
  'post-3',
  'post-4',
  'post-5',
  'post-6',
  'post-7',
  'post-8',
  'post-9',
  'post-10',
];
const req = { originalUrl: '/content-performance/summary' } as Request;
const user: AuthenticatedUser = {
  brandId: BRAND,
  id: 'user_123',
  organizationId: ORG,
  userId: testId('user'),
};

describe('PerformanceSummaryController', () => {
  let posts: Post[];
  let controller: PerformanceSummaryController;

  const idsOf = (rows: Post[]) => rows.map((row) => row.id);

  beforeEach(() => {
    // Sixty posts of the brand in January, best first, plus one post of
    // another organization that reuses the brand id.
    posts = Array.from({ length: 60 }, (_, index) => ({
      brandId: BRAND,
      engagementRate: 100 - index,
      id: `post-${index + 1}`,
      organizationId: ORG,
      publishedAt: `2025-01-${String((index % 28) + 1).padStart(2, '0')}`,
    }));
    posts.push({
      brandId: BRAND,
      engagementRate: 1000,
      id: 'post-foreign',
      organizationId: OTHER_ORG,
      publishedAt: '2025-01-01',
    });

    const ranked = (org: string, brand: string, range: DateRange = {}) =>
      posts
        .filter(
          (post) =>
            post.organizationId === org &&
            post.brandId === brand &&
            (!range.startDate || post.publishedAt >= range.startDate) &&
            (!range.endDate || post.publishedAt <= range.endDate),
        )
        .sort((a, b) => b.engagementRate - a.engagementRate);
    const service = {
      generatePerformanceContext: async (org: string, brand: string) =>
        `Top post: ${ranked(org, brand)[0]?.id ?? 'none'}`,
      getPromptPerformance: async (
        org: string,
        brand: string,
        startDate?: string,
        endDate?: string,
      ) => ranked(org, brand, { endDate, startDate }).length,
      getTopPerformers: async (
        org: string,
        brand: string,
        limit: number,
        range: DateRange,
      ) => ranked(org, brand, range).slice(0, limit),
      getWeeklySummary: async (
        org: string,
        brand: string,
        options: DateRange & { topN?: number; worstN?: number },
      ) => {
        const rows = ranked(org, brand, options);
        return {
          topPerformers: rows.slice(0, options.topN ?? 5),
          worstPerformers: rows.reverse().slice(0, options.worstN ?? 5),
        };
      },
    } as unknown as PerformanceSummaryService;

    controller = new PerformanceSummaryController(service);
  });

  it.each([
    ['the requested counts', '3', '2', 3, 2],
    ['default counts when none are given', undefined, undefined, 5, 5],
    ['counts clamped to fifty', '5000', '9999', 50, 50],
    ['counts raised to one', '-4', '0', 1, 1],
  ])(
    'summarizes the week with %s',
    async (_case, topN, worstN, topCount, worstCount) => {
      const { data } = (await controller.getWeeklySummary(
        req,
        BRAND,
        topN,
        worstN,
        undefined,
        undefined,
        user,
      )) as unknown as {
        data: { topPerformers: Post[]; worstPerformers: Post[] };
      };

      expect(data.topPerformers).toHaveLength(topCount);
      expect(data.worstPerformers).toHaveLength(worstCount);
      expect(data.topPerformers[0]?.id).toBe('post-1');
      expect(data.worstPerformers[0]?.id).toBe('post-60');
    },
  );

  it('summarizes only the requested dates', async () => {
    const { data } = (await controller.getWeeklySummary(
      req,
      BRAND,
      '50',
      undefined,
      '2025-01-01',
      '2025-01-02',
      user,
    )) as unknown as { data: { topPerformers: Post[] } };

    expect(idsOf(data.topPerformers)).toEqual([
      'post-1',
      'post-2',
      'post-29',
      'post-30',
      'post-57',
      'post-58',
    ]);
  });

  it.each([
    ['the requested limit', '3', ['post-1', 'post-2', 'post-3']],
    ['ten by default', undefined, TOP_TEN],
    ['ten for an unreadable limit', 'many', TOP_TEN],
  ])('lists top performers up to %s', async (_case, limit, expected) => {
    const rows = await controller.getTopPerformers(
      BRAND,
      limit,
      undefined,
      undefined,
      user,
    );

    expect(idsOf(rows as unknown as Post[])).toEqual(expected);
  });

  it('clamps a client-supplied top performer limit to fifty', async () => {
    const rows = await controller.getTopPerformers(
      BRAND,
      '10000',
      undefined,
      undefined,
      user,
    );

    expect(rows).toHaveLength(50);
  });

  it('ranks prompt performance within the requested dates', async () => {
    await expect(
      controller.getPromptPerformance(BRAND, '2025-01-01', '2025-01-07', user),
    ).resolves.toBe(18);
  });

  it('reads the selected organization when the request overrides it', async () => {
    const context = await runWithTenantReadScope(
      {
        brandId: BRAND,
        isOrganizationOverride: true,
        organizationId: OTHER_ORG,
      },
      () => controller.getGenerationContext(BRAND, user),
    );

    expect(context).toEqual({ context: 'Top post: post-foreign' });
  });

  it('builds generation context from the caller organization only', async () => {
    await expect(controller.getGenerationContext(BRAND, user)).resolves.toEqual(
      { context: 'Top post: post-1' },
    );
  });

  it.each([
    ['an empty brand id', ''],
    ['a malformed brand id', 'not-a-brand'],
  ])('refuses %s', async (_case, brandId) => {
    await expect(
      controller.getGenerationContext(brandId, user),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn(
    (_request: unknown, serializer: unknown, data: unknown) => ({
      data,
      serializer,
    }),
  ),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { WinnerClassificationService } from '@api/collections/outliers/services/winner-classification.service';
import type { AnalyticsService } from '@api/endpoints/analytics/analytics.service';
import { AnalyticsWinnersController } from '@api/endpoints/analytics/analytics-winners.controller';
import type { WinnerPostsQueryDto } from '@api/endpoints/analytics/dto/winner-posts-query.dto';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { AnalyticsWinnerPostSerializer } from '@genfeedai/serializers';
import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';

type Post = {
  brandId: string;
  organizationId: string;
  platform: string;
  postId: string;
  publishedAt: Date;
};

const posts: Post[] = [
  {
    brandId: 'brand-1',
    organizationId: 'org-1',
    platform: 'instagram',
    postId: 'in-window',
    publishedAt: new Date('2026-10-05T12:00:00Z'),
  },
  {
    brandId: 'brand-2',
    organizationId: 'org-1',
    platform: 'instagram',
    postId: 'sibling-brand',
    publishedAt: new Date('2026-10-05T12:00:00Z'),
  },
  {
    brandId: 'brand-1',
    organizationId: 'org-1',
    platform: 'instagram',
    postId: 'before-window',
    publishedAt: new Date('2026-09-20T12:00:00Z'),
  },
  {
    brandId: 'brand-9',
    organizationId: 'org-2',
    platform: 'instagram',
    postId: 'other-org',
    publishedAt: new Date('2026-10-05T12:00:00Z'),
  },
];

/**
 * Brands per organization for the scope check, and winning posts filtered by
 * tenant, brand, platform and publication window as the classifier reads them.
 */
function buildController() {
  const brands = [
    { id: 'brand-1', organizationId: 'org-1' },
    { id: 'brand-2', organizationId: 'org-1' },
  ];
  const analyticsService = {
    assertBrandInScope: async (
      brandId: string | undefined,
      organizationId: string,
    ) => {
      if (
        brandId &&
        !brands.some(
          (brand) =>
            brand.id === brandId && brand.organizationId === organizationId,
        )
      ) {
        throw new NotFoundException('Brand', brandId);
      }
    },
  };
  const winners = {
    findWinners: async (query: {
      brandId?: string;
      organizationId: string;
      platform?: string;
      publishedFrom: Date;
      publishedTo: Date;
    }) =>
      posts
        .filter(
          (post) =>
            post.organizationId === query.organizationId &&
            (!query.brandId || post.brandId === query.brandId) &&
            (!query.platform || post.platform === query.platform) &&
            post.publishedAt >= query.publishedFrom &&
            post.publishedAt <= query.publishedTo,
        )
        .map((post) => ({ evidence: [], postId: post.postId })),
  };
  return new AnalyticsWinnersController(
    analyticsService as unknown as AnalyticsService,
    winners as unknown as WinnerClassificationService,
  );
}

describe('AnalyticsWinnersController (#5502)', () => {
  const request = { query: {} } as unknown as Request;
  const user = { id: 'user-1', organizationId: 'org-1' } as User;
  const query = {
    brandId: 'brand-1',
    endDate: '2026-10-09',
    limit: 10,
    platform: 'instagram',
    startDate: '2026-10-01',
  } as WinnerPostsQueryDto;

  it('reads winners for an in-scope brand in the window and serializes them', async () => {
    await expect(
      buildController().findWinners(user, request, query),
    ).resolves.toEqual({
      data: [{ evidence: [], postId: 'in-window' }],
      serializer: AnalyticsWinnerPostSerializer,
    });
  });

  it('reads every brand in the organization when no brand is named', async () => {
    const { brandId: _brandId, ...organizationQuery } = query;

    await expect(
      buildController().findWinners(
        user,
        request,
        organizationQuery as WinnerPostsQueryDto,
      ),
    ).resolves.toMatchObject({
      data: [{ postId: 'in-window' }, { postId: 'sibling-brand' }],
    });
  });

  it('refuses a brand outside the caller organization', async () => {
    await expect(
      buildController().findWinners(user, request, {
        ...query,
        brandId: 'brand-9',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a request without an organization', async () => {
    await expect(
      buildController().findWinners({ id: 'user-1' } as User, request, query),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

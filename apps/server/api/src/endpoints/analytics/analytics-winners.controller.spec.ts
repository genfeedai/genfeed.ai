vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => data,
  ),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { WinnerClassificationService } from '@api/collections/outliers/services/winner-classification.service';
import type { AnalyticsService } from '@api/endpoints/analytics/analytics.service';
import { AnalyticsWinnersController } from '@api/endpoints/analytics/analytics-winners.controller';
import type { WinnerPostsQueryDto } from '@api/endpoints/analytics/dto/winner-posts-query.dto';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { AnalyticsWinnerPostSerializer } from '@genfeedai/serializers';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';

describe('AnalyticsWinnersController (#5502)', () => {
  const analyticsService = { assertBrandInScope: vi.fn() };
  const winnerClassificationService = { findWinners: vi.fn() };
  const controller = new AnalyticsWinnersController(
    analyticsService as unknown as AnalyticsService,
    winnerClassificationService as unknown as WinnerClassificationService,
  );
  const request = { query: {} } as unknown as Request;
  const user = { id: 'user-1', organizationId: 'org-1' } as User;
  const query = {
    brandId: 'brand-1',
    endDate: '2026-10-09',
    limit: 10,
    platform: 'instagram',
    startDate: '2026-10-01',
  } as WinnerPostsQueryDto;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reads winners for an in-scope brand and serializes them', async () => {
    const winners = [{ evidence: [], postId: 'post-1' }];
    analyticsService.assertBrandInScope.mockResolvedValue(undefined);
    winnerClassificationService.findWinners.mockResolvedValue(winners);

    await expect(controller.findWinners(user, request, query)).resolves.toBe(
      winners,
    );
    expect(analyticsService.assertBrandInScope).toHaveBeenCalledWith(
      'brand-1',
      'org-1',
    );
    expect(winnerClassificationService.findWinners).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        limit: 10,
        organizationId: 'org-1',
        platform: 'instagram',
        publishedFrom: expect.any(Date),
        publishedTo: expect.any(Date),
      }),
    );
    expect(serializeSingle).toHaveBeenCalledWith(
      request,
      AnalyticsWinnerPostSerializer,
      winners,
    );
  });

  it('refuses a brand outside the caller organization', async () => {
    analyticsService.assertBrandInScope.mockRejectedValue(
      new NotFoundException(),
    );

    await expect(
      controller.findWinners(user, request, query),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(winnerClassificationService.findWinners).not.toHaveBeenCalled();
  });

  it('refuses a request without an organization', async () => {
    await expect(
      controller.findWinners({ id: 'user-1' } as User, request, query),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(winnerClassificationService.findWinners).not.toHaveBeenCalled();
  });
});

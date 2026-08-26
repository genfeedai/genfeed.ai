vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  getIsSuperAdmin: (user: { isSuperAdmin?: boolean }) =>
    Boolean(user.isSuperAdmin),
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => data,
  ),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AnalyticsAdminController } from '@api/endpoints/analytics/analytics-admin.controller';
import { AnalyticsAdminSummaryService } from '@api/endpoints/analytics/analytics-admin-summary.service';
import {
  AdminBrandsQueryDto,
  AdminOrgsQueryDto,
  LeaderboardQueryDto,
} from '@api/endpoints/analytics/dto/leaderboard-query.dto';
import { EntityLeaderboardService } from '@api/endpoints/analytics/entity-leaderboard.service';
import type { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import {
  AnalyticSerializer,
  AnalyticsBrandLeaderboardSerializer,
  AnalyticsBrandStatsSerializer,
  AnalyticsOrgLeaderboardSerializer,
  AnalyticsOrgStatsSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';

describe('AnalyticsAdminController', () => {
  const loggerService = { log: vi.fn() };
  const summaryService = { getSummary: vi.fn() };
  const leaderboardService = {
    getBrandsLeaderboard: vi.fn(),
    getBrandsWithStats: vi.fn(),
    getOrganizationsLeaderboard: vi.fn(),
    getOrganizationsWithStats: vi.fn(),
  };
  const controller = new AnalyticsAdminController(
    loggerService as unknown as LoggerService,
    summaryService as unknown as AnalyticsAdminSummaryService,
    leaderboardService as unknown as EntityLeaderboardService,
  );
  const request = {
    originalUrl: '/api/analytics',
    query: {},
    user: { id: 'user-1' },
  } as unknown as Request;
  const superAdmin = {
    id: 'user-1',
    isSuperAdmin: true,
    organizationId: 'org-1',
  } as User;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('delegates the admin summary and preserves its serializer boundary', async () => {
    const summary = { totalUsers: 8 };
    const query = { limit: 25, page: 2 } as BaseQueryDto;
    summaryService.getSummary.mockResolvedValue(summary);

    await expect(controller.findAll(request, query)).resolves.toBe(summary);
    expect(summaryService.getSummary).toHaveBeenCalledWith(query);
    expect(serializeSingle).toHaveBeenCalledWith(
      request,
      AnalyticSerializer,
      summary,
    );
  });

  it('delegates the organization leaderboard and stats contracts', async () => {
    const leaderboardQuery = {
      endDate: '2025-01-31',
      limit: 10,
      sort: 'engagement',
      startDate: '2025-01-01',
    } as LeaderboardQueryDto;
    const statsQuery = {
      ...leaderboardQuery,
      limit: 20,
      page: 2,
    } as AdminOrgsQueryDto;
    leaderboardService.getOrganizationsLeaderboard.mockResolvedValue([]);
    leaderboardService.getOrganizationsWithStats.mockResolvedValue({
      data: [],
    });

    await controller.getOrganizationsLeaderboard(request, leaderboardQuery);
    await controller.getOrganizationsWithStats(request, statsQuery);

    expect(leaderboardService.getOrganizationsLeaderboard).toHaveBeenCalledWith(
      '2025-01-01',
      '2025-01-31',
      'engagement',
      10,
    );
    expect(serializeSingle).toHaveBeenCalledWith(
      request,
      AnalyticsOrgLeaderboardSerializer,
      [],
    );
    expect(leaderboardService.getOrganizationsWithStats).toHaveBeenCalledWith(
      '2025-01-01',
      '2025-01-31',
      2,
      20,
      'engagement',
    );
    expect(serializeSingle).toHaveBeenCalledWith(
      request,
      AnalyticsOrgStatsSerializer,
      { data: [] },
    );
  });

  it('keeps brand analytics scoped to a non-admin organization', async () => {
    const user = { id: 'user-2', organizationId: 'org-2' } as User;
    const leaderboardQuery = {
      endDate: '2025-01-31',
      limit: 5,
      sort: 'engagement',
      startDate: '2025-01-01',
    } as LeaderboardQueryDto;
    const statsQuery = {
      ...leaderboardQuery,
      limit: 15,
      page: 2,
    } as AdminBrandsQueryDto;
    leaderboardService.getBrandsLeaderboard.mockResolvedValue([]);
    leaderboardService.getBrandsWithStats.mockResolvedValue({ data: [] });

    await controller.getBrandsLeaderboard(user, request, leaderboardQuery);
    await controller.getBrandsWithStats(user, request, statsQuery);

    expect(leaderboardService.getBrandsLeaderboard).toHaveBeenCalledWith(
      '2025-01-01',
      '2025-01-31',
      'engagement',
      5,
      'org-2',
    );
    expect(serializeSingle).toHaveBeenCalledWith(
      request,
      AnalyticsBrandLeaderboardSerializer,
      [],
    );
    expect(leaderboardService.getBrandsWithStats).toHaveBeenCalledWith(
      '2025-01-01',
      '2025-01-31',
      2,
      15,
      'engagement',
      'org-2',
    );
    expect(serializeSingle).toHaveBeenCalledWith(
      request,
      AnalyticsBrandStatsSerializer,
      { data: [] },
    );
  });

  it('keeps super-admin brand analytics unscoped', async () => {
    const query = { limit: 10, sort: 'engagement' } as LeaderboardQueryDto;
    leaderboardService.getBrandsLeaderboard.mockResolvedValue([]);

    await controller.getBrandsLeaderboard(superAdmin, request, query);

    expect(leaderboardService.getBrandsLeaderboard).toHaveBeenCalledWith(
      undefined,
      undefined,
      'engagement',
      10,
      undefined,
    );
  });

  it('preserves the missing-organization error for brand analytics', async () => {
    const query = { limit: 10, sort: 'engagement' } as LeaderboardQueryDto;

    await expect(
      controller.getBrandsLeaderboard({ id: 'user-3' } as User, request, query),
    ).rejects.toEqual(
      new ForbiddenException(
        'You must be part of an organization to access analytics',
      ),
    );
    expect(leaderboardService.getBrandsLeaderboard).not.toHaveBeenCalled();
  });
});

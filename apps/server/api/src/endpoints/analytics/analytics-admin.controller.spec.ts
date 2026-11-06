import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AnalyticsAdminController } from '@api/endpoints/analytics/analytics-admin.controller';
import type { AnalyticsAdminSummaryService } from '@api/endpoints/analytics/analytics-admin-summary.service';
import {
  ANALYTICS_MISSING_ORGANIZATION_MESSAGE,
  ANALYTICS_TENANT_FORBIDDEN,
} from '@api/endpoints/analytics/analytics-tenant-scope';
import type {
  AdminBrandsQueryDto,
  AdminOrgsQueryDto,
  LeaderboardQueryDto,
} from '@api/endpoints/analytics/dto/leaderboard-query.dto';
import type { EntityLeaderboardService } from '@api/endpoints/analytics/entity-leaderboard.service';
import type { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import {
  AnalyticSerializer,
  AnalyticsBrandLeaderboardSerializer,
  AnalyticsBrandStatsSerializer,
  AnalyticsOrgLeaderboardSerializer,
  AnalyticsOrgStatsSerializer,
} from '@genfeedai/serializers';
import type { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  getIsSuperAdmin: (user: { isSuperAdmin?: boolean }) =>
    Boolean(user.isSuperAdmin),
}));

vi.mock('@api/helpers/utils/response/response.util', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@api/helpers/utils/response/response.util')
    >();
  return {
    ...actual,
    serializeSingle: (_req: unknown, serializer: unknown, data: unknown) => ({
      data,
      serializer,
    }),
  };
});

interface Brand {
  engagement: number;
  id: string;
  label: string;
  organizationId: string;
}

interface Organization {
  engagement: number;
  id: string;
  label: string;
}

const BRANDS: Brand[] = [
  { engagement: 90, id: 'brand-a', label: 'Alpha', organizationId: 'org-1' },
  { engagement: 70, id: 'brand-b', label: 'Bravo', organizationId: 'org-2' },
  { engagement: 50, id: 'brand-c', label: 'Charlie', organizationId: 'org-2' },
  { engagement: 30, id: 'brand-d', label: 'Delta', organizationId: 'org-3' },
];
const ORGANIZATIONS: Organization[] = [
  { engagement: 90, id: 'org-1', label: 'One' },
  { engagement: 120, id: 'org-2', label: 'Two' },
  { engagement: 30, id: 'org-3', label: 'Three' },
];

const request = (query: Record<string, unknown> = {}) =>
  ({ originalUrl: '/api/analytics', query }) as unknown as Request;
const superAdmin = {
  id: 'user-1',
  isSuperAdmin: true,
  organizationId: 'org-1',
} as User;
const member = { id: 'user-2', organizationId: 'org-2' } as User;
const idsOf = (rows: { id: string }[]) => rows.map((row) => row.id);

describe('AnalyticsAdminController', () => {
  let controller: AnalyticsAdminController;

  beforeEach(() => {
    const byEngagement = <T extends { engagement: number }>(rows: T[]) =>
      [...rows].sort((a, b) => b.engagement - a.engagement);
    const page = <T>(rows: T[], pageNumber = 1, limit = 20) =>
      rows.slice((pageNumber - 1) * limit, pageNumber * limit);
    const brandsOf = (organizationId?: string) =>
      BRANDS.filter(
        (brand) => !organizationId || brand.organizationId === organizationId,
      );

    const summaryService = {
      getSummary: async (query: BaseQueryDto) => ({
        page: query.page,
        totalBrands: BRANDS.length,
        totalOrganizations: ORGANIZATIONS.length,
      }),
    } as unknown as AnalyticsAdminSummaryService;
    const leaderboards = {
      getBrandsLeaderboard: async (
        _start: string,
        _end: string,
        _sort: string,
        limit: number,
        organizationId?: string,
      ) => byEngagement(brandsOf(organizationId)).slice(0, limit),
      getBrandsWithStats: async (
        _start: string,
        _end: string,
        pageNumber: number,
        limit: number,
        _sort: string,
        organizationId?: string,
        search?: string,
        brandId?: string,
      ) =>
        page(
          byEngagement(brandsOf(organizationId)).filter(
            (brand) =>
              (!brandId || brand.id === brandId) &&
              (!search || brand.label.includes(search)),
          ),
          pageNumber,
          limit,
        ),
      getOrganizationsLeaderboard: async (
        _start: string,
        _end: string,
        _sort: string,
        limit: number,
      ) => byEngagement(ORGANIZATIONS).slice(0, limit),
      getOrganizationsWithStats: async (
        _start: string,
        _end: string,
        pageNumber: number,
        limit: number,
        _sort: string,
        search?: string,
        organizationId?: string,
      ) =>
        page(
          byEngagement(ORGANIZATIONS).filter(
            (organization) =>
              (!organizationId || organization.id === organizationId) &&
              (!search || organization.label.includes(search)),
          ),
          pageNumber,
          limit,
        ),
    } as unknown as EntityLeaderboardService;
    const logger = { log: () => undefined } as unknown as LoggerService;

    controller = new AnalyticsAdminController(
      logger,
      summaryService,
      leaderboards,
    );
  });

  it('serializes the platform summary for superadmins', async () => {
    await expect(
      controller.findAll(request(), { page: 2 } as BaseQueryDto),
    ).resolves.toEqual({
      data: { page: 2, totalBrands: 4, totalOrganizations: 3 },
      serializer: AnalyticSerializer,
    });
  });

  it('ranks every organization on the leaderboard', async () => {
    await expect(
      controller.getOrganizationsLeaderboard(request(), {
        limit: 2,
      } as LeaderboardQueryDto),
    ).resolves.toEqual({
      data: [
        expect.objectContaining({ id: 'org-2' }),
        expect.objectContaining({ id: 'org-1' }),
      ],
      serializer: AnalyticsOrgLeaderboardSerializer,
    });
  });

  it.each([
    [{ limit: 2, page: 2 }, ['org-3']],
    [{ search: 'T' }, ['org-2', 'org-3']],
    [{ organizationId: 'org-1' }, ['org-1']],
  ])('pages organization stats (%o)', async (query, expected) => {
    const result = (await controller.getOrganizationsWithStats(
      request(),
      query as AdminOrgsQueryDto,
    )) as { data: Organization[]; serializer: unknown };

    expect(idsOf(result.data)).toEqual(expected);
    expect(result.serializer).toBe(AnalyticsOrgStatsSerializer);
  });

  it.each([
    [
      'a superadmin across every organization',
      superAdmin,
      {},
      ['brand-a', 'brand-b', 'brand-c', 'brand-d'],
    ],
    [
      'a superadmin who names an organization',
      superAdmin,
      { organizationId: 'org-2' },
      ['brand-b', 'brand-c'],
    ],
    ['a member to their own organization', member, {}, ['brand-b', 'brand-c']],
    [
      'a member who names their own organization',
      member,
      { organizationId: 'org-2' },
      ['brand-b', 'brand-c'],
    ],
  ])('ranks brands for %s', async (_case, user, query, expected) => {
    const result = (await controller.getBrandsLeaderboard(
      user,
      request(query),
      { limit: 10 } as LeaderboardQueryDto,
    )) as { data: Brand[]; serializer: unknown };

    expect(idsOf(result.data)).toEqual(expected);
    expect(result.serializer).toBe(AnalyticsBrandLeaderboardSerializer);
  });

  it.each([
    [{ limit: 1, page: 2 }, ['brand-c']],
    [{ brandId: 'brand-c' }, ['brand-c']],
    [{ brandId: 'brand-a' }, []],
    [{ search: 'Bra' }, ['brand-b']],
  ])(
    'pages brand stats inside a member organization (%o)',
    async (query, expected) => {
      const result = (await controller.getBrandsWithStats(
        member,
        request(),
        query as AdminBrandsQueryDto,
      )) as { data: Brand[]; serializer: unknown };

      expect(idsOf(result.data)).toEqual(expected);
      expect(result.serializer).toBe(AnalyticsBrandStatsSerializer);
    },
  );

  it.each([
    [
      'a member without an organization',
      { id: 'user-3' } as User,
      {},
      new ForbiddenException(ANALYTICS_MISSING_ORGANIZATION_MESSAGE),
    ],
    [
      'a member who names another organization',
      member,
      { organizationId: 'org-1' },
      new ForbiddenException(ANALYTICS_TENANT_FORBIDDEN),
    ],
  ])('refuses brand analytics to %s', async (_case, user, query, error) => {
    await expect(
      controller.getBrandsWithStats(user, request(query), {
        limit: 10,
      } as AdminBrandsQueryDto),
    ).rejects.toEqual(error);
    await expect(
      controller.getBrandsLeaderboard(user, request(query), {
        limit: 10,
      } as LeaderboardQueryDto),
    ).rejects.toEqual(error);
  });
});

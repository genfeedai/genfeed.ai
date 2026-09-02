import { RedisCacheInterceptor } from '@api/cache/redis/redis-cache.interceptor';
import { AnalyticsController } from '@api/endpoints/analytics/analytics.controller';
import { AnalyticsModule } from '@api/endpoints/analytics/analytics.module';
import { AnalyticsAdminController } from '@api/endpoints/analytics/analytics-admin.controller';
import { ROLES_KEY } from '@api/helpers/decorators/roles/roles.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  INTERCEPTORS_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

describe('Analytics split-controller HTTP contract', () => {
  it.each([
    ['findAll', '/', 'AnalyticsController.findAll'],
    [
      'getOrganizationsLeaderboard',
      'organizations/leaderboard',
      'AnalyticsController.getOrganizationsLeaderboard',
    ],
    [
      'getOrganizationsWithStats',
      'organizations',
      'AnalyticsController.getOrganizationsWithStats',
    ],
    [
      'getBrandsLeaderboard',
      'brands/leaderboard',
      'AnalyticsController.getBrandsLeaderboard',
    ],
    ['getBrandsWithStats', 'brands', 'AnalyticsController.getBrandsWithStats'],
  ] as const)(
    'preserves the %s path, method, and operation id',
    (methodName, path, operationId) => {
      const handler = Reflect.get(
        AnalyticsAdminController.prototype,
        methodName,
      ) as object;

      expect(Reflect.getMetadata(PATH_METADATA, AnalyticsAdminController)).toBe(
        'analytics',
      );
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.GET,
      );
      expect(
        Reflect.getMetadata('swagger/apiOperation', handler),
      ).toMatchObject({ operationId, summary: methodName });
    },
  );

  it('preserves controller-level roles and cache interception', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AnalyticsAdminController),
    ).toEqual([RolesGuard]);
    expect(
      Reflect.getMetadata(INTERCEPTORS_METADATA, AnalyticsAdminController),
    ).toEqual([RedisCacheInterceptor]);
    expect(Reflect.getMetadata(GUARDS_METADATA, AnalyticsController)).toEqual([
      RolesGuard,
    ]);
    expect(
      Reflect.getMetadata(INTERCEPTORS_METADATA, AnalyticsController),
    ).toEqual([RedisCacheInterceptor]);
  });

  it('keeps both transport constructors within the dependency limit', () => {
    expect(
      Reflect.getMetadata('design:paramtypes', AnalyticsAdminController),
    ).toHaveLength(3);
    expect(
      Reflect.getMetadata('design:paramtypes', AnalyticsController),
    ).toHaveLength(8);
  });

  it('preserves super-admin role requirements on admin-wide routes', () => {
    for (const methodName of [
      'findAll',
      'getOrganizationsLeaderboard',
      'getOrganizationsWithStats',
    ] as const) {
      expect(
        Reflect.getMetadata(
          ROLES_KEY,
          AnalyticsAdminController.prototype[methodName],
        ),
      ).toEqual(['superadmin']);
    }

    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        AnalyticsAdminController.prototype.getBrandsLeaderboard,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        AnalyticsAdminController.prototype.getBrandsWithStats,
      ),
    ).toBeUndefined();
  });

  it.each([
    [
      'findAll',
      ['analytics', 'super-admin'],
      'analytics:super-admin:superadmin:all',
      { id: 'user-1', isSuperAdmin: true },
    ],
    [
      'getOrganizationsLeaderboard',
      ['analytics', 'super-admin', 'leaderboard'],
      'analytics:leaderboard:superadmin:all:2025-01-01:2025-01-31:views:25',
      { id: 'user-1', isSuperAdmin: true },
    ],
    [
      'getOrganizationsWithStats',
      ['analytics', 'super-admin', 'organizations'],
      'analytics:orgs:superadmin:all:2025-01-01:2025-01-31:2:25:views',
      { id: 'user-1', isSuperAdmin: true },
    ],
    [
      'getBrandsLeaderboard',
      ['analytics', 'brands-leaderboard'],
      'analytics:brands-leaderboard:customer:org-1:2025-01-01:2025-01-31:views:25',
      { id: 'user-1', organizationId: 'org-1' },
    ],
    [
      'getBrandsWithStats',
      ['analytics', 'brands'],
      'analytics:brands:customer:org-1:2025-01-01:2025-01-31:2:25:views',
      { id: 'user-1', organizationId: 'org-1' },
    ],
  ] as const)(
    'scopes cache metadata for %s by privilege and organization',
    (methodName, tags, expectedKey, user) => {
      const handler = Reflect.get(
        AnalyticsAdminController.prototype,
        methodName,
      ) as object;
      const cache = Reflect.getMetadata('cache', handler) as {
        keyGenerator: (request: {
          query: Record<string, string>;
          user: {
            id: string;
            isSuperAdmin?: boolean;
            organizationId?: string;
          };
        }) => string;
        tags: readonly string[];
        ttl: number;
      };

      expect(cache.tags).toEqual(tags);
      expect(cache.ttl).toBe(300);
      expect(
        cache.keyGenerator({
          query: {
            endDate: '2025-01-31',
            limit: '25',
            page: '2',
            sort: 'views',
            startDate: '2025-01-01',
          },
          user,
        }),
      ).toBe(expectedKey);
    },
  );

  it('isolates superadmin brand cache entries from customer keys', () => {
    const handler = Reflect.get(
      AnalyticsAdminController.prototype,
      'getBrandsLeaderboard',
    ) as object;
    const cache = Reflect.getMetadata('cache', handler) as {
      keyGenerator: (request: {
        query: Record<string, string>;
        user: { id: string; isSuperAdmin?: boolean; organizationId?: string };
      }) => string;
    };

    expect(
      cache.keyGenerator({
        query: {
          endDate: '2025-01-31',
          limit: '25',
          sort: 'views',
          startDate: '2025-01-01',
        },
        user: {
          id: 'user-1',
          isSuperAdmin: true,
          organizationId: 'org-1',
        },
      }),
    ).toBe(
      'analytics:brands-leaderboard:superadmin:all:2025-01-01:2025-01-31:views:25',
    );
  });

  it.each([
    [
      'getOverview',
      'analytics:overview:customer:org-1:2025-01-01:2025-01-31:brand-1',
    ],
    [
      'getPlatformComparison',
      'analytics:platforms:customer:org-1:2025-01-01:2025-01-31:brand-1',
    ],
    [
      'getGrowthTrends',
      'analytics:growth:customer:org-1:2025-01-01:2025-01-31:views:brand-1',
    ],
    [
      'getEngagement',
      'analytics:engagement:customer:org-1:2025-01-01:2025-01-31:brand-1:',
    ],
  ] as const)(
    'scopes customer %s cache keys by organization and privilege',
    (methodName, expectedKey) => {
      const handler = Reflect.get(
        AnalyticsController.prototype,
        methodName,
      ) as object;
      const cache = Reflect.getMetadata('cache', handler) as {
        keyGenerator: (request: {
          query: Record<string, string>;
          user: { organizationId?: string };
        }) => string;
      };

      expect(
        cache.keyGenerator({
          query: {
            brandId: 'brand-1',
            endDate: '2025-01-31',
            startDate: '2025-01-01',
          },
          user: { organizationId: 'org-1' },
        }),
      ).toBe(expectedKey);
    },
  );

  it('registers the focused controller before the remaining analytics routes', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AnalyticsModule),
    ).toEqual([AnalyticsAdminController, AnalyticsController]);
  });
});

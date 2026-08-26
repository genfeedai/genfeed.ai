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
    ['findAll', ['analytics', 'super-admin'], 'analytics:super-admin:user-1'],
    [
      'getOrganizationsLeaderboard',
      ['analytics', 'super-admin', 'leaderboard'],
      'analytics:leaderboard:2025-01-01:2025-01-31:views:25',
    ],
    [
      'getOrganizationsWithStats',
      ['analytics', 'super-admin', 'organizations'],
      'analytics:orgs:2025-01-01:2025-01-31:2:25:views',
    ],
    [
      'getBrandsLeaderboard',
      ['analytics', 'brands-leaderboard'],
      'analytics:brands-leaderboard:user-1:2025-01-01:2025-01-31:views:25',
    ],
    [
      'getBrandsWithStats',
      ['analytics', 'brands'],
      'analytics:brands:user-1:2025-01-01:2025-01-31:2:25:views',
    ],
  ] as const)(
    'preserves cache metadata for %s',
    (methodName, tags, expectedKey) => {
      const handler = Reflect.get(
        AnalyticsAdminController.prototype,
        methodName,
      ) as object;
      const cache = Reflect.getMetadata('cache', handler) as {
        keyGenerator: (request: {
          query: Record<string, string>;
          user: { id: string };
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
          user: { id: 'user-1' },
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

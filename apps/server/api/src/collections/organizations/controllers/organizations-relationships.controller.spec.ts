vi.mock('@api/helpers/utils/response/response.util', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@api/helpers/utils/response/response.util')
    >();
  return {
    ...actual,
    serializeCollection: (
      _req: unknown,
      _serializer: unknown,
      data: { docs: unknown[] },
    ) => ({ data: data.docs }),
    serializeSingle: (_req: unknown, _serializer: unknown, data: unknown) => ({
      data,
    }),
  };
});

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationsRelationshipsController } from '@api/collections/organizations/controllers/organizations-relationships.controller';
import type { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import type { AnalyticsAggregationService } from '@api/collections/posts/services/analytics-aggregation.service';
import { ANALYTICS_TENANT_FORBIDDEN } from '@api/endpoints/analytics/analytics-tenant-scope';
import {
  getTenantContext,
  runWithTenantContext,
} from '@libs/prisma/tenant-context';
import { ForbiddenException, HttpException } from '@nestjs/common';
import type { Request } from 'express';

const orgId = 'clorganizationrel0000000001';
const foreignOrgId = 'clorganizationforeign00000001';
const userId = 'cluserorgrel00000000000001';
const folderId = 'clfolderorgrel000000000001';
const user = {
  brandId: 'clbrandorgrel0000000000001',
  id: 'user_123',
  organizationId: orgId,
  userId,
} as unknown as User;
const superadmin = { ...user, isSuperAdmin: true } as unknown as User;
const request = {} as Request;

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

/** Prisma `where` over scalars, `AND`, `OR`, `{ is }` and insensitive `{ contains }`. */
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') {
      return (value as Where[]).every((clause) => matches(row, clause));
    }
    if (key === 'OR') {
      return (value as Where[]).some((clause) => matches(row, clause));
    }
    if (value !== null && typeof value === 'object') {
      const filter = value as Record<string, unknown>;
      if ('is' in filter) {
        const related = row[key] as Row | null | undefined;
        return !!related && matches(related, filter.is as Where);
      }
      if ('contains' in filter) {
        return String(row[key] ?? '')
          .toLowerCase()
          .includes(String(filter.contains).toLowerCase());
      }
    }
    return (row[key] ?? null) === value;
  });
}

interface World {
  brands?: Row[];
  credentials?: Row[];
  ingredients?: Row[];
  members?: Row[];
  organizations?: Row[];
}

/**
 * Members, organizations, brands, connected credentials and ingredients of
 * the platform, plus the analytics aggregation. Every aggregate read is
 * recorded with the tenant it ran under.
 */
function setup(world: World = {}) {
  const members = world.members ?? [];
  const organizations = world.organizations ?? [
    { id: orgId, userId: 'someone-else' },
  ];
  const brands = world.brands ?? [
    { id: 'brand-1', organizationId: orgId },
    { id: 'brand-foreign', organizationId: foreignOrgId },
  ];
  const credentials = world.credentials ?? [];
  const ingredients = world.ingredients ?? [];
  const reads: { method: string; organizationId?: string; tenant?: string }[] =
    [];
  const aggregate =
    (method: string, result: unknown) => async (organizationId: string) => {
      reads.push({
        method,
        organizationId,
        tenant: getTenantContext()?.organizationId,
      });
      return result;
    };
  const analytics = {
    assertBrandInScope: async (brandId: string | undefined, org: string) => {
      if (
        brandId &&
        !brands.some((b) => b.id === brandId && b.organizationId === org)
      ) {
        throw new ForbiddenException(ANALYTICS_TENANT_FORBIDDEN);
      }
    },
    getOverviewMetrics: aggregate('overview', {
      totalPosts: 2,
      totalViews: 40,
    }),
    getPlatformAnalytics: aggregate('platform', {
      totalPosts: 1,
      totalViews: 9,
    }),
    getPlatformComparison: aggregate('platforms', []),
    getTimeSeriesDataWithPlatforms: aggregate('timeseries', []),
    getTopPerformingContent: aggregate('top-content', []),
  };
  const credentialsService = {
    countConnected: async (org: string, brandId?: string) =>
      credentials.filter(
        (row) =>
          row.organizationId === org &&
          row.isConnected === true &&
          (!brandId || row.brandId === brandId),
      ).length,
  };
  const ingredientsService = {
    findAll: async ({ where }: { where: Where }) => ({
      docs: ingredients
        .filter((row) => matches(row, where))
        .map((row) => row.id),
    }),
  };
  const membersService = {
    count: async (where: Where) =>
      members.filter((row) => matches(row, where)).length,
    findOne: async (where: Where) =>
      members.find((row) => matches(row, where)) ?? null,
  };
  const organizationsService = {
    findOne: async (where: Where) =>
      organizations.find((row) => matches(row, where)) ?? null,
  };
  const controller = new OrganizationsRelationshipsController(
    analytics as unknown as AnalyticsAggregationService,
    credentialsService as unknown as CredentialsService,
    ingredientsService as unknown as IngredientsService,
    membersService as unknown as MembersService,
    organizationsService as unknown as OrganizationsService,
  );
  return { controller, reads };
}

const member = (overrides: Row = {}): Row => ({
  isActive: true,
  isDeleted: false,
  organizationId: orgId,
  userId,
  ...overrides,
});

const ingredient = (id: string, overrides: Row = {}): Row => ({
  category: 'video',
  folderId,
  id,
  isDeleted: false,
  metadata: { description: '', extension: 'mp4', label: 'Launch teaser' },
  organizationId: orgId,
  status: 'completed',
  ...overrides,
});

describe('OrganizationsRelationshipsController', () => {
  describe('findAllIngredients', () => {
    it('lets an organization owner without a membership row list matching ingredients', async () => {
      const { controller } = setup({
        ingredients: [
          ingredient('hit'),
          ingredient('description-hit', {
            metadata: {
              description: 'The LAUNCH cut',
              extension: 'mp4',
              label: 'Cut',
            },
          }),
          ingredient('other-format', {
            metadata: { extension: 'mov', label: 'Launch teaser' },
          }),
          ingredient('no-search-hit', {
            metadata: { description: '', extension: 'mp4', label: 'Recap' },
          }),
          ingredient('other-folder', {
            folderId: 'clfolderorgrel000000000002',
          }),
          ingredient('other-category', { category: 'image' }),
          ingredient('deleted', { isDeleted: true }),
          ingredient('other-org', { organizationId: foreignOrgId }),
        ],
        organizations: [{ id: orgId, userId }],
      });

      const result = await controller.findAllIngredients(request, orgId, user, {
        category: 'video',
        folderId,
        format: 'mp4',
        search: 'launch',
      } as never);

      expect(result).toEqual({ data: ['hit', 'description-hit'] });
    });

    it('refuses a caller who neither owns nor belongs to the organization', async () => {
      const { controller } = setup({ ingredients: [ingredient('hit')] });

      const failure = await controller
        .findAllIngredients(request, orgId, user, {} as never)
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(HttpException);
      expect((failure as HttpException).getStatus()).toBe(403);
    });
  });

  describe('findAnalytics', () => {
    it('reports overview metrics, connected credentials and active members', async () => {
      const { controller } = setup({
        credentials: [
          { brandId: 'brand-1', isConnected: true, organizationId: orgId },
          { brandId: 'brand-2', isConnected: true, organizationId: orgId },
          { brandId: 'brand-1', isConnected: true, organizationId: orgId },
          { brandId: 'brand-1', isConnected: false, organizationId: orgId },
          {
            brandId: 'brand-1',
            isConnected: true,
            organizationId: foreignOrgId,
          },
        ],
        members: [
          member(),
          member({ userId: 'member-2' }),
          member({ userId: 'member-3' }),
          member({ userId: 'member-4' }),
          member({ isActive: false, userId: 'inactive' }),
          member({ isDeleted: true, userId: 'removed' }),
          member({ organizationId: foreignOrgId, userId: 'elsewhere' }),
        ],
      });

      const result = await controller.findAnalytics(request, orgId, {}, user);

      // genfeedai/genfeed.ai#5426: the credential count is a real count.
      expect(result).toEqual({
        data: {
          totalCredentialsConnected: 3,
          totalPosts: 2,
          totalUsers: 4,
          totalViews: 40,
        },
      });
    });

    it('counts credentials only for the requested analytics brand', async () => {
      const { controller } = setup({
        credentials: [
          { brandId: 'brand-1', isConnected: true, organizationId: orgId },
          { brandId: 'brand-2', isConnected: true, organizationId: orgId },
        ],
        members: [member()],
      });

      const result = await controller.findAnalytics(
        request,
        orgId,
        { brandId: 'brand-1' },
        user,
      );

      expect(result.data).toMatchObject({ totalCredentialsConnected: 1 });
    });
  });

  describe('path organization tenant scope (CLOUD guard)', () => {
    it('reads another organization analytics under that organization, after proving access', async () => {
      const { controller, reads } = setup({ members: [member()] });

      await runWithTenantContext(
        { organizationId: 'clsessionorg00000000001' },
        () => controller.findAnalytics(request, orgId, {}, user),
      );

      expect(reads).toEqual([
        { method: 'overview', organizationId: orgId, tenant: orgId },
      ]);
    });

    it('still rejects a non-member of that organization before any aggregate runs', async () => {
      const { controller, reads } = setup();

      await expect(
        runWithTenantContext(
          { organizationId: 'clsessionorg00000000001' },
          () => controller.findAnalytics(request, foreignOrgId, {}, user),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(reads).toEqual([]);
    });
  });

  describe('analytics tenant isolation', () => {
    it('rejects another organization without aggregating', async () => {
      const { controller, reads } = setup();

      await expect(
        controller.findAnalytics(request, foreignOrgId, {}, user),
      ).rejects.toEqual(new ForbiddenException(ANALYTICS_TENANT_FORBIDDEN));
      expect(reads).toEqual([]);
    });

    it('rejects a brand that does not belong to the authorized organization', async () => {
      const { controller, reads } = setup({ members: [member()] });

      await expect(
        controller.findAnalytics(
          request,
          orgId,
          { brandId: 'brand-foreign' },
          user,
        ),
      ).rejects.toEqual(new ForbiddenException(ANALYTICS_TENANT_FORBIDDEN));
      expect(reads).toEqual([]);
    });

    it.each([
      'findAnalyticsTimeSeries',
      'findAnalyticsPlatforms',
      'findAnalyticsTopContent',
    ] as const)(
      'authorizes %s before reading analytics',
      async (methodName) => {
        const { controller, reads } = setup();

        await expect(
          controller[methodName](request, orgId, {}, user),
        ).rejects.toEqual(new ForbiddenException(ANALYTICS_TENANT_FORBIDDEN));
        expect(reads).toEqual([]);
      },
    );

    it('refuses top content to a superadmin outside the organization', async () => {
      const { controller, reads } = setup();

      await expect(
        controller.findAnalyticsTopContent(
          request,
          foreignOrgId,
          {},
          superadmin,
        ),
      ).rejects.toEqual(new ForbiddenException(ANALYTICS_TENANT_FORBIDDEN));
      expect(reads).toEqual([]);
    });

    it('still lets a superadmin read another organization aggregate overview', async () => {
      const { controller, reads } = setup();

      await expect(
        controller.findAnalytics(request, foreignOrgId, {}, superadmin),
      ).resolves.toMatchObject({ data: { totalPosts: 2 } });
      expect(reads).toEqual([
        {
          method: 'overview',
          organizationId: foreignOrgId,
          tenant: foreignOrgId,
        },
      ]);
    });

    it('authorizes platform analytics before reading', async () => {
      const { controller, reads } = setup();

      await expect(
        controller.findPlatformAnalytics(request, orgId, 'instagram', {}, user),
      ).rejects.toEqual(new ForbiddenException(ANALYTICS_TENANT_FORBIDDEN));
      expect(reads).toEqual([]);
    });

    it('returns platform analytics to a member, labelled with the platform', async () => {
      const { controller } = setup({ members: [member()] });

      await expect(
        controller.findPlatformAnalytics(request, orgId, 'instagram', {}, user),
      ).resolves.toEqual({
        data: { platform: 'instagram', totalPosts: 1, totalViews: 9 },
      });
    });
  });
});

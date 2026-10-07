import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { BrandedGenerationReceiptsController } from '@api/collections/branded-generation-receipts/controllers/branded-generation-receipts.controller';
import { BrandFontAssetsController } from '@api/collections/brands/controllers/brand-font-assets.controller';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { ContentPlanItemsService } from '@api/collections/content-plan-items/services/content-plan-items.service';
import { ContentPlansService } from '@api/collections/content-plans/services/content-plans.service';
import { TENANT_READ_AUTOMATION_ROUTES } from '@api/collections/contexts/utils/tenant-read-automation.registry';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { TENANT_READ_ACCOUNT_ROUTES } from '@api/collections/imported-sources/tenant-read-account.registry';
import { MembersService } from '@api/collections/members/services/members.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { TrendsController } from '@api/collections/trends/controllers/trends.controller';
import { TrendPreferencesService } from '@api/collections/trends/services/trend-preferences.service';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import { TENANT_READ_CONTENT_ROUTES } from '@api/collections/videos/tenant-read-content.registry';
import { VisualProjectsController } from '@api/collections/visual-projects/controllers/visual-projects.controller';
import { AdsResearchController } from '@api/endpoints/ads-research/ads-research.controller';
import { TenantContextInterceptor } from '@api/helpers/interceptors/tenant-context/tenant-context.interceptor';
import { TENANT_READ_POLICY } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { getTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import { BrandOsExportController } from '@api/services/brand-os-export/brand-os-export.controller';
import { ContentEngineController } from '@api/services/content-engine/content-engine.controller';
import { ContentPlanSeedsService } from '@api/services/content-engine/content-plan-seeds.service';
import { ContentPlannerService } from '@api/services/content-engine/content-planner.service';
import { testId } from '@helpers/testing/test-id.helper';
import { getTenantContext } from '@libs/prisma/tenant-context';
import { type ExecutionContext, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModuleRef, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { defer, firstValueFrom, of } from 'rxjs';

const residualRoutes = [
  {
    controller: ContentEngineController,
    handler: 'getPlanSeeds',
    route: '/v1/brands/{brandId}/content/plans/seeds',
    policy: 'selected',
  },
  {
    controller: BrandFontAssetsController,
    handler: 'list',
    route: '/v1/brands/{brandId}/font-assets',
    policy: 'owner',
  },
  {
    controller: BrandedGenerationReceiptsController,
    handler: 'get',
    route: '/v1/brands/{brandId}/generation-receipts/{receiptId}',
    policy: 'owner',
  },
  {
    controller: BrandedGenerationReceiptsController,
    handler: 'getRevision',
    route:
      '/v1/brands/{brandId}/generation-receipts/{receiptId}/revisions/{revision}',
    policy: 'owner',
  },
  {
    controller: BrandedGenerationReceiptsController,
    handler: 'readPrompt',
    route:
      '/v1/brands/{brandId}/generation-receipts/{receiptId}/prompts/{stage}',
    policy: 'owner',
  },
  {
    controller: BrandOsExportController,
    handler: 'download',
    route: '/v1/brands/{id}/brand-os/design.md',
    policy: 'owner',
  },
  {
    controller: TrendsController,
    handler: 'getPreferences',
    route: '/v1/trends/preferences',
    policy: 'selected',
  },
  {
    controller: VisualProjectsController,
    handler: 'source',
    route: '/v1/visual-projects/{id}/revisions/{number}/source',
    policy: 'owner',
  },
  {
    controller: AdsResearchController,
    handler: 'getAdDetail',
    route: '/v1/ads/research/{source}/{id}',
    policy: 'owner',
  },
] as const;
const originalRoutes = [
  ...TENANT_READ_ACCOUNT_ROUTES,
  ...TENANT_READ_AUTOMATION_ROUTES,
  ...TENANT_READ_CONTENT_ROUTES,
];
const actor: AuthenticatedUser = {
  id: testId('user'),
  userId: testId('user'),
  organizationId: testId('org'),
  brandId: testId('brand'),
  isSuperAdmin: true,
};
const foreignOrg = testId('org', 2),
  foreignBrand = testId('brand', 2);
const routeBrand = testId('brand', 3);
const interceptor = new TenantContextInterceptor(new Reflector());
function actualHandler(controller: { prototype: object }, property: string) {
  const handler: unknown = Reflect.get(controller.prototype, property);
  if (typeof handler !== 'function')
    throw new Error('Missing residual handler');
  return handler;
}
function paths(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value) && value.every((part) => typeof part === 'string'))
    return value;
  throw new Error('Missing residual route metadata');
}
function canonicalRoutes(controller: { prototype: object }, handler: object) {
  return paths(Reflect.getMetadata(PATH_METADATA, controller)).flatMap(
    (prefix) =>
      paths(Reflect.getMetadata(PATH_METADATA, handler)).map((path) =>
        `/v1/${[prefix, path]
          .map((part) => part.replace(/^\/+|\/+$/g, ''))
          .filter(Boolean)
          .join('/')}`.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '{$1}'),
      ),
  );
}
function request(query: Record<string, string>, user = actor) {
  return { method: 'GET', query, user, context: { ...user } };
}
function execution(
  req: ReturnType<typeof request>,
  controller: { prototype: object },
  handler: object,
): ExecutionContext {
  return {
    getClass: () => controller,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('nine independent residual tenant read policies', () => {
  it('keeps nine distinct source routes disjoint from the unchanged original248 ledger', () => {
    expect(originalRoutes).toHaveLength(248);
    expect(new Set(originalRoutes.map((entry) => entry.controller)).size).toBe(
      126,
    );
    expect(
      new Set(
        originalRoutes.map((entry) =>
          entry.route.split('/').slice(0, 3).join('/'),
        ),
      ).size,
    ).toBe(74);
    expect(residualRoutes).toHaveLength(9);
    expect(new Set(residualRoutes.map((entry) => entry.route)).size).toBe(9);
    expect(
      residualRoutes.filter((entry) => entry.policy === 'selected'),
    ).toHaveLength(2);
    expect(
      residualRoutes.filter((entry) => entry.policy === 'owner'),
    ).toHaveLength(7);
    const originalTemplates = new Set<string>(
      originalRoutes.map((entry) => entry.route),
    );
    for (const entry of residualRoutes)
      expect(originalTemplates.has(entry.route)).toBe(false);
  });
  it.each(residualRoutes)(
    '$route has exact actual GET metadata and $policy policy',
    (entry) => {
      const handler = actualHandler(entry.controller, entry.handler);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.GET,
      );
      expect(canonicalRoutes(entry.controller, handler)).toEqual([entry.route]);
      expect(Reflect.getMetadata(TENANT_READ_POLICY, handler)).toBe(
        entry.policy,
      );
    },
  );
  it.each(residualRoutes.filter((entry) => entry.policy === 'owner'))(
    '$route refuses foreign override before downstream but retains no/equal owner identity',
    async (entry) => {
      const handler = actualHandler(entry.controller, entry.handler);
      const req = request({ organizationId: foreignOrg });
      const originalContext = { ...req.context };
      const handle = vi.fn(() =>
        defer(() => {
          expect(getTenantContext()?.organizationId).toBe(actor.organizationId);
          expect(getTenantReadScope()).toBeUndefined();
          expect(req.user).toBe(actor);
          expect(req.context).toEqual(originalContext);
          return of('original-owner-path');
        }),
      );
      expect(() =>
        interceptor.intercept(execution(req, entry.controller, handler), {
          handle,
        }),
      ).toThrow(expect.objectContaining({ status: 403 }));
      expect(handle).not.toHaveBeenCalled();
      const queries: Array<Record<string, string>> = [
        {},
        { organizationId: actor.organizationId },
      ];
      for (const query of queries) {
        req.query = query;
        await expect(
          firstValueFrom(
            interceptor.intercept(execution(req, entry.controller, handler), {
              handle,
            }),
          ),
        ).resolves.toBe('original-owner-path');
      }
      expect(handle).toHaveBeenCalledTimes(2);
      expect(req.user).toBe(actor);
      expect(req.context).toEqual(originalContext);
    },
  );
});

async function controllers() {
  const preview: Awaited<ReturnType<ContentPlanSeedsService['buildPreview']>> =
    {
      advertisers: [],
      sources: [],
      patternCount: 0,
      importedPostCount: 0,
      isColdStart: true,
      dataset: {
        confidence: 'none',
        genfeedPosts: 0,
        importedPosts: 0,
        totalPosts: 0,
      },
    };
  const buildPreview = vi
    .fn<ContentPlanSeedsService['buildPreview']>()
    .mockResolvedValue(preview);
  const getPreferences = vi
    .fn<TrendPreferencesService['getPreferences']>()
    .mockResolvedValue(null);
  const module = await Test.createTestingModule({
    providers: [
      {
        provide: ContentEngineController,
        inject: [
          ContentPlannerService,
          ContentPlansService,
          ContentPlanItemsService,
          ContentPlanSeedsService,
          ModuleRef,
        ],
        useFactory: (
          ...dependencies: ConstructorParameters<typeof ContentEngineController>
        ) => new ContentEngineController(...dependencies),
      },
      {
        provide: TrendsController,
        inject: [
          TrendsService,
          TrendPreferencesService,
          CreditsUtilsService,
          ModelsService,
          BrandsService,
          MembersService,
          ApiKeysService,
        ],
        useFactory: (
          ...dependencies: ConstructorParameters<typeof TrendsController>
        ) => new TrendsController(...dependencies),
      },
      { provide: ContentPlanSeedsService, useValue: { buildPreview } },
      { provide: TrendPreferencesService, useValue: { getPreferences } },
      ...[
        ContentPlannerService,
        ContentPlansService,
        ContentPlanItemsService,
        TrendsService,
        CreditsUtilsService,
        ModelsService,
        BrandsService,
        MembersService,
        ApiKeysService,
        ModuleRef,
      ].map((provide) => ({ provide, useValue: {} })),
    ],
  }).compile();
  return {
    seed: module.get(ContentEngineController),
    preferences: module.get(TrendsController),
    buildPreview,
    getPreferences,
    preview,
    close: () => module.close(),
  };
}
const selections: Array<{
  query: Record<string, string>;
  org: string;
  brand: string | undefined;
}> = [
  { query: {}, org: actor.organizationId, brand: actor.brandId },
  {
    query: { organizationId: actor.organizationId },
    org: actor.organizationId,
    brand: actor.brandId,
  },
  { query: { organizationId: foreignOrg }, org: foreignOrg, brand: undefined },
  {
    query: { organizationId: foreignOrg, brandId: foreignBrand },
    org: foreignOrg,
    brand: foreignBrand,
  },
  {
    query: { brandId: foreignBrand },
    org: actor.organizationId,
    brand: foreignBrand,
  },
];
const selectedRoutes = residualRoutes.filter(
  (entry) => entry.policy === 'selected',
);
describe.each(selectedRoutes)('$route actual selected method', (entry) => {
  it.each(selections)(
    'binds selected data to both read and Prisma ALS for $query',
    async ({ query, org, brand }) => {
      const f = await controllers();
      try {
        const req = request(query),
          originalContext = { ...req.context };
        const invoke = () =>
          entry.handler === 'getPlanSeeds'
            ? f.seed.getPlanSeeds(actor, routeBrand)
            : f.preferences.getPreferences(actor);
        const assertScope = async () => {
          await Promise.resolve();
          expect(getTenantContext()?.organizationId).toBe(org);
          expect(getTenantReadScope()?.organizationId).toBe(org);
          expect(getTenantReadScope()?.brandId).toBe(brand);
        };
        f.buildPreview.mockImplementation(async (organizationId, brandId) => {
          await assertScope();
          expect(organizationId).toBe(org);
          expect(brandId).toBe(routeBrand);
          return f.preview;
        });
        f.getPreferences.mockImplementation(async (organizationId, brandId) => {
          await assertScope();
          expect(organizationId).toBe(org);
          expect(brandId).toBe(brand);
          return null;
        });
        const handle = vi.fn(() => defer(invoke));
        await expect(
          firstValueFrom(
            interceptor.intercept(
              execution(
                req,
                entry.controller,
                actualHandler(entry.controller, entry.handler),
              ),
              { handle },
            ),
          ),
        ).resolves.toEqual(
          entry.handler === 'getPlanSeeds' ? f.preview : { preferences: null },
        );
        if (entry.handler === 'getPlanSeeds') {
          expect(f.buildPreview).toHaveBeenCalledWith(org, routeBrand);
          expect(f.getPreferences).not.toHaveBeenCalled();
        } else {
          expect(f.getPreferences).toHaveBeenCalledWith(org, brand);
          expect(f.buildPreview).not.toHaveBeenCalled();
        }
        expect(req.user).toBe(actor);
        expect(req.context).toEqual(originalContext);
      } finally {
        await f.close();
      }
    },
  );
  it.each([false, true])(
    'rejects foreign selection for member/IP-bound false key (%s) before downstream',
    (isApiKey) => {
      const user: AuthenticatedUser = {
        ...actor,
        isSuperAdmin: false,
        isApiKey,
      };
      const req = request({ organizationId: foreignOrg }, user);
      const handle = vi.fn(() => of('must-not-dispatch'));
      expect(() =>
        interceptor.intercept(
          execution(
            req,
            entry.controller,
            actualHandler(entry.controller, entry.handler),
          ),
          { handle },
        ),
      ).toThrow(expect.objectContaining({ status: 403 }));
      expect(handle).not.toHaveBeenCalled();
      expect(req.user).toBe(user);
    },
  );
  it('separates concurrent original and selected contexts without identity mutation', async () => {
    const f = await controllers();
    try {
      const reads: Array<[string, string | undefined]> = [];
      const read = async (
        organizationId: string,
        brandId: string | undefined,
      ) => {
        await Promise.resolve();
        expect(getTenantContext()?.organizationId).toBe(organizationId);
        expect(getTenantReadScope()?.organizationId).toBe(organizationId);
        reads.push([organizationId, brandId]);
      };
      f.buildPreview.mockImplementation(async (org, brand) => {
        await read(org, brand);
        return f.preview;
      });
      f.getPreferences.mockImplementation(async (org, brand) => {
        await read(org, brand);
        return null;
      });
      const queries: Array<Record<string, string>> = [
        {},
        { organizationId: foreignOrg, brandId: foreignBrand },
      ];
      await Promise.all(
        queries.map((query) => {
          const req = request(query);
          return firstValueFrom(
            interceptor.intercept(
              execution(
                req,
                entry.controller,
                actualHandler(entry.controller, entry.handler),
              ),
              {
                handle: () =>
                  defer(() =>
                    entry.handler === 'getPlanSeeds'
                      ? f.seed.getPlanSeeds(actor, routeBrand)
                      : f.preferences.getPreferences(actor),
                  ),
              },
            ),
          );
        }),
      );
      expect(reads).toEqual(
        expect.arrayContaining([
          [
            actor.organizationId,
            entry.handler === 'getPlanSeeds' ? routeBrand : actor.brandId,
          ],
          [
            foreignOrg,
            entry.handler === 'getPlanSeeds' ? routeBrand : foreignBrand,
          ],
        ]),
      );
      expect(actor.organizationId).toBe(testId('org'));
      expect(actor.brandId).toBe(testId('brand'));
    } finally {
      await f.close();
    }
  });
});

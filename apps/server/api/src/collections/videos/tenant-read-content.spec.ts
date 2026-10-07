import 'reflect-metadata';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ArticlesTrafficController } from '@api/collections/articles/controllers/articles-traffic.controller';
import { FontFamiliesController } from '@api/collections/font-families/controllers/font-families.controller';
import { PresetsController } from '@api/collections/presets/controllers/presets.controller';
import { PresetsQueryDto } from '@api/collections/presets/dto/presets-query.dto';
import { SavedAdsController } from '@api/collections/saved-ads/controllers/saved-ads.controller';
import { TENANT_READ_CONTENT_ROUTES } from '@api/collections/videos/tenant-read-content.registry';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { TenantContextInterceptor } from '@api/helpers/interceptors/tenant-context/tenant-context.interceptor';
import { runWithTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import { testId } from '@helpers/testing/test-id.helper';
import type { ExecutionContext } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { defer, firstValueFrom, from, of } from 'rxjs';

const originalOrg = testId('org');
const selectedOrg = testId('org', 2);
const selectedBrand = testId('brand', 2);
const actor: AuthenticatedUser = {
  id: testId('user'),
  userId: testId('user'),
  organizationId: originalOrg,
  brandId: testId('brand'),
  isSuperAdmin: true,
};
const selected = {
  organizationId: selectedOrg,
  brandId: selectedBrand,
  isOrganizationOverride: true,
};
function context(
  request: Record<string, unknown>,
  handler: (...args: never[]) => unknown,
): ExecutionContext {
  return {
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
function handlerFor(
  entry: (typeof TENANT_READ_CONTENT_ROUTES)[number],
): (...args: never[]) => unknown {
  return Reflect.get(entry.controller.prototype, entry.handler) as (
    ...args: never[]
  ) => unknown;
}
describe('content tenant read ledger', () => {
  it('accounts for all 133 actual canonical aliases across 69 controllers', () => {
    expect(TENANT_READ_CONTENT_ROUTES).toHaveLength(133);
    expect(new Set(TENANT_READ_CONTENT_ROUTES.map((e) => e.route)).size).toBe(
      133,
    );
    expect(
      new Set(TENANT_READ_CONTENT_ROUTES.map((e) => e.controller)).size,
    ).toBe(69);
    for (const entry of TENANT_READ_CONTENT_ROUTES) {
      const handler = handlerFor(entry);
      expect(Reflect.getMetadata('genfeed.tenantReadPolicy', handler)).toBe(
        entry.policy,
      );
      const bases = [
        Reflect.getMetadata(PATH_METADATA, entry.controller),
      ].flat();
      const paths = [Reflect.getMetadata(PATH_METADATA, handler)].flat();
      const aliases = bases.flatMap((base) =>
        paths.map((path) =>
          `/v1/${[base, path]
            .map((segment) => String(segment).replace(/^\/+|\/+$/g, ''))
            .filter(Boolean)
            .join('/')}`.replace(/:([\w]+)/g, '{$1}'),
        ),
      );
      expect(aliases).toContain(entry.route);
    }
  });
  for (const entry of TENANT_READ_CONTENT_ROUTES.filter(
    (e) => e.policy !== 'selected',
  )) {
    it(`${entry.controller.name}.${entry.handler} refuses foreign selection before the actual handler`, () => {
      const next = { handle: vi.fn(() => of('called')) };
      expect(() =>
        new TenantContextInterceptor().intercept(
          context(
            {
              method: 'GET',
              user: actor,
              query: { organizationId: selectedOrg },
            },
            handlerFor(entry),
          ),
          next,
        ),
      ).toThrow(expect.objectContaining({ status: 403 }));
      expect(next.handle).not.toHaveBeenCalled();
    });
    it(`${entry.controller.name}.${entry.handler} retains absent/equal handler dispatch`, async () => {
      for (const query of [{}, { organizationId: originalOrg }]) {
        const next = { handle: vi.fn(() => of('original-handler')) };
        await expect(
          firstValueFrom(
            new TenantContextInterceptor().intercept(
              context({ method: 'GET', user: actor, query }, handlerFor(entry)),
              next,
            ),
          ),
        ).resolves.toBe('original-handler');
        expect(next.handle).toHaveBeenCalledOnce();
      }
    });
  }
});
describe('content selected data arguments', () => {
  it('ArticleTraffic returns selected rows and retains the real actor through the interceptor', async () => {
    const rows = [
      { organizationId: originalOrg, label: 'original' },
      { organizationId: selectedOrg, label: 'selected' },
    ];
    const service = {
      getTraffic: vi.fn(
        (input: { organizationId: string; userId: string; brandId?: string }) =>
          Promise.resolve(
            rows.filter((row) => row.organizationId === input.organizationId),
          ),
      ),
    };
    const controller = new ArticlesTrafficController(service as never);
    const user = { ...actor };
    const hydrated = { organizationId: originalOrg, brandId: actor.brandId };
    const request = {
      method: 'GET',
      user,
      context: hydrated,
      query: { organizationId: selectedOrg, brandId: selectedBrand },
    };
    const data = await firstValueFrom(
      new TenantContextInterceptor().intercept(
        context(request, ArticlesTrafficController.prototype.getTraffic),
        {
          handle: () =>
            defer(() =>
              from(
                controller.getTraffic(user, testId('article'), {
                  period: '30d',
                }),
              ),
            ),
        },
      ),
    );
    expect(data).toEqual([rows[1]]);
    expect(service.getTraffic).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: selectedOrg,
        brandId: selectedBrand,
        userId: actor.userId,
      }),
    );
    expect(request.user).toBe(user);
    expect(request.context).toBe(hydrated);
    expect(user).toEqual(actor);
  });
  it.each(
    [FontFamiliesController, PresetsController].map((ControllerClass) => ({
      ControllerClass,
      label: ControllerClass.name,
    })),
  )(
    'inherited $label filters keep global and selected rows',
    ({ ControllerClass }) => {
      const instance = new ControllerClass({} as never, {} as never);
      const query = runWithTenantReadScope(selected, () =>
        instance.buildFindAllQuery(actor, new PresetsQueryDto()),
      );
      const rows = [
        { organizationId: null, label: 'global' },
        { organizationId: originalOrg, label: 'original' },
        { organizationId: selectedOrg, label: 'selected' },
      ];
      const conditions = query.where.OR as Array<{
        organizationId: string | null;
      }>;
      expect(
        rows
          .filter((row) =>
            conditions.some((c) => c.organizationId === row.organizationId),
          )
          .map((r) => r.label),
      ).toEqual(['global', 'selected']);
      expect(Object.hasOwn(ControllerClass.prototype, 'findAll')).toBe(true);
    },
  );
});

// Controller/service doubles contain two tenant datasets and never instantiate
// providers or Prisma clients. Serialization remains an independent boundary.
vi.mock('@api/helpers/utils/response/response.util', async (original) => {
  const actual =
    await original<
      typeof import('@api/helpers/utils/response/response.util')
    >();
  return {
    ...actual,
    serializeSingle: (
      _request: unknown,
      _serializer: unknown,
      data: unknown,
    ) => ({ data }),
    serializeCollection: (
      _request: unknown,
      _serializer: unknown,
      page: { docs?: unknown },
    ) => ({ data: page.docs }),
  };
});

import { ContentLearningController } from '@api/collections/content-learning/controllers/content-learning.controller';
import { RemotionCompositionsController } from '@api/collections/editor-projects/remotion-compositions.controller';
import { ImagesController } from '@api/collections/images/controllers/images.controller';
import { OutreachCampaignTargetsController } from '@api/collections/outreach-campaigns/controllers/outreach-campaign-targets.controller';
import { OutreachCampaignTargetOperationsService } from '@api/collections/outreach-campaigns/services/outreach-campaign-target-operations.service';
import { TrendsController } from '@api/collections/trends/controllers/trends.controller';
import { TrendsAnalyticsController } from '@api/collections/trends/controllers/trends-analytics.controller';
import { TrendsDiscoveryController } from '@api/collections/trends/controllers/trends-discovery.controller';
import { VideosCaptionsController } from '@api/collections/videos/controllers/captions/videos-captions.controller';
import { VideosController } from '@api/collections/videos/controllers/videos.controller';
import { VideoProvenanceService } from '@api/collections/videos/services/video-provenance.service';
import { VisualProjectsController } from '@api/collections/visual-projects/controllers/visual-projects.controller';
import { AdsResearchController } from '@api/endpoints/ads-research/ads-research.controller';
import { FacebookController } from '@api/services/integrations/facebook/controllers/facebook.controller';
import { GoogleAdsController } from '@api/services/integrations/google-ads/controllers/google-ads.controller';
import { GoogleSearchConsoleController } from '@api/services/integrations/google-search-console/controllers/google-search-console.controller';
import { MetaAdsController } from '@api/services/integrations/meta-ads/controllers/meta-ads.controller';
import { DesktopSyncController } from '@api/services/sync/desktop-sync.controller';
import { DesktopSyncService } from '@api/services/sync/desktop-sync.service';
import { encodeManifestCursor } from '@api/services/sync/desktop-sync-cursor.util';
import { SyncController } from '@api/services/sync/sync.controller';
import { SyncService } from '@api/services/sync/sync.service';
import type { CacheConfig } from '@api/shared/interfaces/cache/cache.interfaces';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import type { Request } from 'express';

const request = { user: actor, query: {}, params: {} } as unknown as Request;
function instance<T extends object>(
  prototype: T,
  dependencies: Record<string, unknown>,
): T {
  return Object.assign(Object.create(prototype) as T, dependencies);
}
function selectedRead<T>(work: () => T): T {
  return runWithTenantReadScope(selected, () =>
    runWithTenantContext({ organizationId: selectedOrg }, work),
  );
}
const tenantRows = [
  {
    id: testId('ingredient'),
    organizationId: originalOrg,
    brandId: actor.brandId,
    label: 'original',
  },
  {
    id: testId('ingredient', 2),
    organizationId: selectedOrg,
    brandId: selectedBrand,
    label: 'selected',
  },
];
function orgRows(organizationId: string) {
  return tenantRows.filter((row) => row.organizationId === organizationId);
}
const logger = { debug: vi.fn(), log: vi.fn(), error: vi.fn() };

describe('content mandatory selected-data regressions', () => {
  it('AdsResearch passes selected organization and authorized explicit brand, clears inherited brand', async () => {
    const service = {
      listAds: vi.fn((organizationId: string, filters: { brandId?: string }) =>
        Promise.resolve(
          orgRows(organizationId).filter(
            (row) => !filters.brandId || row.brandId === filters.brandId,
          ),
        ),
      ),
    };
    const c = new AdsResearchController(
      service as never,
      {} as never,
      {} as never,
    );
    expect(await selectedRead(() => c.listAds(actor, selectedBrand))).toEqual([
      tenantRows[1],
    ]);
    expect(service.listAds).toHaveBeenLastCalledWith(
      selectedOrg,
      expect.objectContaining({ brandId: selectedBrand }),
    );
    const noBrand = {
      organizationId: selectedOrg,
      isOrganizationOverride: true,
    };
    await runWithTenantReadScope(noBrand, () => c.listAds(actor));
    expect(service.listAds).toHaveBeenLastCalledWith(
      selectedOrg,
      expect.objectContaining({ brandId: undefined }),
    );
    await expect(
      selectedRead(() => c.listAds(actor, 'invalid')),
    ).rejects.toThrow();
  });
  it('video reads and related evaluation use selected data while votes retain original actor', async () => {
    const video = {
      ...tenantRows[1],
      metadata: { label: 'selected metadata' },
      captions: [{ content: 'selected captions' }],
    };
    const videosService = {
      findAll: vi.fn((input: { where: { organizationId: string } }) =>
        Promise.resolve({ docs: orgRows(input.where.organizationId) }),
      ),
      findOne: vi.fn((where: { organizationId: string }) =>
        Promise.resolve(
          where.organizationId === selectedOrg ? video : tenantRows[0],
        ),
      ),
    };
    const votesService = {
      findOne: vi.fn().mockResolvedValue({ userId: actor.userId }),
    };
    const evaluationProjection = {
      attachToItem: vi.fn(
        (row: Record<string, unknown>, scope: { brandId?: string }) =>
          Promise.resolve({
            ...row,
            latestEvaluation:
              scope.brandId === selectedBrand
                ? 'selected evaluation'
                : 'original evaluation',
          }),
      ),
    };
    const c = instance(VideosController.prototype, {
      videosService,
      votesService,
      evaluationProjection,
    });
    const data = await selectedRead(() =>
      c.findOne(request as never, video.id, actor),
    );
    expect(data).toEqual({
      data: expect.objectContaining({
        organizationId: selectedOrg,
        hasVoted: true,
        metadata: video.metadata,
        captions: video.captions,
        latestEvaluation: 'selected evaluation',
      }),
    });
    expect(votesService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ userId: actor.userId }),
    );
    expect(videosService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: selectedOrg }),
      expect.arrayContaining([
        {
          path: 'metadata',
          where: { organizationId: selectedOrg, isDeleted: false },
        },
        {
          path: 'captions',
          where: { organizationId: selectedOrg, isDeleted: false },
        },
      ]),
    );
    expect(evaluationProjection.attachToItem).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: selectedOrg }),
      { brandId: selectedBrand, contentType: 'video' },
    );
  });
  it('image default visibility keeps selected/global arms and actor vote identity', async () => {
    const findOne = vi.fn().mockResolvedValue(tenantRows[1]);
    const votesService = { findOne: vi.fn().mockResolvedValue(null) };
    const evaluationProjection = {
      attachToItem: vi.fn((row: unknown) => Promise.resolve(row)),
    };
    const c = instance(ImagesController.prototype, {
      imagesService: { findOne },
      votesService,
      evaluationProjection,
    });
    await selectedRead(() => c.findOne(request, tenantRows[1].id, actor));
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        OR: [
          { organizationId: selectedOrg },
          { isDefault: true, organizationId: null },
        ],
      }),
      expect.any(Array),
    );
    expect(votesService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: actor.userId,
        organizationId: selectedOrg,
      }),
    );
    expect(evaluationProjection.attachToItem).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: selectedOrg }),
      { brandId: selectedBrand, contentType: 'image' },
    );
  });
  it('captions return only selected children after selected resource check', async () => {
    const children = [
      { organizationId: originalOrg, content: 'original' },
      { organizationId: selectedOrg, content: 'selected' },
    ];
    const videosService = {
      findOne: vi.fn((where: { organizationId: string }) =>
        Promise.resolve(orgRows(where.organizationId)[0]),
      ),
    };
    const captionsService = {
      findAll: vi.fn((input: { where: { organizationId: string } }) =>
        Promise.resolve({
          docs: children.filter(
            (c) => c.organizationId === input.where.organizationId,
          ),
        }),
      ),
    };
    const c = instance(VideosCaptionsController.prototype, {
      videosService,
      captionsService,
    });
    expect(
      await selectedRead(() =>
        c.getCaptions(request, actor, tenantRows[1].id, new BaseQueryDto()),
      ),
    ).toEqual({ data: [children[1]] });
    expect(videosService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: selectedOrg }),
    );
    expect(captionsService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ingredientId: tenantRows[1].id,
          isDeleted: false,
          organizationId: selectedOrg,
        },
      }),
      expect.any(Object),
    );
  });
  it.each([
    VideosController.prototype.findOne,
    VideosCaptionsController.prototype.getCaptions,
  ])(
    'video and caption cache namespaces separate selected organizations before ALS',
    (handler) => {
      const config = Reflect.getMetadata('cache', handler) as CacheConfig;
      const base = {
        user: actor,
        context: { organizationId: originalOrg, isSuperAdmin: true },
        params: { videoId: tenantRows[1].id },
        query: {},
      };
      const ownKey = config.keyGenerator?.(base as never);
      const selectedKey = config.keyGenerator?.({
        ...base,
        query: { organizationId: selectedOrg },
      } as never);
      expect(ownKey).toContain(originalOrg);
      expect(selectedKey).toContain(selectedOrg);
      expect(ownKey).not.toBe(selectedKey);
      expect(config.ttl).toBe(
        handler === VideosController.prototype.findOne ? 900 : 300,
      );
      expect(base.user).toBe(actor);
    },
  );
  it('outreach GET supplies selected scope and default/write helper retains original data scope', async () => {
    const outreachCampaignsService = {
      findOneById: vi.fn((_id: string, org: string) =>
        Promise.resolve(orgRows(org)[0]),
      ),
    };
    const campaignTargetsService = {
      findByCampaign: vi.fn((_id: string, org: string) =>
        Promise.resolve(orgRows(org)),
      ),
    };
    const service = new OutreachCampaignTargetOperationsService(
      campaignTargetsService as never,
      {} as never,
      {} as never,
      outreachCampaignsService as never,
    );
    const c = instance(OutreachCampaignTargetsController.prototype, {
      targetOperationsService: service,
    });
    expect(
      await selectedRead(() => c.getTargets(testId('campaign'), actor)),
    ).toEqual([tenantRows[1]]);
    expect(outreachCampaignsService.findOneById).toHaveBeenLastCalledWith(
      testId('campaign'),
      selectedOrg,
      selectedBrand,
    );
    expect(
      await selectedRead(() => service.getTargets(testId('campaign'), actor)),
    ).toEqual([tenantRows[0]]);
    expect(outreachCampaignsService.findOneById).toHaveBeenLastCalledWith(
      testId('campaign'),
      originalOrg,
      actor.brandId,
    );
    await expect(
      selectedRead(() =>
        service.addTargets(testId('campaign'), actor, {} as never),
      ),
    ).rejects.toThrow();
    expect(outreachCampaignsService.findOneById).toHaveBeenLastCalledWith(
      testId('campaign'),
      originalOrg,
      actor.brandId,
    );
  });
  it('desktop manifest selects target rows, clears inherited brand, retains cursor tombstones and default scope', async () => {
    const timestamp = new Date('2026-01-02T00:00:00.000Z');
    const deleted = { ...tenantRows[1], isDeleted: true, updatedAt: timestamp };
    const findMany = vi.fn(
      (input: { where: { organizationId?: string; parentOrgId?: string } }) =>
        Promise.resolve(
          (input.where.organizationId ?? input.where.parentOrgId) ===
            selectedOrg
            ? [deleted]
            : [{ ...tenantRows[0], updatedAt: timestamp }],
        ),
    );
    const prisma = {
      organization: {
        findFirst: vi.fn().mockResolvedValue({ id: selectedOrg }),
      },
      brand: { findMany },
      ingredient: { findMany },
      asset: { findMany },
    };
    const service = new DesktopSyncService({} as never, prisma as never);
    const c = instance(DesktopSyncController.prototype, {
      desktopSyncService: service,
    });
    const cursor = encodeManifestCursor({
      brands: { id: testId('brand'), updatedAt: '2026-01-01T00:00:00.000Z' },
      ingredients: {
        id: testId('ingredient'),
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      assets: { id: testId('asset'), updatedAt: '2026-01-01T00:00:00.000Z' },
    });
    const data = await selectedRead(() =>
      c.getBrandManifest(actor, { cursor }),
    );
    expect(JSON.stringify(data)).toContain('selected');
    expect(JSON.stringify(data)).not.toContain('original');
    for (const [input] of findMany.mock.calls)
      expect(input.where).not.toHaveProperty('isDeleted');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: selectedOrg,
          id: selectedBrand,
        }),
      }),
    );
    await selectedRead(() => service.getBrandManifest(actor, {}));
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          parentOrgId: originalOrg,
          parentBrandId: actor.brandId,
          isDeleted: false,
        }),
      }),
    );
  });
  it('sync status counts target organization without mutating original identity or default callers', async () => {
    const workflowsService = {
      findAllByOrganization: vi.fn((org: string) =>
        Promise.resolve(org === selectedOrg ? [{ cloudSync: {} }, {}] : [{}]),
      ),
    };
    const service = new SyncService(
      { get: () => 'synthetic-url' } as never,
      {} as never,
      {} as never,
      logger as never,
      workflowsService as never,
    );
    const c = instance(SyncController.prototype, { syncService: service });
    expect(await selectedRead(() => c.getStatus(actor))).toMatchObject({
      syncedWorkflows: 1,
      syncableWorkflows: 1,
    });
    expect(workflowsService.findAllByOrganization).toHaveBeenLastCalledWith(
      selectedOrg,
    );
    expect(await selectedRead(() => service.getStatus(actor))).toMatchObject({
      syncedWorkflows: 0,
      syncableWorkflows: 1,
    });
    expect(workflowsService.findAllByOrganization).toHaveBeenLastCalledWith(
      originalOrg,
    );
  });
  it('trends selected reads retain non-fetching arguments and reject refresh without invoking service', async () => {
    const trendsService = {
      getTrendsWithAccessControl: vi.fn((org: string) =>
        Promise.resolve({ trends: orgRows(org) }),
      ),
      getTrendContent: vi.fn((org: string) =>
        Promise.resolve({
          items: orgRows(org),
          connectedPlatforms: [],
          lockedPlatforms: [],
        }),
      ),
      getTrendsDiscovery: vi.fn((org: string) =>
        Promise.resolve({
          trends: orgRows(org),
          connectedPlatforms: [],
          lockedPlatforms: [],
        }),
      ),
    };
    const c = instance(TrendsController.prototype, { trendsService });
    const discovery = instance(TrendsDiscoveryController.prototype, {
      trendsService,
    });
    expect(await selectedRead(() => c.getTrends(request, actor))).toEqual({
      data: [tenantRows[1]],
    });
    expect(trendsService.getTrendsWithAccessControl).toHaveBeenCalledWith(
      selectedOrg,
      selectedBrand,
      undefined,
    );
    expect(
      (await selectedRead(() => discovery.getTrendContent(actor))).items,
    ).toEqual([tenantRows[1]]);
    expect(trendsService.getTrendContent).toHaveBeenCalledWith(
      selectedOrg,
      selectedBrand,
      expect.objectContaining({ refresh: false }),
    );
    expect(
      (await selectedRead(() => discovery.getTrendsDiscovery(actor))).trends,
    ).toEqual([tenantRows[1]]);
    const prior = trendsService.getTrendContent.mock.calls.length;
    await expect(
      selectedRead(() =>
        discovery.getTrendContent(actor, undefined, undefined, 'true'),
      ),
    ).rejects.toThrow();
    expect(trendsService.getTrendContent).toHaveBeenCalledTimes(prior);
  });
});

describe('provenance resource and children boundary', () => {
  const wrongVideo = {
    ...tenantRows[0],
    userId: actor.userId,
    category: 'VIDEO',
    metadataId: testId('metadata'),
    cdnUrl: 'https://synthetic.invalid/original',
  };
  const targetVideo = {
    ...tenantRows[1],
    userId: testId('user', 2),
    category: 'VIDEO',
    metadataId: testId('metadata', 2),
    cdnUrl: 'https://synthetic.invalid/selected',
  };
  const videosService = {
    findOne: vi.fn((where: Record<string, unknown>) =>
      Promise.resolve(
        [wrongVideo, targetVideo].find(
          (v) =>
            v.id === where.id &&
            (!where.organizationId ||
              v.organizationId === where.organizationId),
        ),
      ),
    ),
  };
  const metadataRows = [
    {
      id: wrongVideo.metadataId,
      ingredients: [
        { id: wrongVideo.id, organizationId: originalOrg, isDeleted: false },
      ],
      duration: 99,
    },
    {
      id: targetVideo.metadataId,
      ingredients: [
        { id: targetVideo.id, organizationId: selectedOrg, isDeleted: false },
      ],
      duration: 12,
    },
  ];
  const captionRows = [
    {
      ingredientId: targetVideo.id,
      organizationId: originalOrg,
      content: 'original transcript',
    },
    {
      ingredientId: targetVideo.id,
      organizationId: selectedOrg,
      content: 'selected transcript',
    },
    {
      ingredientId: wrongVideo.id,
      organizationId: originalOrg,
      content: 'original transcript',
    },
  ];
  const metadataService = {
    findOne: vi.fn(
      (where: {
        id: string;
        isDeleted?: boolean;
        ingredients?: {
          some: { id: string; organizationId: string; isDeleted: boolean };
        };
      }) =>
        Promise.resolve(
          metadataRows.find(
            (row) =>
              row.id === where.id &&
              (!where.ingredients ||
                row.ingredients.some(
                  (parent) =>
                    parent.id === where.ingredients?.some.id &&
                    parent.organizationId ===
                      where.ingredients?.some.organizationId &&
                    parent.isDeleted === where.ingredients?.some.isDeleted,
                )),
          ),
        ),
    ),
  };
  const captionsService = {
    find: vi.fn((where: { ingredientId: string; organizationId?: string }) =>
      Promise.resolve(
        captionRows.filter(
          (row) =>
            row.ingredientId === where.ingredientId &&
            (!where.organizationId ||
              row.organizationId === where.organizationId),
        ),
      ),
    ),
  };
  const service = new VideoProvenanceService(
    videosService as never,
    metadataService as never,
    captionsService as never,
    logger as never,
  );
  it('rejects original-user wrong-org video and returns only selected video/metadata/captions', async () => {
    await expect(
      service.buildProvenance(
        wrongVideo.id,
        { userId: actor.userId, organizationId: selectedOrg },
        selected,
      ),
    ).rejects.toThrow();
    const data = await service.buildProvenance(
      targetVideo.id,
      { userId: actor.userId, organizationId: selectedOrg },
      selected,
    );
    expect(data.manifest.media?.durationSeconds).toBe(12);
    expect(JSON.stringify(data)).toContain('selected transcript');
    expect(JSON.stringify(data)).not.toContain('original transcript');
    expect(videosService.findOne).toHaveBeenLastCalledWith({
      id: targetVideo.id,
      isDeleted: false,
      organizationId: selectedOrg,
      OR: [{ userId: actor.userId }, { organizationId: selectedOrg }],
    });
    expect(metadataService.findOne).toHaveBeenLastCalledWith({
      id: targetVideo.metadataId,
      ingredients: {
        some: {
          id: targetVideo.id,
          organizationId: selectedOrg,
          isDeleted: false,
        },
      },
      isDeleted: false,
    });
    expect(captionsService.find).toHaveBeenLastCalledWith({
      ingredientId: targetVideo.id,
      organizationId: selectedOrg,
      isDeleted: false,
    });
  });
  it.each([
    {
      label: 'original organization',
      parent: {
        id: targetVideo.id,
        organizationId: originalOrg,
        isDeleted: false,
      },
    },
    {
      label: 'deleted parent',
      parent: {
        id: targetVideo.id,
        organizationId: selectedOrg,
        isDeleted: true,
      },
    },
    {
      label: 'wrong parent',
      parent: {
        id: wrongVideo.id,
        organizationId: selectedOrg,
        isDeleted: false,
      },
    },
    { label: 'unlinked metadata', parent: undefined },
  ])('excludes metadata with $label', async ({ parent }) => {
    const previous = metadataRows[1].ingredients;
    metadataRows[1].ingredients = parent ? [parent] : [];
    try {
      const result = await service.buildProvenance(
        targetVideo.id,
        { userId: actor.userId, organizationId: selectedOrg },
        selected,
      );
      expect(result.manifest.media).toEqual({
        durationSeconds: null,
        fps: null,
        hasAudio: null,
        height: null,
        resolution: null,
        width: null,
      });
      expect(JSON.stringify(result)).toContain('selected transcript');
    } finally {
      metadataRows[1].ingredients = previous;
    }
  });
  it('default/public provenance retain original predicates and child call shape', async () => {
    await service.buildProvenance(wrongVideo.id, {
      userId: actor.userId,
      organizationId: originalOrg,
    });
    expect(videosService.findOne).toHaveBeenLastCalledWith({
      id: wrongVideo.id,
      isDeleted: false,
      OR: [{ userId: actor.userId }, { organizationId: originalOrg }],
    });
    expect(metadataService.findOne).toHaveBeenLastCalledWith({
      id: wrongVideo.metadataId,
    });
    expect(captionsService.find).toHaveBeenLastCalledWith({
      ingredientId: wrongVideo.id,
    });
    await service.buildPublicProvenance(wrongVideo.id);
    expect(videosService.findOne).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scope: 'PUBLIC',
        status: 'GENERATED',
        category: 'VIDEO',
      }),
    );
    expect(videosService.findOne.mock.lastCall?.[0]).not.toHaveProperty(
      'organizationId',
    );
  });
  it('watermark evaluation forwards the explicit selected scope', async () => {
    const spy = vi.spyOn(service, 'buildProvenance');
    await service.buildWatermarkAttributionEvaluation(
      targetVideo.id,
      { userId: actor.userId, organizationId: selectedOrg },
      selected,
    );
    expect(spy).toHaveBeenLastCalledWith(
      targetVideo.id,
      { userId: actor.userId, organizationId: selectedOrg },
      selected,
    );
    spy.mockRestore();
  });
});

describe('owner credential and actual-member gates remain intact', () => {
  it.each([
    {
      prototype: GoogleAdsController.prototype,
      handler: 'listCustomers',
      serviceKey: 'googleAdsService',
    },
    {
      prototype: GoogleSearchConsoleController.prototype,
      handler: 'listSites',
      serviceKey: 'googleSearchConsoleService',
    },
    {
      prototype: MetaAdsController.prototype,
      handler: 'getAdAccounts',
      serviceKey: 'metaAdsService',
    },
  ])(
    '$handler preserves original organization/user credential filter on ordinary path',
    async ({ prototype, handler, serviceKey }) => {
      const credentialsService = { findOne: vi.fn().mockResolvedValue(null) };
      const provider = {
        listAccessibleCustomers: vi.fn(),
        listSites: vi.fn(),
        getAdAccounts: vi.fn(),
      };
      const c = instance(prototype, {
        credentialsService,
        [serviceKey]: provider,
        loggerService: logger,
      });
      const action = Reflect.get(c, handler) as (
        user: AuthenticatedUser,
      ) => Promise<unknown>;
      await expect(
        handler === 'listSites'
          ? (
              action as unknown as (
                request: Request,
                user: AuthenticatedUser,
              ) => Promise<unknown>
            ).call(c, request, actor)
          : action.call(c, actor),
      ).rejects.toThrow();
      expect(credentialsService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: originalOrg,
          userId: actor.userId,
          isConnected: true,
        }),
      );
      expect(provider.listAccessibleCustomers).not.toHaveBeenCalled();
      expect(provider.listSites).not.toHaveBeenCalled();
      expect(provider.getAdAccounts).not.toHaveBeenCalled();
    },
  );
  it('learning ordinary reads retain actual-member check before data access', async () => {
    const operations = {
      assertMember: vi
        .fn()
        .mockRejectedValue(new Error('real member required')),
    };
    const accounts = { list: vi.fn() };
    const c = new ContentLearningController(
      accounts as never,
      operations as never,
      {} as never,
    );
    await expect(
      c.accountsList(request, actor, { brandId: actor.brandId } as never),
    ).rejects.toThrow('real member required');
    expect(operations.assertMember).toHaveBeenCalledWith({
      actorId: actor.userId,
      organizationId: originalOrg,
    });
    expect(accounts.list).not.toHaveBeenCalled();
  });
  it('visual and Remotion ordinary reads pass the same real principal to membership-bound services', async () => {
    const projects = {
      list: vi.fn().mockRejectedValue(new Error('member required')),
    };
    const compositions = {
      status: vi.fn().mockRejectedValue(new Error('member required')),
    };
    const visual = new VisualProjectsController(projects as never);
    const remotion = new RemotionCompositionsController(compositions as never);
    await expect(visual.list(request, actor, actor.brandId)).rejects.toThrow(
      'member required',
    );
    await expect(
      remotion.status(request, actor, testId('composition')),
    ).rejects.toThrow('member required');
    expect(projects.list).toHaveBeenCalledWith(
      actor,
      actor.brandId,
      20,
      undefined,
    );
    expect(compositions.status).toHaveBeenCalledWith(
      actor,
      testId('composition'),
    );
    expect(projects.list.mock.calls[0][0]).toBe(actor);
    expect(compositions.status.mock.calls[0][0]).toBe(actor);
  });
});

describe('inherited catalog forwarding', () => {
  it.each(
    [FontFamiliesController, PresetsController].map((ControllerClass) => ({
      ControllerClass,
      label: ControllerClass.name,
    })),
  )(
    '$label inherited dispatch returns selected and global data with original actor',
    async ({ ControllerClass }) => {
      const rows = [{ organizationId: null, label: 'global' }, ...tenantRows];
      const service = {
        findAll: vi.fn(
          (query: {
            where: { OR: Array<{ organizationId: string | null }> };
          }) =>
            Promise.resolve({
              docs: rows.filter((row) =>
                query.where.OR.some(
                  (c) => c.organizationId === row.organizationId,
                ),
              ),
            }),
        ),
      };
      const c = new ControllerClass(service as never, {} as never);
      const r = {
        method: 'GET',
        user: actor,
        query: { organizationId: selectedOrg },
      };
      const data = await firstValueFrom(
        new TenantContextInterceptor().intercept(
          context(r, ControllerClass.prototype.findAll),
          {
            handle: () =>
              defer(() =>
                from(c.findAll(request, actor, new PresetsQueryDto())),
              ),
          },
        ),
      );
      expect(data).toEqual({ data: [rows[0], tenantRows[1]] });
      expect(r.user).toBe(actor);
      expect(actor.organizationId).toBe(originalOrg);
    },
  );
});

describe('selected required-brand data filters', () => {
  it('saved ads use selected explicit brand and refuse foreign selection without a brand before data', async () => {
    const savedAdsService = {
      list: vi.fn((organizationId: string, brandId: string) =>
        Promise.resolve(
          tenantRows.filter(
            (row) =>
              row.organizationId === organizationId && row.brandId === brandId,
          ),
        ),
      ),
    };
    const controller = new SavedAdsController(savedAdsService as never);
    expect(
      await selectedRead(() => controller.list(request, actor, selectedBrand)),
    ).toEqual({ data: [tenantRows[1]] });
    expect(savedAdsService.list).toHaveBeenCalledWith(
      selectedOrg,
      selectedBrand,
    );
    const prior = savedAdsService.list.mock.calls.length;
    await expect(
      runWithTenantReadScope(
        { organizationId: selectedOrg, isOrganizationOverride: true },
        () => controller.list(request, actor),
      ),
    ).rejects.toThrow('A brand is required');
    expect(savedAdsService.list).toHaveBeenCalledTimes(prior);
    expect(await controller.list(request, actor)).toEqual({
      data: [tenantRows[0]],
    });
    expect(savedAdsService.list).toHaveBeenLastCalledWith(
      originalOrg,
      actor.brandId,
    );
  });
});

describe('existing required-brand scalar service arguments', () => {
  it('Facebook selected pages use target brand and never reuse original brand after selection', async () => {
    const facebookService = {
      getUserPages: vi.fn((organizationId: string, brandId: string) =>
        Promise.resolve(
          tenantRows.filter(
            (row) =>
              row.organizationId === organizationId && row.brandId === brandId,
          ),
        ),
      ),
    };
    const controller = instance(FacebookController.prototype, {
      facebookService,
      loggerService: logger,
    });
    expect(await selectedRead(() => controller.getUserPages(actor))).toEqual({
      pages: [tenantRows[1]],
    });
    expect(facebookService.getUserPages).toHaveBeenLastCalledWith(
      selectedOrg,
      selectedBrand,
    );
    expect(
      await runWithTenantReadScope(
        { organizationId: selectedOrg, isOrganizationOverride: true },
        () => controller.getUserPages(actor),
      ),
    ).toEqual({ pages: [] });
    expect(facebookService.getUserPages).toHaveBeenLastCalledWith(
      selectedOrg,
      '',
    );
    expect(await controller.getUserPages(actor)).toEqual({
      pages: [tenantRows[0]],
    });
    expect(facebookService.getUserPages).toHaveBeenLastCalledWith(
      originalOrg,
      actor.brandId,
    );
  });
  it('viral videos retain selected brand and existing empty-brand zero-data contract', async () => {
    const trendsService = {
      getBrandViralVideos: vi.fn((organizationId: string, brandId: string) =>
        Promise.resolve(
          tenantRows
            .filter(
              (row) =>
                row.organizationId === organizationId &&
                row.brandId === brandId,
            )
            .map((row) => ({ ...row, viralScore: 5, platform: 'synthetic' })),
        ),
      ),
    };
    const controller = instance(TrendsAnalyticsController.prototype, {
      trendsService,
    });
    expect(
      (await selectedRead(() => controller.getViralVideos({} as never, actor)))
        .videos,
    ).toEqual([{ ...tenantRows[1], viralScore: 5, platform: 'synthetic' }]);
    const result = await runWithTenantReadScope(
      { organizationId: selectedOrg, isOrganizationOverride: true },
      () => controller.getViralVideos({} as never, actor),
    );
    expect(result.videos).toEqual([]);
    expect(trendsService.getBrandViralVideos).toHaveBeenLastCalledWith(
      selectedOrg,
      '',
      expect.any(Object),
    );
    expect(
      (await controller.getViralVideos({} as never, actor)).videos,
    ).toEqual([{ ...tenantRows[0], viralScore: 5, platform: 'synthetic' }]);
    expect(trendsService.getBrandViralVideos).toHaveBeenLastCalledWith(
      originalOrg,
      actor.brandId,
      expect.any(Object),
    );
  });
});

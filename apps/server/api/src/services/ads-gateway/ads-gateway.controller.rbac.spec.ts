vi.mock('@api/helpers/decorators/swagger/auto-swagger.decorator', () => ({
  AutoSwagger: () => () => undefined,
}));

import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { API_KEY_SCOPES_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import { TenantContextInterceptor } from '@api/helpers/interceptors/tenant-context/tenant-context.interceptor';
import { TENANT_READ_POLICY } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { getTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import { AdsGatewayController } from '@api/services/ads-gateway/ads-gateway.controller';
import { AdsGatewayService } from '@api/services/ads-gateway/ads-gateway.service';
import { AdsGatewayRequestContextService } from '@api/services/ads-gateway/ads-gateway-request-context.service';
import { AdsGatewayWriteController } from '@api/services/ads-gateway/ads-gateway-write.controller';
import {
  ApiKeyScope,
  CredentialPlatform,
  toPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import { AdsPlatform } from '@genfeedai/contracts/interfaces';
import { testId } from '@helpers/testing/test-id.helper';
import { getTenantContext } from '@libs/prisma/tenant-context';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import {
  type ExecutionContext,
  ForbiddenException,
  RequestMethod,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { defer, firstValueFrom } from 'rxjs';

const READ_HANDLERS = [
  'comparePlatforms',
  'getAdAccounts',
  'listCampaigns',
  'getCampaignInsights',
  'getAdSetInsights',
  'getAdInsights',
  'getTopPerformers',
  'listAdSets',
  'listAds',
] as const;

const WRITE_HANDLERS = [
  'createCampaign',
  'updateCampaign',
  'createAdSet',
  'createAd',
] as const;

describe('AdsGatewayController RBAC', () => {
  it.each(READ_HANDLERS)(
    'requires owner, admin, or analytics role for %s',
    (handler) => {
      const metadata = Reflect.getMetadata(
        'roles',
        AdsGatewayController.prototype[handler],
      );

      expect(metadata).toEqual(['owner', 'admin', 'analytics']);
    },
  );

  it.each(READ_HANDLERS)(
    'requires an analytics-read scope for %s',
    (handler) => {
      const metadata = Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        AdsGatewayController.prototype[handler],
      );

      expect(metadata).toEqual([ApiKeyScope.ANALYTICS_READ, ApiKeyScope.ADMIN]);
    },
  );

  it.each(WRITE_HANDLERS)('requires owner or admin role for %s', (handler) => {
    const metadata = Reflect.getMetadata(
      'roles',
      AdsGatewayWriteController.prototype[handler],
    );

    expect(metadata).toEqual(['owner', 'admin']);
  });

  it.each(WRITE_HANDLERS)('requires the admin scope for %s', (handler) => {
    const metadata = Reflect.getMetadata(
      API_KEY_SCOPES_KEY,
      AdsGatewayWriteController.prototype[handler],
    );

    expect(metadata).toEqual([ApiKeyScope.ADMIN]);
  });

  it('leaves no paid-media route without role and scope metadata', () => {
    const prototypes = [
      AdsGatewayController.prototype,
      AdsGatewayWriteController.prototype,
    ] as unknown as Array<Record<string, object>>;
    const routeHandlers = prototypes.flatMap((prototype) =>
      Object.getOwnPropertyNames(prototype)
        .filter((name) => name !== 'constructor')
        .filter((name) => Reflect.hasMetadata('path', prototype[name]))
        .map((name) => prototype[name]),
    );

    expect(routeHandlers).toHaveLength(
      READ_HANDLERS.length + WRITE_HANDLERS.length,
    );

    for (const handler of routeHandlers) {
      expect(Reflect.getMetadata('roles', handler)).toBeDefined();
      expect(Reflect.getMetadata(API_KEY_SCOPES_KEY, handler)).toBeDefined();
    }
  });
});

type ReadHandler = (typeof READ_HANDLERS)[number];
const credentialId = testId('credential');
const foreignOrg = testId('org', 2);
const user: AuthenticatedUser = {
  id: testId('user'),
  userId: testId('user'),
  organizationId: testId('org'),
  brandId: testId('brand'),
  isSuperAdmin: true,
};
const readRoutes: {
  handler: ReadHandler;
  path: string;
  invoke: (
    controller: AdsGatewayController,
    actor: AuthenticatedUser,
  ) => Promise<unknown>;
}[] = [
  {
    handler: 'comparePlatforms',
    path: 'compare',
    invoke: (controller, actor) =>
      controller.comparePlatforms(
        actor,
        'meta,google',
        `${credentialId},${credentialId}`,
        'act_1,act_2',
        undefined,
        undefined,
        undefined,
        'login_1,login_2',
      ),
  },
  {
    handler: 'getAdAccounts',
    path: ':platform/accounts',
    invoke: (controller, actor) =>
      controller.getAdAccounts(actor, 'meta', credentialId, 'login_1'),
  },
  {
    handler: 'listCampaigns',
    path: ':platform/campaigns',
    invoke: (controller, actor) =>
      controller.listCampaigns(actor, 'meta', credentialId, 'act_1', 'login_1'),
  },
  {
    handler: 'getCampaignInsights',
    path: ':platform/campaigns/:campaignId/insights',
    invoke: (controller, actor) =>
      controller.getCampaignInsights(
        actor,
        'meta',
        'campaign_1',
        credentialId,
        'act_1',
        undefined,
        undefined,
        undefined,
        'login_1',
      ),
  },
  {
    handler: 'getAdSetInsights',
    path: ':platform/adsets/:adSetId/insights',
    invoke: (controller, actor) =>
      controller.getAdSetInsights(
        actor,
        'meta',
        'adset_1',
        credentialId,
        'act_1',
        undefined,
        undefined,
        undefined,
        'login_1',
      ),
  },
  {
    handler: 'getAdInsights',
    path: ':platform/ads/:adId/insights',
    invoke: (controller, actor) =>
      controller.getAdInsights(
        actor,
        'meta',
        'ad_1',
        credentialId,
        'act_1',
        undefined,
        undefined,
        undefined,
        'login_1',
      ),
  },
  {
    handler: 'getTopPerformers',
    path: ':platform/top-performers',
    invoke: (controller, actor) =>
      controller.getTopPerformers(
        actor,
        'meta',
        credentialId,
        'act_1',
        'ctr',
        '5',
        'last_7d',
        'login_1',
      ),
  },
  {
    handler: 'listAdSets',
    path: ':platform/adsets',
    invoke: (controller, actor) =>
      controller.listAdSets(
        actor,
        'meta',
        credentialId,
        'act_1',
        'campaign_1',
        'login_1',
      ),
  },
  {
    handler: 'listAds',
    path: ':platform/ads',
    invoke: (controller, actor) =>
      controller.listAds(
        actor,
        'meta',
        credentialId,
        'act_1',
        'adset_1',
        'login_1',
      ),
  },
];

function ownerFixture(query: Record<string, unknown>, actor = user) {
  const request = { method: 'GET', query, user: actor, context: { ...actor } };
  const credentials = {
    findOne: vi.fn(async () => {
      expect(getTenantContext()?.organizationId).toBe(actor.organizationId);
      expect(getTenantReadScope()).toBeUndefined();
      return { accessToken: 'encrypted-owner-token' };
    }),
  };
  const contextService = new AdsGatewayRequestContextService(
    credentials as unknown as CredentialsService,
  );
  const createContext = vi.spyOn(contextService, 'createAdapterContext');
  const validatePlatform = vi.spyOn(contextService, 'validatePlatform');
  const decrypt = vi
    .spyOn(EncryptionUtil, 'decrypt')
    .mockReturnValue('decrypted-owner-token');
  const adapter = {
    getAdAccounts: vi.fn().mockResolvedValue('accounts'),
    listCampaigns: vi.fn().mockResolvedValue('campaigns'),
    getCampaignInsights: vi.fn().mockResolvedValue('campaign-insights'),
    getAdSetInsights: vi.fn().mockResolvedValue('adset-insights'),
    getAdInsights: vi.fn().mockResolvedValue('ad-insights'),
    getTopPerformers: vi.fn().mockResolvedValue('top-performers'),
    listAdSets: vi.fn().mockResolvedValue('adsets'),
    listAds: vi.fn().mockResolvedValue('ads'),
  };
  const gateway = {
    getAdapter: vi.fn().mockReturnValue(adapter),
    comparePlatforms: vi.fn().mockResolvedValue('comparison'),
  };
  const controller = new AdsGatewayController(
    gateway as unknown as AdsGatewayService,
    contextService,
    { log: vi.fn() } as never,
  );
  const interceptor = new TenantContextInterceptor(new Reflector());
  function run(route: (typeof readRoutes)[number]) {
    const actualHandler = AdsGatewayController.prototype[route.handler];
    const execution = {
      getClass: () => AdsGatewayController,
      getHandler: () => actualHandler,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const next = {
      handle: vi.fn(() => defer(() => route.invoke(controller, actor))),
    };
    return {
      next,
      execute: async () =>
        firstValueFrom(interceptor.intercept(execution, next)),
    };
  }
  return {
    request,
    credentials,
    createContext,
    validatePlatform,
    decrypt,
    adapter,
    gateway,
    run,
  };
}

function expectNoOwnerWork(fixture: ReturnType<typeof ownerFixture>) {
  expect(fixture.createContext).not.toHaveBeenCalled();
  expect(fixture.validatePlatform).not.toHaveBeenCalled();
  expect(fixture.credentials.findOne).not.toHaveBeenCalled();
  expect(fixture.decrypt).not.toHaveBeenCalled();
  expect(fixture.gateway.getAdapter).not.toHaveBeenCalled();
  expect(fixture.gateway.comparePlatforms).not.toHaveBeenCalled();
  for (const method of Object.values(fixture.adapter))
    expect(method).not.toHaveBeenCalled();
}

describe('AdsGatewayController owner credential boundaries', () => {
  afterEach(() => vi.restoreAllMocks());

  it('covers exactly the existing nine read methods', () => {
    expect(readRoutes.map((route) => route.handler)).toEqual([
      ...READ_HANDLERS,
    ]);
    expect(new Set(readRoutes.map((route) => route.path)).size).toBe(9);
  });

  it.each(readRoutes)(
    'keeps actual GET $handler owner metadata and route unchanged',
    ({ handler, path }) => {
      const method = AdsGatewayController.prototype[handler];
      expect(Reflect.getMetadata(TENANT_READ_POLICY, method)).toBe('owner');
      expect(Reflect.getMetadata(PATH_METADATA, method)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, method)).toBe(
        RequestMethod.GET,
      );
    },
  );

  it.each(readRoutes)(
    'refuses foreign selection before $handler credentials or provider work',
    async (route) => {
      const fixture = ownerFixture({ organizationId: foreignOrg });
      const originalUser = fixture.request.user;
      const originalContext = fixture.request.context;
      const before = structuredClone(fixture.request);
      const { next, execute } = fixture.run(route);
      await expect(execute()).rejects.toBeInstanceOf(ForbiddenException);
      expect(next.handle).not.toHaveBeenCalled();
      expectNoOwnerWork(fixture);
      expect(fixture.request.user).toBe(originalUser);
      expect(fixture.request.context).toBe(originalContext);
      expect(fixture.request).toEqual(before);
    },
  );

  for (const selection of [
    { name: 'no', query: {} },
    { name: 'equal', query: { organizationId: user.organizationId } },
  ]) {
    it.each(readRoutes)(
      `executes $handler with original identity for ${selection.name} selection`,
      async (route) => {
        const fixture = ownerFixture(selection.query);
        const originalUser = fixture.request.user;
        const originalContext = fixture.request.context;
        const before = structuredClone(fixture.request);
        const { next, execute } = fixture.run(route);
        const result = await execute();
        expect(next.handle).toHaveBeenCalledOnce();
        expect(fixture.request.user).toBe(originalUser);
        expect(fixture.request.context).toBe(originalContext);
        expect(fixture.request).toEqual(before);
        const contexts = route.handler === 'comparePlatforms' ? 2 : 1;
        expect(fixture.createContext).toHaveBeenCalledTimes(contexts);
        expect(fixture.credentials.findOne).toHaveBeenCalledTimes(contexts);
        expect(fixture.decrypt).toHaveBeenCalledTimes(contexts);
        expect(fixture.credentials.findOne).toHaveBeenNthCalledWith(1, {
          id: credentialId,
          isConnected: true,
          isDeleted: false,
          organizationId: user.organizationId,
          platform: toPrismaCredentialPlatform(CredentialPlatform.FACEBOOK),
        });
        expect(fixture.createContext).toHaveBeenNthCalledWith(
          1,
          originalUser,
          AdsPlatform.META,
          {
            credentialId,
            adAccountId: route.handler === 'getAdAccounts' ? '' : 'act_1',
            loginCustomerId: 'login_1',
          },
        );
        const adapterContext = {
          accessToken: 'decrypted-owner-token',
          accessTokenSecret: undefined,
          adAccountId: route.handler === 'getAdAccounts' ? '' : 'act_1',
          brandId: undefined,
          credentialId,
          loginCustomerId: 'login_1',
          organizationId: user.organizationId,
        };
        if (route.handler === 'comparePlatforms') {
          expect(fixture.credentials.findOne).toHaveBeenNthCalledWith(2, {
            id: credentialId,
            isConnected: true,
            isDeleted: false,
            organizationId: user.organizationId,
            platform: toPrismaCredentialPlatform(CredentialPlatform.GOOGLE_ADS),
          });
          expect(
            fixture.gateway.comparePlatforms,
          ).toHaveBeenCalledExactlyOnceWith(
            [
              { platform: AdsPlatform.META, ctx: adapterContext },
              {
                platform: AdsPlatform.GOOGLE,
                ctx: {
                  ...adapterContext,
                  adAccountId: 'act_2',
                  loginCustomerId: 'login_2',
                },
              },
            ],
            {},
          );
          expect(result).toBe('comparison');
        } else {
          expect(fixture.gateway.getAdapter).toHaveBeenCalledExactlyOnceWith(
            AdsPlatform.META,
          );
          const calls = fixture.adapter[route.handler].mock.calls;
          expect(calls).toHaveLength(1);
          expect(calls[0][0]).toEqual(adapterContext);
          expect(result).toBe(
            await fixture.adapter[route.handler].mock.results[0].value,
          );
        }
      },
    );
  }

  for (const selector of [
    { name: 'malformed', value: 'not-an-entity' },
    { name: 'array', value: [foreignOrg] },
  ]) {
    it.each(readRoutes)(
      `rejects ${selector.name} selection before $handler`,
      async (route) => {
        const fixture = ownerFixture({ organizationId: selector.value });
        const { next, execute } = fixture.run(route);
        await expect(execute()).rejects.toBeInstanceOf(ForbiddenException);
        expect(next.handle).not.toHaveBeenCalled();
        expectNoOwnerWork(fixture);
      },
    );
  }

  it.each(readRoutes)(
    'rejects an IP-unverified superadmin before $handler',
    async (route) => {
      const fixture = ownerFixture({ organizationId: foreignOrg });
      fixture.request.context.isSuperAdmin = false;
      const { next, execute } = fixture.run(route);
      await expect(execute()).rejects.toBeInstanceOf(ForbiddenException);
      expect(next.handle).not.toHaveBeenCalled();
      expectNoOwnerWork(fixture);
    },
  );

  it.each(readRoutes)(
    'rejects foreign selection for an ordinary member before $handler',
    async (route) => {
      const fixture = ownerFixture(
        { organizationId: foreignOrg },
        { ...user, isSuperAdmin: false },
      );
      const { next, execute } = fixture.run(route);
      await expect(execute()).rejects.toBeInstanceOf(ForbiddenException);
      expect(next.handle).not.toHaveBeenCalled();
      expectNoOwnerWork(fixture);
    },
  );
});

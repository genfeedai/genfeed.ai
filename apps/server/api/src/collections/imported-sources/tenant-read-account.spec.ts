import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandedGenerationReceiptsController } from '@api/collections/branded-generation-receipts/controllers/branded-generation-receipts.controller';
import { verifyBrandAccess } from '@api/collections/brands/controllers/brand-access.helpers';
import { BrandsController } from '@api/collections/brands/controllers/brands.controller';
import { BrandsRelationshipsController } from '@api/collections/brands/controllers/relationships/brands-relationships.controller';
import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsPublishingController } from '@api/collections/credentials/controllers/credentials-publishing.controller';
import { AccountHealthService } from '@api/collections/credentials/services/account-health.service';
import { CreditsController } from '@api/collections/credits/controllers/credits.controller';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { ImportedSourcesController } from '@api/collections/imported-sources/controllers/imported-sources.controller';
import type { ImportedSourceRecord } from '@api/collections/imported-sources/services/imported-source-state';
import {
  importedSourceIdentityDigest,
  importedSourceRootId,
} from '@api/collections/imported-sources/services/imported-source-state';
import { ImportedSourcesService } from '@api/collections/imported-sources/services/imported-sources.service';
import { TENANT_READ_ACCOUNT_ROUTES } from '@api/collections/imported-sources/tenant-read-account.registry';
import { MembersController } from '@api/collections/members/controllers/members.controller';
import type { MembersService } from '@api/collections/members/services/members.service';
import { ProfilesController } from '@api/collections/profiles/controllers/profiles.controller';
import type { ProfilesService } from '@api/collections/profiles/services/profiles.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantContextInterceptor } from '@api/helpers/interceptors/tenant-context/tenant-context.interceptor';
import { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { brandAccessFixture } from '@api/shared/testing/brand-access.fixture';
import { MemberRole } from '@genfeedai/contracts';
import type { ImportedSourceSnapshotInput } from '@genfeedai/contracts/api-types/contracts/imported-source.contract';
import type { JsonApiCollectionResponse } from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { testId } from '@helpers/testing/test-id.helper';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { defer, firstValueFrom, of } from 'rxjs';

const originalOrg = testId('org');
const selectedOrg = testId('org', 2);
const user: AuthenticatedUser = {
  id: testId('user'),
  userId: testId('user'),
  organizationId: originalOrg,
  brandId: testId('brand'),
  isSuperAdmin: true,
};
function context(
  request: object,
  handler: (...args: never[]) => unknown,
): ExecutionContext {
  return {
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
const interceptor = new TenantContextInterceptor();
describe('account tenant read policies', () => {
  it('enumerates the settled 54 routes and 25 controllers with actual handler metadata', () => {
    expect(TENANT_READ_ACCOUNT_ROUTES).toHaveLength(54);
    expect(
      new Set(TENANT_READ_ACCOUNT_ROUTES.map((r) => r.controller)).size,
    ).toBe(25);
    expect(new Set(TENANT_READ_ACCOUNT_ROUTES.map((r) => r.route)).size).toBe(
      54,
    );
    for (const entry of TENANT_READ_ACCOUNT_ROUTES) {
      const controllerPaths = [
        Reflect.getMetadata(PATH_METADATA, entry.controller),
      ].flat() as string[];
      const handler = (
        entry.controller.prototype as unknown as Record<
          string,
          (...args: never[]) => unknown
        >
      )[entry.handler];
      const handlerPaths = [
        Reflect.getMetadata(PATH_METADATA, handler),
      ].flat() as string[];
      const routes = controllerPaths.flatMap((prefix) =>
        handlerPaths.map((suffix) =>
          `/v1/${prefix}/${suffix}`
            .replace(/\/+/g, '/')
            .replace(/\/$/, '')
            .replace(/:([A-Za-z0-9_]+)/g, '{$1}'),
        ),
      );
      expect(routes).toContain(entry.route);

      expect(
        Reflect.getMetadata(
          'genfeed.tenantReadPolicy',
          (
            entry.controller.prototype as unknown as Record<
              string,
              (...args: never[]) => unknown
            >
          )[entry.handler],
        ),
      ).toBe(entry.policy);
    }
  });
  for (const entry of TENANT_READ_ACCOUNT_ROUTES.filter(
    (r) => r.policy !== 'selected',
  )) {
    it(`${entry.route} refuses foreign scope before any handler call`, () => {
      const next = { handle: vi.fn(() => of('unexpected')) };
      expect(() =>
        interceptor.intercept(
          context(
            { method: 'GET', user, query: { organizationId: selectedOrg } },
            (
              entry.controller.prototype as unknown as Record<
                string,
                (...args: never[]) => unknown
              >
            )[entry.handler],
          ),
          next,
        ),
      ).toThrow(expect.objectContaining({ status: 403 }));
      expect(next.handle).not.toHaveBeenCalled();
    });
    it(`${entry.route} preserves absent/equal scope handler dispatch`, async () => {
      for (const query of [{}, { organizationId: originalOrg }]) {
        const next = { handle: vi.fn(() => of('original-handler')) };
        expect(
          await firstValueFrom(
            interceptor.intercept(
              context(
                { method: 'GET', user, query },
                (
                  entry.controller.prototype as unknown as Record<
                    string,
                    (...args: never[]) => unknown
                  >
                )[entry.handler],
              ),
              next,
            ),
          ),
        ).toBe('original-handler');
        expect(next.handle).toHaveBeenCalledOnce();
      }
    });
  }
  it('returns selected profile rows while preserving the original principal', async () => {
    const rows = [
      { id: testId('profile'), organizationId: originalOrg, label: 'original' },
      {
        id: testId('profile', 2),
        organizationId: selectedOrg,
        label: 'selected',
      },
    ];
    const findAll = vi.fn(async (org: string) =>
      rows.filter((r) => r.organizationId === org),
    );
    const controller = Object.assign(
      Object.create(ProfilesController.prototype),
      { profilesService: { findAll } as unknown as ProfilesService },
    ) as ProfilesController;
    const request = {
      method: 'GET',
      user,
      query: { organizationId: selectedOrg },
      originalUrl: '/v1/profiles',
    } as unknown as RequestWithContext;
    const result = await firstValueFrom(
      interceptor.intercept(
        context(request, ProfilesController.prototype.findAll),
        { handle: () => defer(() => controller.findAll(request, user)) },
      ) as Observable<JsonApiCollectionResponse>,
    );
    expect(result.data.map((r) => r.id)).toEqual([rows[1].id]);
    expect(findAll).toHaveBeenCalledWith(selectedOrg, expect.anything());
    expect(user.organizationId).toBe(originalOrg);
  });
});

const selectedBrand = testId('brand', 2);
const requestFor = (
  query: Record<string, unknown> = { organizationId: selectedOrg },
): RequestWithContext =>
  ({
    method: 'GET',
    user,
    query,
    originalUrl: '/v1/account-test',
    context: {
      organizationId: originalOrg,
      brandId: user.brandId,
      userId: user.userId,
      isSuperAdmin: true,
      subscriptionTier: 'test',
      stripeSubscriptionStatus: 'active',
      hydratedAt: 0,
    },
  }) as unknown as RequestWithContext;
function instance<T extends object>(prototype: T, dependencies: object): T {
  return Object.assign(Object.create(prototype), dependencies) as T;
}
async function selected<T>(
  handler: (...args: never[]) => unknown,
  work: () => Promise<T> | T,
  request = requestFor(),
): Promise<T> {
  return firstValueFrom(
    interceptor.intercept(context(request, handler), {
      handle: () => defer(async () => work()),
    }) as Observable<T>,
  );
}
describe('account selected data and original authorization', () => {
  it.each(['findOne', 'findOneBySlug'] as const)(
    'Brands %s selects the target row and decorates only target relations',
    async (method) => {
      const rows = [
        {
          id: testId('brand'),
          organizationId: originalOrg,
          slug: 'original',
          label: 'original',
        },
        {
          id: selectedBrand,
          organizationId: selectedOrg,
          slug: 'selected',
          label: 'selected',
        },
      ] as BrandDocument[];
      const findOne = vi.fn(
        async (where: { organizationId?: string; id?: string }) =>
          rows.find(
            (r) =>
              r.organizationId === where.organizationId &&
              (!where.id || r.id === where.id),
          ) ?? null,
      );
      const findOneBySlug = vi.fn(
        async (where: { organizationId?: string; slug?: string }) =>
          rows.find(
            (r) =>
              r.organizationId === where.organizationId &&
              r.slug === where.slug,
          ) ?? null,
      );
      const assets = vi.fn(async (brands: BrandDocument[]) => brands);
      const credentials = vi.fn(async () => []);
      const controller = instance(BrandsController.prototype, {
        brandsService: {
          findOne,
          findOneBySlug,
          attachBrandKitAssetRelations: assets,
        },
        service: { findOne },
        credentialsService: { find: credentials },
        entityName: 'Brand',
        serializer: null,
      });
      const request = requestFor();
      const result = await selected(BrandsController.prototype[method], () =>
        method === 'findOne'
          ? controller.findOne(request, user, selectedBrand)
          : controller.findOneBySlug(request, user, 'selected'),
      );
      // By-id uses the real BaseCRUD serializer field; slug uses the existing Brand serializer.
      const id = 'id' in result ? result.id : result.data?.id;
      expect(id).toBe(selectedBrand);
      expect(
        findOne.mock.calls.every(
          ([where]) => where.organizationId === selectedOrg,
        ),
      ).toBe(true);
      expect(assets).toHaveBeenCalledWith([rows[1]], selectedOrg);
      expect(credentials).toHaveBeenCalledWith({
        brandId: selectedBrand,
        organizationId: selectedOrg,
        isDeleted: false,
      });
      expect(user.organizationId).toBe(originalOrg);
    },
  );
  it('the shared helper keeps default write callers on original identity inside selected ALS', async () => {
    const findOne = vi.fn<BrandsService['findOne']>().mockResolvedValue({
      id: user.brandId,
      organizationId: originalOrg,
    } as BrandDocument);
    await selected(BrandsController.prototype.findOne, () =>
      verifyBrandAccess(
        { findOne, brandAccessService: brandAccessFixture() },
        user.brandId,
        user,
      ),
    );
    expect(findOne).toHaveBeenCalledWith({
      id: user.brandId,
      organizationId: originalOrg,
      isDeleted: false,
    });
  });
  it('relationships analytics constrains brand, credential and aggregate queries to target rows', async () => {
    const findOne = vi.fn(async (where: { organizationId?: string }) =>
      where.organizationId === selectedOrg
        ? { id: selectedBrand, organizationId: selectedOrg }
        : null,
    );
    const credentials = vi.fn(
      async (input: {
        where: { organizationId: string; brandId: string };
      }) => ({
        docs: [
          {
            total:
              input.where.organizationId === selectedOrg &&
              input.where.brandId === selectedBrand
                ? 2
                : 99,
          },
        ],
      }),
    );
    const overview = vi.fn(async (org: string) => ({
      totalViews: org === selectedOrg ? 42 : 99,
      totalPosts: 2,
      viewsGrowth: 1,
    }));
    const controller = instance(BrandsRelationshipsController.prototype, {
      brandsService: { findOne },
      credentialsService: { findAll: credentials },
      analyticsAggregationService: { getOverviewMetrics: overview },
    });
    const request = requestFor();
    const result = await selected(
      BrandsRelationshipsController.prototype.findBrandAnalytics,
      () => controller.findBrandAnalytics(request, selectedBrand, {}, user),
    );
    expect(result.data?.attributes).toMatchObject({ totalViews: 42 });
    expect(credentials).toHaveBeenCalledWith(
      {
        where: {
          brandId: selectedBrand,
          organizationId: selectedOrg,
          isConnected: true,
          isDeleted: false,
        },
      },
      { pagination: false },
    );
    expect(overview).toHaveBeenCalledWith(
      selectedOrg,
      selectedBrand,
      undefined,
      undefined,
    );
  });
  it('role-protected invitations keep owner/admin metadata and original principal while selecting target rows', async () => {
    const invitations = [
      { id: testId('invitation'), organizationId: originalOrg },
      { id: testId('invitation', 2), organizationId: selectedOrg },
    ];
    const listInvitations = vi.fn(async (org: string) =>
      invitations.filter((r) => r.organizationId === org),
    );
    const controller = instance(MembersController.prototype, {
      invitationService: { listInvitations },
    });
    const result = await selected(
      MembersController.prototype.listInvitations,
      () => controller.listInvitations(requestFor(), {}, user),
    );
    expect((result as JsonApiCollectionResponse).data.map((r) => r.id)).toEqual(
      [invitations[1].id],
    );
    expect(
      Reflect.getMetadata('roles', MembersController.prototype.listInvitations),
    ).toEqual([MemberRole.OWNER, MemberRole.ADMIN]);
    expect(user.organizationId).toBe(originalOrg);
  });
  it('credit transaction data uses selected org and explicit query brand without rewriting hydrated context', async () => {
    const rows = [
      {
        id: testId('transaction'),
        organizationId: originalOrg,
        brandId: user.brandId,
      },
      {
        id: testId('transaction', 2),
        organizationId: selectedOrg,
        brandId: selectedBrand,
      },
    ];
    const transactions = vi.fn(
      async (
        org: string,
        _limit: number,
        _skip: number,
        filters: { brandId?: string },
      ) =>
        rows.filter(
          (r) => r.organizationId === org && r.brandId === filters.brandId,
        ),
    );
    const controller = instance(CreditsController.prototype, {
      creditTransactionsService: { getOrganizationTransactions: transactions },
    });
    const request = Object.assign(
      requestFor({ organizationId: selectedOrg, brandId: selectedBrand }),
      {
        context: {
          organizationId: originalOrg,
          brandId: user.brandId,
          isSuperAdmin: true,
          userId: user.userId,
          subscriptionTier: 'test',
          stripeSubscriptionStatus: 'active',
          hydratedAt: 0,
        },
      },
    );
    const result = await selected<JsonApiCollectionResponse>(
      CreditsController.prototype.listTransactions,
      () => controller.listTransactions(request, user, selectedBrand),
      request,
    );
    expect(result.data.map((r) => r.id)).toEqual([rows[1].id]);
    expect(transactions).toHaveBeenCalledWith(selectedOrg, 50, 0, {
      brandId: selectedBrand,
      category: undefined,
      source: undefined,
    });
    expect(request.context.organizationId).toBe(originalOrg);
  });
});

function importedDatabase() {
  const snapshot: ImportedSourceSnapshotInput = {
    kind: 'article',
    canonicalUrl: 'https://example.com/article',
    title: 'Selected source',
    capturedText: 'original snapshot',
    contentBasis: 'visible_selection',
  };
  const rows = [originalOrg, selectedOrg].map(
    (org, index): ImportedSourceRecord => {
      const brandId = index === 0 ? user.brandId : selectedBrand;
      const digest = importedSourceIdentityDigest(
        { organizationId: org, brandId },
        snapshot,
      );
      return {
        id: importedSourceRootId(digest),
        organizationId: org,
        brandId,
        version: 1,
        sourceActionId: `imported-source:v1:${digest}`,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        providerData: {
          importedSource: {
            version: 1,
            identityDigest: digest,
            originIngredientId: importedSourceRootId(digest),
            captureRevision: 1,
            snapshot: {
              ...snapshot,
              capturedAt: new Date().toISOString(),
              captureSurface: 'extension',
              provenance: 'imported',
              evidenceAuthority: 'client_reported',
              host: 'example.com',
            },
          },
        },
      };
    },
  );
  const db = {
    brand: {
      findFirst: vi.fn(async (args: Prisma.BrandFindFirstArgs) => ({
        id: args.where?.id,
      })),
    },
    ingredient: {
      findFirst: vi.fn(
        async (args: Prisma.IngredientFindFirstArgs) =>
          rows.find(
            (row) =>
              row.id === args.where?.id &&
              row.organizationId === args.where?.organizationId &&
              row.brandId === args.where?.brandId,
          ) ?? null,
      ),
    },
  };
  return {
    rows,
    db,
    service: new ImportedSourcesService(db as unknown as PrismaService),
  };
}
describe('imported source explicit read scope', () => {
  it('actual controller and service return selected source; actual userId and service defaults survive', async () => {
    const { rows, db, service } = importedDatabase();
    const controller = new ImportedSourcesController(service);
    const scopeSpy = vi.spyOn(
      service as unknown as {
        scope: (
          u: AuthenticatedUser,
          brand: string,
          scope?: unknown,
        ) => { userId: string; organizationId: string };
      },
      'scope',
    );
    const result = await selected(ImportedSourcesController.prototype.get, () =>
      controller.get(requestFor(), user, selectedBrand, rows[1].id),
    );
    expect(result.data?.id).toBe(rows[1].id);
    expect(scopeSpy.mock.results[0].value).toMatchObject({
      userId: user.userId,
      organizationId: selectedOrg,
    });
    expect(db.ingredient.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: rows[1].id,
        organizationId: selectedOrg,
        brandId: selectedBrand,
        isDeleted: false,
      }),
    });
    const ordinary = await selected(
      ImportedSourcesController.prototype.get,
      () => service.get(user, user.brandId, rows[0].id),
    );
    expect(ordinary.id).toBe(rows[0].id);
    expect(scopeSpy.mock.results[1].value).toMatchObject({
      userId: user.userId,
      organizationId: originalOrg,
    });
  });
  it('selected scope retains API credential refusal and missing real-userId validation before DB', async () => {
    for (const override of [
      { isApiKey: true },
      { apiKeyId: 'credential' },
      { userId: '' },
    ]) {
      const { rows, db, service } = importedDatabase();
      const controller = new ImportedSourcesController(service);
      await expect(
        selected(ImportedSourcesController.prototype.get, () =>
          controller.get(
            requestFor(),
            { ...user, ...override },
            selectedBrand,
            rows[1].id,
          ),
        ),
      ).rejects.toMatchObject({ status: 'userId' in override ? 400 : 403 });
      expect(db.brand.findFirst).not.toHaveBeenCalled();
      expect(db.ingredient.findFirst).not.toHaveBeenCalled();
    }
  });
});

describe('ordinary account owner and mutation behavior', () => {
  it('receipt list still executes actual active-member checks and refuses a missing membership', async () => {
    const member = vi.fn(async () => null);
    const tx = {
      organization: { findFirst: vi.fn(async () => ({ id: originalOrg })) },
      brand: { findFirst: vi.fn(async () => ({ id: user.brandId })) },
      member: { findFirst: member },
    };
    const access = new BrandedGenerationReceiptAccessService(
      brandAccessFixture(),
    );
    const list = vi.fn(
      async (actor: {
        organizationId: string;
        actorId: string;
        brandId: string;
      }) => {
        await access.assertBrand(
          actor,
          tx as unknown as Prisma.TransactionClient,
        );
        return { items: [], nextCursor: null };
      },
    );
    const controller = instance(BrandedGenerationReceiptsController.prototype, {
      receipts: { list },
    });
    await expect(
      selected(
        BrandedGenerationReceiptsController.prototype.list,
        () =>
          controller.list(requestFor({}), user, user.brandId, { limit: 10 }),
        requestFor({}),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(member).toHaveBeenCalledWith({
      where: {
        userId: user.userId,
        organizationId: originalOrg,
        isDeleted: false,
        isActive: true,
      },
      include: { role: true, brands: { select: { id: true } } },
    });
  });
  it('ordinary credit baseline still invokes original get-or-create service behavior', async () => {
    const getOrCreateBalance = vi.fn(async (org: string) => ({
      id: testId('balance'),
      organizationId: org,
      amount: 0,
    }));
    const transactionRead = vi.fn(async () => null);
    const transactions = instance(CreditTransactionsService.prototype, {
      creditBalanceService: { getOrCreateBalance },
      prisma: { creditTransaction: { findFirst: transactionRead } },
      modelName: 'creditTransaction',
      logger: { debug: vi.fn(), error: vi.fn() },
    });
    const controller = instance(CreditsController.prototype, {
      creditTransactionsService: transactions,
    });
    await selected(
      CreditsController.prototype.getLastPurchaseBaseline,
      () => controller.getLastPurchaseBaseline(requestFor({}), user),
      requestFor({}),
    );
    expect(getOrCreateBalance).toHaveBeenCalledWith(originalOrg);
  });
  it('ordinary credential account-health retains the original mutation call', async () => {
    const findMany = vi.fn(async () => [{ id: testId('credential') }]);
    const health = new AccountHealthService({
      credential: { findMany },
    } as unknown as PrismaService);
    const assess = vi
      .spyOn(health, 'assessCredentialHealth')
      .mockResolvedValue(
        {} as Awaited<
          ReturnType<AccountHealthService['assessCredentialHealth']>
        >,
      );
    const controller = instance(CredentialsPublishingController.prototype, {
      accountHealthService: health,
    });
    await selected(
      CredentialsPublishingController.prototype.listBrandAccountHealth,
      () => controller.listBrandAccountHealth(user.brandId, user),
      requestFor({}),
    );
    expect(findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'asc' },
      where: {
        organizationId: originalOrg,
        brandId: user.brandId,
        isConnected: true,
        isDeleted: false,
      },
    });
    expect(assess).toHaveBeenCalledWith({
      organizationId: originalOrg,
      brandId: user.brandId,
      credentialId: testId('credential'),
    });
  });
});

it('invitation role guard checks original membership and cannot invent selected membership', async () => {
  const findOne = vi.fn<MembersService['findOne']>().mockResolvedValue(null);
  const guard = new RolesGuard(new Reflector(), {
    findOne,
  } as unknown as MembersService);
  const principal = { ...user, isSuperAdmin: false };
  const request = {
    params: {},
    method: 'GET',
    user: principal,
    query: { organizationId: selectedOrg },
  };
  await expect(
    guard.canActivate(
      context(request, MembersController.prototype.listInvitations),
    ),
  ).rejects.toMatchObject({ status: 403 });
  expect(findOne).toHaveBeenCalledWith(
    {
      organizationId: originalOrg,
      userId: user.userId,
      isActive: true,
      isDeleted: false,
    },
    expect.any(Array),
  );
  expect(request.user).toBe(principal);
  expect(principal.organizationId).toBe(originalOrg);
});

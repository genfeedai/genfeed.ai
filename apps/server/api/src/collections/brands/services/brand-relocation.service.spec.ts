// Real enums + schema-derived metadata via the light @genfeedai/prisma/testing
// subpath, plus a runtime Prisma.PrismaClientKnownRequestError for the P2002 path.
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

// The service resolves the scheduler lazily through ModuleRef; the real class
// drags in the whole workflow module graph, so a token class stands in for it.
vi.mock(
  '@api/collections/workflows/services/workflow-scheduler.service',
  () => ({
    WorkflowSchedulerService: class WorkflowSchedulerService {},
  }),
);

import {
  FIRST_ORDER_TARGETS,
  SECOND_ORDER_TARGETS,
} from '@api/collections/brands/constants/brand-org-cascade.constants';
import { BrandRelocationService } from '@api/collections/brands/services/brand-relocation.service';
import type { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import type { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Prisma } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';

type Delegate = {
  count: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  createMany: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
};

function makeDelegate(): Delegate {
  return {
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue({ id: 'created_id' }),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    findFirst: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
}

const BRAND_ID = 'brand_abc';
const SOURCE_ORG = 'org_source';
const DEST_ORG = 'org_dest';
const USER_ID = 'user_1';
// The org always keeps a non-deleted brand for members' currentBrandId to
// fall back to (#5219) — a second, unrelated brand in SOURCE_ORG.
const SOURCE_FALLBACK_BRAND_ID = 'brand_fallback';

const EMPTY_RELOCATION_SUMMARY = {
  membersSevered: 0,
  personaGrantsRevoked: 0,
  personasSharingReset: 0,
  schedulesHeld: 0,
  schedulingPending: 0,
  workflowsMoved: 0,
};

describe('BrandRelocationService', () => {
  let delegates: Map<string, Delegate>;
  let queryRaw: ReturnType<typeof vi.fn>;
  let executeRaw: ReturnType<typeof vi.fn>;
  let transactionSpy: ReturnType<typeof vi.fn>;
  let accessBootstrapCacheService: {
    invalidateForOrganization: ReturnType<typeof vi.fn>;
  };
  let cacheInvalidationService: {
    invalidate: ReturnType<typeof vi.fn>;
    invalidateByTags: ReturnType<typeof vi.fn>;
  };
  let prismaProxy: unknown;
  let service: BrandRelocationService;
  let logger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let unscheduleWorkflow: ReturnType<typeof vi.fn>;
  let moduleRef: { get: ReturnType<typeof vi.fn> };

  const getDelegate = (name: string): Delegate => {
    const existing = delegates.get(name);
    if (existing) {
      return existing;
    }
    const created = makeDelegate();
    delegates.set(name, created);
    return created;
  };

  beforeEach(() => {
    delegates = new Map();
    // information_schema scan → no unknown dual-keyed tables.
    queryRaw = vi.fn(async (statement: TemplateStringsArray | Prisma.Sql) => {
      const text = Array.isArray(statement)
        ? statement.join('')
        : (statement as Prisma.Sql).sql;
      if (text.includes('AS retained')) return [{ retained: false }];
      if (text.includes('hasOpenHold')) return [{ hasOpenHold: false }];
      if (/FOR (NO KEY )?UPDATE/.test(text)) return [{ id: 'locked' }];
      return [];
    });
    executeRaw = vi.fn().mockResolvedValue(0);
    transactionSpy = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prismaProxy),
    );
    cacheInvalidationService = {
      invalidate: vi.fn(),
      invalidateByTags: vi.fn(),
    };
    accessBootstrapCacheService = {
      invalidateForOrganization: vi.fn().mockResolvedValue(undefined),
    };
    prismaProxy = new Proxy(
      {},
      {
        get(_target, prop) {
          if (typeof prop !== 'string') {
            return undefined;
          }
          if (prop === '$transaction') {
            return transactionSpy;
          }
          if (prop === '$queryRaw') {
            return queryRaw;
          }
          if (prop === '$executeRaw') {
            return executeRaw;
          }
          return getDelegate(prop);
        },
      },
    );

    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    unscheduleWorkflow = vi.fn().mockResolvedValue(undefined);
    moduleRef = {
      get: vi.fn(() => ({ unscheduleWorkflow })),
    };

    service = new BrandRelocationService(
      prismaProxy as unknown as PrismaService,
      logger as unknown as LoggerService,
      cacheInvalidationService as unknown as CacheInvalidationService,
      accessBootstrapCacheService as unknown as AccessBootstrapCacheService,
      moduleRef as unknown as ModuleRef,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function primeBrand(currentOrg = SOURCE_ORG): void {
    getDelegate('brand').findFirst.mockResolvedValue({
      id: BRAND_ID,
      isDeleted: false,
      organizationId: currentOrg,
    });
    getDelegate('brand').findMany.mockResolvedValue([
      { id: BRAND_ID },
      { id: SOURCE_FALLBACK_BRAND_ID },
    ]);
    getDelegate('organization').findFirst.mockResolvedValue({ id: DEST_ORG });
  }

  // Brand read returns SOURCE_ORG first (pre-move), then the moved row (post-move).
  // Brand read returns SOURCE_ORG first (pre-move), then the moved row
  // (post-move) for every plain `{ id: brandId }`-shaped lookup. A
  // `{ id: { not: brandId } }`-shaped lookup is the last-brand fallback guard
  // (checked once outside the transaction, re-read once inside it) and always
  // resolves to a second, unrelated brand still in SOURCE_ORG — matched by
  // shape rather than call order, since the guard can run any number of times.
  function primeRelocatableBrand(): void {
    getDelegate('brand').findFirst.mockImplementation(
      async (args?: {
        where?: { id?: unknown; organizationId?: string; isDeleted?: boolean };
      }) => {
        const idFilter = args?.where?.id;
        if (idFilter && typeof idFilter === 'object' && 'not' in idFilter) {
          return {
            id: SOURCE_FALLBACK_BRAND_ID,
            isDeleted: false,
            organizationId: SOURCE_ORG,
          };
        }
        return args?.where?.isDeleted === false ||
          args?.where?.organizationId === SOURCE_ORG
          ? { id: BRAND_ID, isDeleted: false, organizationId: SOURCE_ORG }
          : { id: BRAND_ID, organizationId: DEST_ORG };
      },
    );
    getDelegate('brand').findMany.mockResolvedValue([
      { id: BRAND_ID },
      { id: SOURCE_FALLBACK_BRAND_ID },
    ]);
    getDelegate('organization').findFirst.mockResolvedValue({ id: DEST_ORG });
  }

  function mockBrandWorkflows(workflows: { id: string }[]): void {
    getDelegate('workflow').findMany.mockResolvedValue(workflows);
  }

  it('previews every non-zero resource type that will move with the brand', async () => {
    primeBrand();
    getDelegate('member').findMany.mockResolvedValue([{ id: 'member_1' }]);
    getDelegate('workflow').findMany.mockResolvedValue([{ id: 'wf_1' }]);
    getDelegate('workflow').count.mockResolvedValue(1);
    getDelegate('post').count.mockResolvedValue(4);
    getDelegate('workflowExecution').count.mockResolvedValue(2);

    const preview = await service.previewRelocation(BRAND_ID, DEST_ORG, {
      isSuperAdmin: true,
      userId: USER_ID,
    });

    expect(preview).toEqual({
      counts: {
        personasToReset: 0,
        schedulesToHold: 0,
        soleBrandWorkflows: 1,
        staleMembers: 1,
      },
      movingResources: [
        { count: 1, label: 'workflow', resource: 'workflow' },
        { count: 4, label: 'posts', resource: 'post' },
        {
          count: 2,
          label: 'workflow executions',
          resource: 'workflowExecution',
        },
      ],
      personasToReset: [],
      schedulesToHold: [],
    });
  });

  it.each([
    ['brandedGenerationReceipt', false],
    ['brandedGenerationReceipt', true],
    ['brandedGenerationReceiptEvent', false],
    ['brandedGenerationReceiptEvent', true],
  ] as const)(
    'refuses authorized preview and execution with %s history (deleted=%s)',
    async (delegate, isDeleted) => {
      primeBrand();
      getDelegate(delegate).findFirst.mockResolvedValue({
        id: 'saved-history',
        isDeleted,
      });
      const actor = { isSuperAdmin: true, userId: USER_ID };
      const conflict =
        'Cannot move a brand with saved generation history. Receipts and receipt events, including deleted records, must remain in their original organization.';
      await expect(
        service.previewRelocation(BRAND_ID, DEST_ORG, actor),
      ).rejects.toThrow(conflict);
      await expect(
        service.relocateToOrganization(
          BRAND_ID,
          { organizationId: DEST_ORG },
          actor,
        ),
      ).rejects.toThrow(conflict);
      for (const model of [
        'brandedGenerationReceipt',
        'brandedGenerationReceiptEvent',
      ]) {
        expect(getDelegate(model).findFirst).toHaveBeenCalledWith({
          where: { organizationId: SOURCE_ORG, brandId: BRAND_ID },
          select: { id: true },
        });
        expect(getDelegate(model).updateMany).not.toHaveBeenCalled();
      }
      expect(transactionSpy).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ isolationLevel: 'Serializable' }),
      );
      expect(getDelegate('brand').updateMany).not.toHaveBeenCalled();
      expect(cacheInvalidationService.invalidate).not.toHaveBeenCalled();
    },
  );

  for (const path of ['direct', 'ingredient'] as const) {
    for (const state of [
      'prepared',
      'submitting',
      'pending',
      'running',
      'provider-success',
      'provider-failed',
      'recovery-required',
      'finalized',
      'completed',
      'failed',
      'cancelled',
    ]) {
      it.each([false, true])(
        `refuses preview and relocation with ${path} ${state} Crun history (deleted=%s)`,
        async (isDeleted) => {
          primeBrand();
          getDelegate('ingredient').findMany.mockResolvedValue([
            { id: 'historical-ingredient' },
          ]);
          const row = {
            id: 'crun-history',
            organizationId: SOURCE_ORG,
            brandId: path === 'direct' ? BRAND_ID : null,
            ingredientId: 'historical-ingredient',
            isDeleted,
            state,
            fundingBinding: { kind: 'byok', organizationId: SOURCE_ORG },
            quoteSnapshot: { quoteId: 'immutable-quote' },
          };
          const before = JSON.stringify(row);
          getDelegate('crunGenerationTask').findFirst.mockResolvedValue(row);
          const actor = { isSuperAdmin: true, userId: USER_ID };
          await expect(
            service.previewRelocation(BRAND_ID, DEST_ORG, actor),
          ).rejects.toThrow(/retained Crun generation financial history/);
          await expect(
            service.relocateToOrganization(
              BRAND_ID,
              { organizationId: DEST_ORG },
              actor,
            ),
          ).rejects.toThrow(/retained Crun generation financial history/);
          expect(getDelegate('ingredient').findMany).toHaveBeenCalledWith({
            where: {
              organizationId: SOURCE_ORG,
              brandId: BRAND_ID,
            },
            select: { id: true },
          });
          expect(
            getDelegate('crunGenerationTask').findFirst,
          ).toHaveBeenCalledWith({
            where: {
              organizationId: SOURCE_ORG,
              OR: [
                { brandId: BRAND_ID },
                { ingredientId: { in: ['historical-ingredient'] } },
              ],
            },
            select: { id: true },
          });
          expect(transactionSpy).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({ isolationLevel: 'Serializable' }),
          );
          for (const name of [
            'creditBalance',
            'creditReservation',
            'creditTransaction',
            'crunGenerationTask',
            'ingredient',
            'brand',
          ])
            getDelegate(name);
          for (const delegate of delegates.values()) {
            expect(delegate.update).not.toHaveBeenCalled();
            expect(delegate.updateMany).not.toHaveBeenCalled();
            expect(delegate.create).not.toHaveBeenCalled();
          }
          expect(JSON.stringify(row)).toBe(before);
          expect(cacheInvalidationService.invalidate).not.toHaveBeenCalled();
        },
      );
    }
  }

  it('rechecks Crun history inside execution after an empty preview', async () => {
    primeBrand();
    const actor = { isSuperAdmin: true, userId: USER_ID };
    await expect(
      service.previewRelocation(BRAND_ID, DEST_ORG, actor),
    ).resolves.toBeDefined();
    transactionSpy.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        getDelegate('crunGenerationTask').findFirst.mockResolvedValue({
          id: 'new-task',
        });
        return fn(prismaProxy);
      },
    );
    await expect(
      service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        actor,
      ),
    ).rejects.toThrow(/retained Crun generation financial history/);
    expect(getDelegate('crunGenerationTask').findFirst).toHaveBeenCalledTimes(
      2,
    );
    expect(getDelegate('brand').updateMany).not.toHaveBeenCalled();
  });

  it('does not bypass same-organization behavior or inspect Crun history before authorization', async () => {
    primeBrand();
    getDelegate('crunGenerationTask').findFirst.mockResolvedValue({
      id: 'history',
    });
    await expect(
      service.previewRelocation(BRAND_ID, SOURCE_ORG, {
        isSuperAdmin: true,
        userId: USER_ID,
      }),
    ).resolves.toBeDefined();
    expect(getDelegate('crunGenerationTask').findFirst).not.toHaveBeenCalled();
    getDelegate('member').findFirst.mockResolvedValue(null);
    await expect(
      service.previewRelocation(BRAND_ID, DEST_ORG, {
        isSuperAdmin: false,
        userId: USER_ID,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(getDelegate('crunGenerationTask').findFirst).not.toHaveBeenCalled();
  });

  it('keeps same-organization ordinary patch unchanged despite Crun history', async () => {
    primeBrand();
    getDelegate('crunGenerationTask').findFirst.mockResolvedValue({
      id: 'history',
    });
    const patch = vi
      .fn()
      .mockResolvedValue({ id: BRAND_ID, organizationId: SOURCE_ORG });
    await expect(
      service.relocateToOrganization(
        BRAND_ID,
        { organizationId: SOURCE_ORG, label: 'Renamed' },
        { isSuperAdmin: true, userId: USER_ID },
        patch,
      ),
    ).resolves.toBeDefined();
    expect(patch).toHaveBeenCalledExactlyOnceWith({ label: 'Renamed' });
    expect(getDelegate('crunGenerationTask').findFirst).not.toHaveBeenCalled();
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it('rechecks history inside execution after a successful preview', async () => {
    primeBrand();
    const actor = { isSuperAdmin: true, userId: USER_ID };
    await expect(
      service.previewRelocation(BRAND_ID, DEST_ORG, actor),
    ).resolves.toBeDefined();
    transactionSpy.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        getDelegate('brandedGenerationReceipt').findFirst.mockResolvedValue({
          id: 'inserted-after-preview',
        });
        return fn(prismaProxy);
      },
    );
    await expect(
      service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        actor,
      ),
    ).rejects.toThrow(/saved generation history/);
    expect(
      getDelegate('brandedGenerationReceipt').findFirst,
    ).toHaveBeenCalledTimes(2);
    expect(getDelegate('brand').updateMany).not.toHaveBeenCalled();
    expect(cacheInvalidationService.invalidate).not.toHaveBeenCalled();
  });

  it('does not inspect generation history before preview authorization', async () => {
    primeBrand();
    getDelegate('member').findFirst.mockResolvedValue(null);
    await expect(
      service.previewRelocation(BRAND_ID, DEST_ORG, {
        isSuperAdmin: false,
        userId: USER_ID,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(
      getDelegate('brandedGenerationReceipt').findFirst,
    ).not.toHaveBeenCalled();
    expect(
      getDelegate('brandedGenerationReceiptEvent').findFirst,
    ).not.toHaveBeenCalled();
  });

  it('permits same-organization preview even when saved history exists', async () => {
    primeBrand();
    for (const model of [
      'brandedGenerationReceipt',
      'brandedGenerationReceiptEvent',
    ])
      getDelegate(model).findFirst.mockResolvedValue({ id: 'saved-history' });
    await expect(
      service.previewRelocation(BRAND_ID, SOURCE_ORG, {
        isSuperAdmin: true,
        userId: USER_ID,
      }),
    ).resolves.toBeDefined();
    expect(
      getDelegate('brandedGenerationReceipt').findFirst,
    ).not.toHaveBeenCalled();
    expect(
      getDelegate('brandedGenerationReceiptEvent').findFirst,
    ).not.toHaveBeenCalled();
  });

  it.each([
    ['knowledgeSource', false],
    ['knowledgeSource', true],
    ['knowledgeSpace', false],
    ['knowledgeSpace', true],
  ] as const)(
    'rejects preview and relocation with %s history (isDeleted=%s)',
    async (delegate, isDeleted) => {
      primeBrand();
      getDelegate(delegate).findFirst.mockResolvedValue({
        id: 'knowledge-history',
        isDeleted,
      });
      const actor = { isSuperAdmin: true, userId: USER_ID };
      await expect(
        service.previewRelocation(BRAND_ID, DEST_ORG, actor),
      ).rejects.toThrow(/Knowledge history/);
      await expect(
        service.relocateToOrganization(
          BRAND_ID,
          { organizationId: DEST_ORG },
          actor,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(getDelegate(delegate).findFirst).toHaveBeenCalledWith({
        where: { organizationId: SOURCE_ORG, brandId: BRAND_ID },
        select: { id: true },
      });
      expect(transactionSpy).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ isolationLevel: 'Serializable' }),
      );
      expect(getDelegate('brand').updateMany).not.toHaveBeenCalled();
      expect(cacheInvalidationService.invalidate).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['agentPublishAudit', false],
    ['agentPublishAudit', true],
    ['agentUntrustedContentAudit', false],
    ['agentUntrustedContentAudit', true],
  ] as const)(
    'rejects security audit history from %s (deleted=%s)',
    async (delegate, isDeleted) => {
      primeBrand();
      getDelegate(delegate).findFirst.mockResolvedValue({
        id: 'audit',
        isDeleted,
      });
      const actor = { isSuperAdmin: true, userId: USER_ID };
      await expect(
        service.previewRelocation(BRAND_ID, DEST_ORG, actor),
      ).rejects.toThrow(/security audit history/);
      await expect(
        service.relocateToOrganization(
          BRAND_ID,
          { organizationId: DEST_ORG },
          actor,
        ),
      ).rejects.toThrow(/security audit history/);
      expect(getDelegate('brand').updateMany).not.toHaveBeenCalled();
      expect(cacheInvalidationService.invalidate).not.toHaveBeenCalled();
    },
  );

  it('rejects preview and relocation until visual work has settled', async () => {
    primeBrand();
    getDelegate('visualRevision').findFirst.mockResolvedValue({
      id: 'visual-revision',
    });
    const actor = { isSuperAdmin: true, userId: USER_ID };
    await expect(
      service.previewRelocation(BRAND_ID, DEST_ORG, actor),
    ).rejects.toThrow(/unfinished visual work/);
    await expect(
      service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        actor,
      ),
    ).rejects.toThrow(/unfinished visual work/);
    expect(getDelegate('brand').updateMany).not.toHaveBeenCalled();
    expect(cacheInvalidationService.invalidate).not.toHaveBeenCalled();
  });

  it('rejects preview and relocation while the brand has an open live session', async () => {
    primeBrand();
    getDelegate('liveSession').findFirst.mockResolvedValue({ id: 'live-1' });
    const actor = { isSuperAdmin: true, userId: USER_ID };

    await expect(
      service.previewRelocation(BRAND_ID, DEST_ORG, actor),
    ).rejects.toThrow(/open live session/);
    await expect(
      service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(getDelegate('liveSession').findFirst).toHaveBeenCalledWith({
      where: {
        brandId: BRAND_ID,
        isDeleted: false,
        organizationId: SOURCE_ORG,
        status: 'OPEN',
      },
      select: { id: true },
    });
    expect(getDelegate('brand').updateMany).not.toHaveBeenCalled();
    expect(cacheInvalidationService.invalidate).not.toHaveBeenCalled();
  });

  it('does not relocate (or open a transaction) when the org is unchanged', async () => {
    getDelegate('brandedGenerationReceipt').findFirst.mockResolvedValue({
      id: 'saved-receipt',
    });
    getDelegate('brandedGenerationReceiptEvent').findFirst.mockResolvedValue({
      id: 'saved-event',
    });
    getDelegate('brand').findFirst.mockResolvedValue({
      id: BRAND_ID,
      isDeleted: false,
      organizationId: SOURCE_ORG,
    });

    await service.relocateToOrganization(
      BRAND_ID,
      { organizationId: SOURCE_ORG, label: 'Renamed' },
      { isSuperAdmin: false, userId: USER_ID },
    );

    expect(transactionSpy).not.toHaveBeenCalled();
    expect(
      getDelegate('brandedGenerationReceipt').findFirst,
    ).not.toHaveBeenCalled();
    expect(
      getDelegate('brandedGenerationReceiptEvent').findFirst,
    ).not.toHaveBeenCalled();
    expect(getDelegate('knowledgeSource').findFirst).not.toHaveBeenCalled();
    expect(getDelegate('knowledgeSpace').findFirst).not.toHaveBeenCalled();
    expect(getDelegate('agentPublishAudit').findFirst).not.toHaveBeenCalled();
    expect(
      getDelegate('agentUntrustedContentAudit').findFirst,
    ).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
    // Falls through to a normal field patch.
    expect(getDelegate('brand').update).toHaveBeenCalled();
  });

  it('throws NotFound when the destination organization does not exist', async () => {
    getDelegate('brand').findFirst.mockResolvedValue({
      id: BRAND_ID,
      isDeleted: false,
      organizationId: SOURCE_ORG,
    });
    getDelegate('organization').findFirst.mockResolvedValue(null);

    await expect(
      service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        { isSuperAdmin: true, userId: USER_ID },
      ),
    ).rejects.toThrow(/Organization/);
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it('forbids a non-superadmin who is not an active member of both orgs', async () => {
    primeBrand();
    getDelegate('member').findFirst.mockResolvedValue(null);

    await expect(
      service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        { isSuperAdmin: false, userId: USER_ID },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it('forbids a member whose role is not owner/admin in both orgs', async () => {
    primeBrand();
    getDelegate('member').findFirst.mockImplementation(
      (args: { where: { organizationId: string } }) =>
        Promise.resolve(
          args.where.organizationId === SOURCE_ORG
            ? { role: { key: 'owner' }, roleKey: 'owner' }
            : { role: { key: 'creator' }, roleKey: 'creator' },
        ),
    );

    await expect(
      service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        { isSuperAdmin: false, userId: USER_ID },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe('handle on relocation', () => {
    // Like primeRelocatableBrand, plus a handle lookup (`where.slug`) that
    // resolves to the brand holding it.
    function primeHandleHeldBy(holderId: string): void {
      primeRelocatableBrand();
      getDelegate('brand').findFirst.mockImplementation(
        async (args?: { where?: { id?: unknown; slug?: unknown } }) => {
          if (args?.where?.slug !== undefined) {
            return { id: holderId };
          }
          const idFilter = args?.where?.id;
          if (idFilter && typeof idFilter === 'object' && 'not' in idFilter) {
            return {
              id: SOURCE_FALLBACK_BRAND_ID,
              isDeleted: false,
              organizationId: SOURCE_ORG,
            };
          }
          return { id: BRAND_ID, isDeleted: false, organizationId: SOURCE_ORG };
        },
      );
    }

    it('authorizes the move before revealing whether a handle is taken', async () => {
      primeHandleHeldBy('brand_other');
      getDelegate('member').findFirst.mockResolvedValue(null);

      await expect(
        service.relocateToOrganization(
          BRAND_ID,
          { organizationId: DEST_ORG, slug: 'taken' },
          { isSuperAdmin: false, userId: USER_ID },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(getDelegate('brand').findFirst).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ slug: 'taken' }),
        }),
      );
    });

    it('rejects a handle another brand holds once the move is authorized', async () => {
      primeHandleHeldBy('brand_other');

      await expect(
        service.relocateToOrganization(
          BRAND_ID,
          { organizationId: DEST_ORG, slug: 'taken' },
          { isSuperAdmin: true, userId: USER_ID },
        ),
      ).rejects.toThrow('This handle is already taken.');
      expect(getDelegate('brand').findFirst).toHaveBeenCalledWith({
        select: { id: true },
        where: { id: { not: BRAND_ID }, slug: 'taken' },
      });
      expect(transactionSpy).not.toHaveBeenCalled();
    });
  });

  it("refuses to relocate an organization's only brand", async () => {
    // Identity lookup succeeds, but the fallback-guard query for a second,
    // non-deleted brand in SOURCE_ORG finds nothing — this is the org's last brand.
    getDelegate('brand').findFirst.mockImplementation(
      async (args?: { where?: { id?: unknown } }) => {
        const idFilter = args?.where?.id;
        if (idFilter && typeof idFilter === 'object' && 'not' in idFilter) {
          return null;
        }
        return { id: BRAND_ID, isDeleted: false, organizationId: SOURCE_ORG };
      },
    );
    getDelegate('organization').findFirst.mockResolvedValue({ id: DEST_ORG });

    await expect(
      service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        { isSuperAdmin: true, userId: USER_ID },
      ),
    ).rejects.toThrow(
      "Cannot move an organization's only brand to another organization.",
    );
    // Refused before any transaction opened — nothing moved, nothing invalidated.
    expect(transactionSpy).not.toHaveBeenCalled();
    expect(cacheInvalidationService.invalidate).not.toHaveBeenCalled();
  });

  it('cascades org across first- and second-order targets and invalidates both orgs', async () => {
    primeRelocatableBrand();
    // A moved Task exists → its TaskComment children must follow.
    getDelegate('task').findMany.mockResolvedValue([{ id: 'task_1' }]);
    // A moved social reply campaign exists → its recipients must follow.
    getDelegate('socialReplyCampaign').findMany.mockResolvedValue([
      { id: 'social_reply_campaign_1' },
    ]);

    const result = await service.relocateToOrganization(
      BRAND_ID,
      { organizationId: DEST_ORG },
      { isSuperAdmin: true, userId: USER_ID },
    );

    // Brand row moved.
    expect(getDelegate('brand').updateMany).toHaveBeenCalledWith({
      data: { organizationId: DEST_ORG },
      where: { id: BRAND_ID },
    });

    // Standard first-order target.
    expect(getDelegate('post').updateMany).toHaveBeenCalledWith({
      data: { organizationId: DEST_ORG },
      where: { brandId: BRAND_ID, organizationId: { not: DEST_ORG } },
    });
    for (const delegate of ['engagementRule', 'rssFeedItem', 'rssSource']) {
      expect(getDelegate(delegate).updateMany).toHaveBeenCalledWith({
        data: { organizationId: DEST_ORG },
        where: { brandId: BRAND_ID, organizationId: { not: DEST_ORG } },
      });
      expect(getDelegate(delegate).count).toHaveBeenCalledWith({
        where: { brandId: BRAND_ID, organizationId: { not: DEST_ORG } },
      });
    }

    for (const delegate of [
      'agentPublishAudit',
      'agentUntrustedContentAudit',
      'brandedGenerationReceipt',
      'brandedGenerationReceiptEvent',
    ]) {
      expect(getDelegate(delegate).updateMany).not.toHaveBeenCalled();
      expect(getDelegate(delegate).count).not.toHaveBeenCalled();
    }

    // Non-standard field names.
    expect(getDelegate('lead').updateMany).toHaveBeenCalledWith({
      data: { proactiveOrganizationId: DEST_ORG },
      where: {
        proactiveBrandId: BRAND_ID,
        proactiveOrganizationId: { not: DEST_ORG },
      },
    });
    expect(getDelegate('asset').updateMany).toHaveBeenCalledWith({
      data: { parentOrgId: DEST_ORG },
      where: { parentBrandId: BRAND_ID, parentOrgId: { not: DEST_ORG } },
    });

    // Second-order child followed its moved parent by scalar FK.
    expect(getDelegate('taskComment').updateMany).toHaveBeenCalledWith({
      data: { organizationId: DEST_ORG },
      where: {
        organizationId: { not: DEST_ORG },
        taskId: { in: ['task_1'] },
      },
    });
    expect(
      getDelegate('socialReplyCampaignRecipient').updateMany,
    ).toHaveBeenCalledWith({
      data: { organizationId: DEST_ORG },
      where: {
        campaignId: { in: ['social_reply_campaign_1'] },
        organizationId: { not: DEST_ORG },
      },
    });

    // Reassigned: source-org members' currentBrandId moved to the fallback
    // brand BEFORE the brand's own organizationId moved (#5219 — currentBrandId
    // is NOT NULL, so there is no "clear" step here, unlike the pre-#5219 sever).
    expect(getDelegate('member').updateMany).toHaveBeenCalledWith({
      data: { currentBrandId: SOURCE_FALLBACK_BRAND_ID },
      where: {
        currentBrandId: BRAND_ID,
        isDeleted: false,
        organizationId: SOURCE_ORG,
      },
    });
    expect(getDelegate('workflow').updateMany).toHaveBeenCalledWith({
      data: { defaultRecurringBrandId: null },
      where: { defaultRecurringBrandId: BRAND_ID },
    });

    // Auditor part A ran against every first-order target.
    for (const target of FIRST_ORDER_TARGETS) {
      expect(getDelegate(target.delegate).count).toHaveBeenCalled();
    }
    // Auditor part B scanned information_schema.
    expect(queryRaw).toHaveBeenCalled();

    // Both orgs' caches invalidated.
    const invalidatedKeys =
      cacheInvalidationService.invalidate.mock.calls.flat();
    expect(invalidatedKeys).toContain(`brands:list:${SOURCE_ORG}`);
    expect(invalidatedKeys).toContain(`brands:list:${DEST_ORG}`);
    expect(cacheInvalidationService.invalidateByTags).toHaveBeenCalledWith([
      'brands',
      `brand-ctx:${SOURCE_ORG}`,
      `brand-ctx:${DEST_ORG}`,
    ]);
    // Members of both orgs must see the move on their next bootstrap.
    expect(
      accessBootstrapCacheService.invalidateForOrganization,
    ).toHaveBeenCalledWith(SOURCE_ORG);
    expect(
      accessBootstrapCacheService.invalidateForOrganization,
    ).toHaveBeenCalledWith(DEST_ORG);

    expect(result).toEqual({
      brand: { id: BRAND_ID, organizationId: DEST_ORG },
      summary: EMPTY_RELOCATION_SUMMARY,
    });
  });

  // #5295: `isDeleted` is deliberately absent from RELOCATION_PASSTHROUGH_FIELDS.
  // Co-patching it here would soft-delete the brand as part of a relocation,
  // bypassing BrandsService.remove()'s last-brand guard and member
  // reassignment entirely. Soft delete only goes through remove().
  it('never co-patches isDeleted through the relocation passthrough', async () => {
    primeRelocatableBrand();

    await service.relocateToOrganization(
      BRAND_ID,
      { isDeleted: true, organizationId: DEST_ORG } as never,
      { isSuperAdmin: true, userId: USER_ID },
    );

    expect(getDelegate('brand').updateMany).toHaveBeenCalledWith({
      data: { organizationId: DEST_ORG },
      where: { id: BRAND_ID },
    });
  });

  it('moves a sole-brand workflow and its execution history with the brand', async () => {
    primeRelocatableBrand();
    mockBrandWorkflows([{ id: 'wf_sole' }]);

    await service.relocateToOrganization(
      BRAND_ID,
      { organizationId: DEST_ORG },
      { isSuperAdmin: true, userId: USER_ID },
    );

    // Workflow definition is re-homed once through the first-order brand cascade.
    expect(getDelegate('workflow').updateMany).toHaveBeenCalledWith({
      data: { organizationId: DEST_ORG },
      where: { brandId: BRAND_ID, organizationId: { not: DEST_ORG } },
    });
    expect(getDelegate('workflow').updateMany).not.toHaveBeenCalledWith({
      data: { organizationId: DEST_ORG },
      where: { id: { in: ['wf_sole'] }, organizationId: { not: DEST_ORG } },
    });
    // Org-keyed execution history followed the workflow.
    expect(getDelegate('workflowExecution').updateMany).toHaveBeenCalledWith({
      data: { organizationId: DEST_ORG },
      where: {
        organizationId: { not: DEST_ORG },
        workflowId: { in: ['wf_sole'] },
      },
    });
    // A moved workflow keeps its brand link (never disconnected)...
    expect(getDelegate('brand').update).not.toHaveBeenCalled();
    // ...and keeps its default-recurring marker (excluded from the null-out).
    expect(getDelegate('workflow').updateMany).toHaveBeenCalledWith({
      data: { defaultRecurringBrandId: null },
      where: { defaultRecurringBrandId: BRAND_ID, id: { notIn: ['wf_sole'] } },
    });
  });

  it('moves brand-owned workflows without cloning', async () => {
    primeRelocatableBrand();
    mockBrandWorkflows([{ id: 'wf_owned' }]);

    const result = await service.relocateToOrganization(
      BRAND_ID,
      { organizationId: DEST_ORG },
      { isSuperAdmin: true, userId: USER_ID },
    );

    expect(getDelegate('workflow').create).not.toHaveBeenCalled();
    // Workflow definition is re-homed through the first-order brand cascade
    // (matched by brandId, not a precomputed id list — see the sibling test above).
    expect(getDelegate('workflow').updateMany).toHaveBeenCalledWith({
      data: { organizationId: DEST_ORG },
      where: { brandId: BRAND_ID, organizationId: { not: DEST_ORG } },
    });
    expect(result.summary).toEqual({
      ...EMPTY_RELOCATION_SUMMARY,
      workflowsMoved: 1,
    });
  });

  it('retries the relocation transaction once on a P2034 serialization failure', async () => {
    primeRelocatableBrand();
    mockBrandWorkflows([]);
    let attempt = 0;
    transactionSpy.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        attempt += 1;
        if (attempt === 1) {
          throw new Prisma.PrismaClientKnownRequestError(
            'serialization failure',
            {
              clientVersion: 'test',
              code: 'P2034',
            },
          );
        }
        return fn(prismaProxy);
      },
    );

    const result = await service.relocateToOrganization(
      BRAND_ID,
      { organizationId: DEST_ORG },
      { isSuperAdmin: true, userId: USER_ID },
    );

    expect(transactionSpy).toHaveBeenCalledTimes(2);
    expect(result.summary).toEqual(EMPTY_RELOCATION_SUMMARY);
  });

  it('rolls back when a brand-linked workflow/member is left stranded in the source org', async () => {
    primeRelocatableBrand();
    mockBrandWorkflows([]);
    // The post-state backstop finds a live workflow for the moved brand that still
    // has the source organization id.
    getDelegate('workflow').count.mockImplementation(
      (args: { where?: { brandId?: string } }) =>
        Promise.resolve(args.where?.brandId === BRAND_ID ? 1 : 0),
    );

    await expect(
      service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        { isSuperAdmin: true, userId: USER_ID },
      ),
    ).rejects.toThrow(/cross-org association/);
    // Aborted → caches untouched.
    expect(cacheInvalidationService.invalidate).not.toHaveBeenCalled();
  });

  it('rolls back when a moved workflow still has the source organization id', async () => {
    primeRelocatableBrand();
    mockBrandWorkflows([{ id: 'wf_sole' }]);
    // Post-move recheck: the moved workflow is scoped by `id: { in: [...] }`
    // and still has the source organization id.
    getDelegate('workflow').count.mockImplementation(
      (args: { where?: { id?: unknown } }) =>
        Promise.resolve(args.where?.id ? 1 : 0),
    );

    await expect(
      service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        { isSuperAdmin: true, userId: USER_ID },
      ),
    ).rejects.toThrow(/cross-org association/);
    expect(cacheInvalidationService.invalidate).not.toHaveBeenCalled();
  });

  it('translates a P2002 unique violation into a ConflictException', async () => {
    primeBrand();
    getDelegate('brand').updateMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        clientVersion: 'test',
        code: 'P2002',
        meta: {
          target: ['organizationId', 'platform', 'externalConversationId'],
        },
      }),
    );

    await expect(
      service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        { isSuperAdmin: true, userId: USER_ID },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(cacheInvalidationService.invalidate).not.toHaveBeenCalled();
  });

  it('rolls back (throws) when the orphan auditor finds a stale row', async () => {
    primeBrand();
    // A first-order table still reports rows in the old org after the cascade.
    getDelegate('post').count.mockResolvedValue(3);

    await expect(
      service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        { isSuperAdmin: true, userId: USER_ID },
      ),
    ).rejects.toThrow(/left stale organization id/);
    // Move aborted → caches untouched.
    expect(cacheInvalidationService.invalidate).not.toHaveBeenCalled();
  });

  it('blocks the move when an unhandled dual-keyed table would be orphaned', async () => {
    primeBrand();
    queryRaw.mockImplementation(
      (statement: TemplateStringsArray | Prisma.Sql) => {
        const sql = Array.isArray(statement)
          ? statement.join('')
          : (statement as Prisma.Sql).sql;
        if (sql.includes('AS retained'))
          return Promise.resolve([{ retained: false }]);
        if (sql.includes('hasOpenHold'))
          return Promise.resolve([{ hasOpenHold: false }]);
        if (sql.includes('pg_constraint')) return Promise.resolve([]);
        if (/FOR (NO KEY )?UPDATE/.test(sql))
          return Promise.resolve([{ id: 'locked' }]);
        if (sql.includes('information_schema')) {
          return Promise.resolve([
            {
              brand_col: 'brand_id',
              org_col: 'organization_id',
              table_name: 'future_table',
            },
          ]);
        }
        // Per-table orphan count for the unknown table.
        return Promise.resolve([{ n: 5 }]);
      },
    );

    await expect(
      service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        { isSuperAdmin: true, userId: USER_ID },
      ),
    ).rejects.toThrow(/unhandled dual-keyed table/);
  });

  it('keeps first- and second-order target lists non-empty (guard against empty config)', () => {
    expect(FIRST_ORDER_TARGETS.length).toBeGreaterThan(40);
    expect(SECOND_ORDER_TARGETS.length).toBeGreaterThan(0);
  });
  it('retained publication-before-capture history blocks the actual relocation before any cascade or cache', async () => {
    primeRelocatableBrand();
    getDelegate('publishApproval').findFirst.mockResolvedValue({
      id: 'publication-proof',
    });
    await expect(
      service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        { isSuperAdmin: true, userId: USER_ID },
      ),
    ).rejects.toThrow(/saved learning or publication history/);
    expect(getDelegate('brand').update).not.toHaveBeenCalled();
    expect(getDelegate('member').updateMany).not.toHaveBeenCalled();
    expect(cacheInvalidationService.invalidate).not.toHaveBeenCalled();
    expect(getDelegate('publishApproval').findFirst).toHaveBeenCalledWith({
      where: { organizationId: SOURCE_ORG, brandId: BRAND_ID },
      select: { id: true },
    });
  });
  it('rechecks both elevated memberships inside the source transaction after the fence and refuses revocation', async () => {
    primeRelocatableBrand();
    getDelegate('member')
      .findFirst.mockResolvedValueOnce({ role: { key: 'owner' } })
      .mockResolvedValueOnce({ role: { key: 'admin' } })
      .mockResolvedValue(null);
    await expect(
      service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        { isSuperAdmin: false, userId: USER_ID },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transactionSpy).toHaveBeenCalledTimes(1);
    expect(getDelegate('brand').update).not.toHaveBeenCalled();
    expect(cacheInvalidationService.invalidate).not.toHaveBeenCalled();
    expect(queryRaw.mock.calls[0][0].join(' ')).toContain(
      'pg_advisory_xact_lock',
    );
  });
  it('authorizes from the assigned role, not a stale denormalized roleKey', async () => {
    primeRelocatableBrand();
    // Demoted through roleId; the Better Auth roleKey copy still says owner.
    getDelegate('member').findFirst.mockResolvedValue({
      role: { key: 'user' },
      roleKey: 'owner',
    });
    await expect(
      service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        { isSuperAdmin: false, userId: USER_ID },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transactionSpy).not.toHaveBeenCalled();
  });
  it('same-org deactivation without facade callback uses the learning source owner protocol', async () => {
    primeBrand();
    getDelegate('brand').update.mockResolvedValue({
      id: BRAND_ID,
      organizationId: SOURCE_ORG,
      isDeleted: false,
      isActive: false,
    });
    await service.relocateToOrganization(
      BRAND_ID,
      { organizationId: SOURCE_ORG, isActive: false },
      { isSuperAdmin: true, userId: USER_ID },
    );
    expect(transactionSpy).toHaveBeenCalledTimes(1);
    expect(
      getDelegate('contentLearningDependency').findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sourceKind: 'brand',
          sourceId: BRAND_ID,
          sourceOrganizationId: SOURCE_ORG,
          isDeleted: false,
        },
      }),
    );
    expect(getDelegate('publishApproval').findFirst).not.toHaveBeenCalled();
  });
  describe('in-flight work (#6689)', () => {
    const actor = { isSuperAdmin: true, userId: USER_ID };

    const blockers: Array<{
      name: string;
      arrange: () => void;
      message: RegExp;
    }> = [
      {
        name: 'a running or pending execution',
        arrange: () =>
          getDelegate('workflowExecution').findFirst.mockResolvedValue({
            id: 'execution_1',
          }),
        message: /running or pending workflow executions/,
      },
      {
        name: 'an unfinished node continuation',
        arrange: () =>
          getDelegate('workflowNodeContinuation').findFirst.mockResolvedValue({
            id: 'continuation_1',
          }),
        message: /running or pending workflow executions/,
      },
      {
        name: 'an open credit hold',
        arrange: () =>
          queryRaw.mockImplementation(
            async (statement: TemplateStringsArray | Prisma.Sql) => {
              const text = Array.isArray(statement)
                ? statement.join('')
                : (statement as Prisma.Sql).sql;
              if (text.includes('AS retained')) return [{ retained: false }];
              if (text.includes('hasOpenHold')) return [{ hasOpenHold: true }];
              return [{ id: 'locked' }];
            },
          ),
        message: /open credit holds/,
      },
      {
        name: 'an unresolved provider publish receipt',
        arrange: () =>
          getDelegate('postProviderPublishReceipt').findFirst.mockResolvedValue(
            { id: 'receipt_1' },
          ),
        message: /provider publish/,
      },
      {
        name: 'an in-flight Turbo run',
        arrange: () =>
          getDelegate('turboRun').findFirst.mockResolvedValue({ id: 'run_1' }),
        message: /Turbo run in progress/,
      },
      {
        name: 'a planned breakout response',
        arrange: () =>
          getDelegate('breakoutResponse').findFirst.mockResolvedValue({
            id: 'response_1',
          }),
        message: /breakout responses in progress/,
      },
      {
        name: 'a reserved breakout output',
        arrange: () =>
          getDelegate('breakoutResponseOutput').findFirst.mockResolvedValue({
            id: 'output_1',
          }),
        message: /breakout responses in progress/,
      },
      {
        name: 'execution read-scope history',
        arrange: () =>
          getDelegate('workflowExecutionReadScope').findFirst.mockResolvedValue(
            { executionId: 'execution_1' },
          ),
        message: /execution authorization history/,
      },
      {
        name: 'a read-scope brand dependency',
        arrange: () =>
          getDelegate(
            'workflowExecutionReadBrandDependency',
          ).findFirst.mockResolvedValue({ executionId: 'execution_1' }),
        message: /execution authorization history/,
      },
    ];

    it.each(blockers)(
      'answers 409 with no partial move while the brand has $name',
      async ({ arrange, message }) => {
        primeRelocatableBrand();
        getDelegate('workflow').findMany.mockResolvedValue([
          {
            id: 'wf_1',
            isScheduleEnabled: true,
            scheduleInitiatingActor: { userId: 'someone' },
          },
        ]);
        arrange();

        await expect(
          service.previewRelocation(BRAND_ID, DEST_ORG, actor),
        ).rejects.toThrow(message);
        // The guard's own message reaches the caller, not a generic remap.
        const failure = await service
          .relocateToOrganization(BRAND_ID, { organizationId: DEST_ORG }, actor)
          .catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(ConflictException);
        expect((failure as ConflictException).message).toMatch(message);

        // The guards run first: no schedule paused, no grant revoked, nothing
        // rewritten, nothing unscheduled, no cache touched.
        for (const delegate of delegates.values()) {
          expect(delegate.update).not.toHaveBeenCalled();
          expect(delegate.updateMany).not.toHaveBeenCalled();
          expect(delegate.create).not.toHaveBeenCalled();
        }
        expect(unscheduleWorkflow).not.toHaveBeenCalled();
        expect(cacheInvalidationService.invalidate).not.toHaveBeenCalled();
      },
    );

    it('scopes each guard to the source organization and the brand', async () => {
      primeRelocatableBrand();
      await service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        actor,
      );

      expect(getDelegate('workflowExecution').findFirst).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          isDeleted: false,
          organizationId: SOURCE_ORG,
          status: { in: ['PENDING', 'RUNNING'] },
          workflow: { brandId: BRAND_ID },
        },
      });
      expect(
        getDelegate('postProviderPublishReceipt').findFirst,
      ).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          isDeleted: false,
          organizationId: SOURCE_ORG,
          post: { brandId: BRAND_ID },
          status: { in: ['attempting', 'uncertain'] },
        },
      });
      expect(getDelegate('turboRun').findFirst).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          brandId: BRAND_ID,
          isDeleted: false,
          organizationId: SOURCE_ORG,
          status: { in: ['PENDING', 'PROCESSING'] },
        },
      });
    });
  });

  describe('schedules and actors on relocation (#6689)', () => {
    const actor = { isSuperAdmin: true, userId: USER_ID };
    const BOUND = { organizationId: SOURCE_ORG, userId: 'saved-by' };

    function mockScheduledWorkflows(): void {
      const daily = {
        id: 'wf_a',
        isDeleted: false,
        isScheduleEnabled: true,
        label: 'Daily post',
        schedule: '0 9 * * *',
        timezone: 'Europe/Berlin',
      };
      getDelegate('workflow').findMany.mockImplementation(
        async (args: { select?: Record<string, boolean> }) => {
          if (args.select?.scheduleInitiatingActor) {
            return [
              { ...daily, scheduleInitiatingActor: BOUND },
              // Paused earlier but still carrying its old binding.
              {
                ...daily,
                id: 'wf_b',
                isScheduleEnabled: false,
                scheduleInitiatingActor: BOUND,
              },
              {
                ...daily,
                id: 'wf_c',
                isScheduleEnabled: false,
                scheduleInitiatingActor: null,
              },
            ];
          }
          if (args.select?.schedule) {
            return [daily];
          }
          return [{ id: 'wf_a' }];
        },
      );
    }

    it('clears the actor and pauses the schedule in the same transaction, keeping cron and timezone', async () => {
      primeRelocatableBrand();
      mockScheduledWorkflows();

      await service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        actor,
      );

      const holdCall = getDelegate('workflow').updateMany.mock.calls.findIndex(
        ([args]) => 'scheduleInitiatingActor' in (args.data ?? {}),
      );
      expect(holdCall).toBeGreaterThanOrEqual(0);
      const [hold] = getDelegate('workflow').updateMany.mock.calls[holdCall];
      expect(hold).toEqual({
        data: {
          isScheduleEnabled: false,
          scheduleInitiatingActor: Prisma.DbNull,
        },
        where: { id: { in: ['wf_a', 'wf_b'] } },
      });
      // Only the binding and the flag change.
      expect(Object.keys(hold.data).sort()).toEqual([
        'isScheduleEnabled',
        'scheduleInitiatingActor',
      ]);
      // The org-keyed cascade has not run yet: the actor belongs to the source.
      expect(
        getDelegate('workflow').updateMany.mock.invocationCallOrder[holdCall],
      ).toBeLessThan(
        getDelegate('brand').updateMany.mock.invocationCallOrder[0],
      );
    });

    it('removes each queued scheduler job only after the transaction commits', async () => {
      primeRelocatableBrand();
      mockScheduledWorkflows();
      const order: string[] = [];
      transactionSpy.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const result = await fn(prismaProxy);
          order.push('committed');
          return result;
        },
      );
      unscheduleWorkflow.mockImplementation(async (workflowId: string) => {
        order.push(`unschedule:${workflowId}`);
      });

      await service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        actor,
      );

      expect(order).toEqual([
        'committed',
        'unschedule:wf_a',
        'unschedule:wf_b',
      ]);
    });

    it('reports real counts in the summary', async () => {
      primeRelocatableBrand();
      mockScheduledWorkflows();

      const { summary } = await service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        actor,
      );

      expect(summary).toEqual({
        ...EMPTY_RELOCATION_SUMMARY,
        schedulesHeld: 1,
        workflowsMoved: 1,
      });
    });

    it('lists in the preview exactly the schedules the move pauses', async () => {
      primeRelocatableBrand();
      mockScheduledWorkflows();

      const preview = await service.previewRelocation(
        BRAND_ID,
        DEST_ORG,
        actor,
      );
      // Reading the preview pauses and unschedules nothing.
      expect(unscheduleWorkflow).not.toHaveBeenCalled();
      expect(
        getDelegate('workflow').updateMany.mock.calls.filter(
          ([args]) => 'scheduleInitiatingActor' in (args.data ?? {}),
        ),
      ).toHaveLength(0);

      const { summary } = await service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        actor,
      );

      expect(preview.schedulesToHold).toEqual([
        {
          id: 'wf_a',
          label: 'Daily post',
          schedule: '0 9 * * *',
          timezone: 'Europe/Berlin',
        },
      ]);
      expect(preview.counts.schedulesToHold).toBe(summary.schedulesHeld);
    });

    it('counts jobs it cannot confirm removed instead of failing the committed move', async () => {
      primeRelocatableBrand();
      mockScheduledWorkflows();
      unscheduleWorkflow.mockRejectedValue(new Error('redis down'));

      const { summary } = await service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        actor,
      );

      expect(summary.schedulesHeld).toBe(1);
      expect(summary.schedulingPending).toBe(2);
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to unschedule a workflow after relocation',
        expect.objectContaining({ workflowId: 'wf_a' }),
      );
    });

    it('reports every held job as pending when the scheduler cannot be resolved', async () => {
      primeRelocatableBrand();
      mockScheduledWorkflows();
      moduleRef.get.mockImplementation(() => {
        throw new Error('not registered');
      });

      const { summary } = await service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        actor,
      );

      expect(summary.schedulingPending).toBe(2);
    });

    it('never fails a committed move because the cache cannot be invalidated', async () => {
      primeRelocatableBrand();
      cacheInvalidationService.invalidate.mockRejectedValue(
        new Error('redis down'),
      );

      await expect(
        service.relocateToOrganization(
          BRAND_ID,
          { organizationId: DEST_ORG },
          actor,
        ),
      ).resolves.toMatchObject({ brand: { organizationId: DEST_ORG } });
      expect(logger.warn).toHaveBeenCalledWith(
        'Brand relocation cache invalidation failed',
        expect.objectContaining({ brandId: BRAND_ID }),
      );
    });
  });

  describe('persona grants on relocation (#6689)', () => {
    it('revokes active grants on the moved brand personas before the cascade rewrites their organization', async () => {
      primeRelocatableBrand();
      getDelegate('persona').findMany.mockResolvedValueOnce([
        { id: 'persona_1' },
      ]);
      getDelegate('personaGrant').findMany.mockResolvedValue([
        {
          availabilityMode: 'ALL_BRANDS',
          availableBrandIds: [],
          id: 'grant_1',
          personaId: 'persona_1',
          recipientOrganizationId: 'org_recipient',
        },
      ]);
      getDelegate('personaGrant').updateMany.mockResolvedValue({ count: 1 });

      const { summary } = await service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        { isSuperAdmin: true, userId: USER_ID },
      );

      expect(getDelegate('personaGrant').updateMany).toHaveBeenCalledWith({
        data: { revokedAt: expect.any(Date), revokedByUserId: USER_ID },
        where: {
          id: { in: ['grant_1'] },
          ownerOrganizationId: SOURCE_ORG,
          revokedAt: null,
        },
      });
      expect(getDelegate('personaGrantAudit').createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            action: 'revoked',
            actorUserId: USER_ID,
            grantId: 'grant_1',
            ownerOrganizationId: SOURCE_ORG,
            personaId: 'persona_1',
            recipientOrganizationId: 'org_recipient',
          }),
        ],
      });
      expect(summary.personaGrantsRevoked).toBe(1);
      expect(
        getDelegate('personaGrant').updateMany.mock.invocationCallOrder[0],
      ).toBeLessThan(
        getDelegate('persona').updateMany.mock.invocationCallOrder[0],
      );
    });
  });

  describe('persona sharing on relocation (#6689)', () => {
    const actor = { isSuperAdmin: true, userId: USER_ID };
    const sharedPersonas = [
      {
        availabilityMode: 'ALL_BRANDS',
        availableBrandIds: [],
        handle: 'mira',
        id: 'persona_all',
        label: 'Mira',
      },
      {
        availabilityMode: 'SELECTED_BRANDS',
        availableBrandIds: ['brand_x', 'brand_y'],
        handle: null,
        id: 'persona_list',
        label: 'Kai',
      },
    ];

    // The grant revocation reads the brand's personas by id; the sharing read
    // is the one that filters on availability.
    function mockSharedPersonas(rows: unknown[] = sharedPersonas): void {
      getDelegate('persona').findMany.mockImplementation(
        async (args?: { where?: { OR?: unknown } }) =>
          args?.where?.OR ? rows : [],
      );
    }

    function sharingResets() {
      return getDelegate('persona').updateMany.mock.calls.filter(
        ([args]) => 'availabilityMode' in (args.data ?? {}),
      );
    }

    it('resets an all-brands character and a listed character to the owning brand with the list cleared', async () => {
      primeRelocatableBrand();
      mockSharedPersonas();

      const { summary } = await service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        actor,
      );

      expect(sharingResets()).toEqual([
        [
          {
            data: { availabilityMode: 'OWNING_BRAND', availableBrandIds: [] },
            where: {
              brandId: BRAND_ID,
              id: { in: ['persona_all', 'persona_list'] },
              isDeleted: false,
              organizationId: SOURCE_ORG,
            },
          },
        ],
      ]);
      expect(getDelegate('persona').findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            brandId: BRAND_ID,
            isDeleted: false,
            OR: [
              { availabilityMode: { not: 'OWNING_BRAND' } },
              { availableBrandIds: { isEmpty: false } },
            ],
            organizationId: SOURCE_ORG,
          },
        }),
      );
      expect(summary.personasSharingReset).toBe(2);
    });

    it('audits each change under the source organization with the previous sharing', async () => {
      primeRelocatableBrand();
      mockSharedPersonas();

      await service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        actor,
      );

      expect(
        getDelegate('personaAvailabilityAudit').createMany,
      ).toHaveBeenCalledWith({
        data: [
          {
            actorUserId: USER_ID,
            newBrandIds: [],
            newMode: 'OWNING_BRAND',
            organizationId: SOURCE_ORG,
            personaId: 'persona_all',
            previousBrandIds: [],
            previousMode: 'ALL_BRANDS',
          },
          {
            actorUserId: USER_ID,
            newBrandIds: [],
            newMode: 'OWNING_BRAND',
            organizationId: SOURCE_ORG,
            personaId: 'persona_list',
            previousBrandIds: ['brand_x', 'brand_y'],
            previousMode: 'SELECTED_BRANDS',
          },
        ],
      });
    });

    it('resets the sharing before the cascade rewrites the organization', async () => {
      primeRelocatableBrand();
      mockSharedPersonas();

      await service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        actor,
      );

      const calls = getDelegate('persona').updateMany.mock.calls;
      const resetCall = calls.findIndex(
        ([args]) => 'availabilityMode' in (args.data ?? {}),
      );
      const cascadeCall = calls.findIndex(
        ([args]) => args.data?.organizationId === DEST_ORG,
      );
      expect(resetCall).toBeGreaterThanOrEqual(0);
      expect(cascadeCall).toBeGreaterThan(resetCall);
    });

    it('leaves the characters untouched when none is shared beyond the brand', async () => {
      primeRelocatableBrand();
      mockSharedPersonas([]);

      const { summary } = await service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        actor,
      );

      expect(sharingResets()).toHaveLength(0);
      expect(
        getDelegate('personaAvailabilityAudit').createMany,
      ).not.toHaveBeenCalled();
      expect(summary.personasSharingReset).toBe(0);
    });

    it('records the system actor when the move has no user id', async () => {
      primeRelocatableBrand();
      mockSharedPersonas([sharedPersonas[0]]);

      await service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        { isSuperAdmin: true, userId: '' },
      );

      expect(
        getDelegate('personaAvailabilityAudit').createMany,
      ).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ actorUserId: 'system:brand-relocation' }),
        ],
      });
    });

    it('aborts the move before the cascade when the reset fails', async () => {
      primeRelocatableBrand();
      mockSharedPersonas();
      getDelegate('persona').updateMany.mockRejectedValueOnce(
        new Error('write failed'),
      );

      await expect(
        service.relocateToOrganization(
          BRAND_ID,
          { organizationId: DEST_ORG },
          actor,
        ),
      ).rejects.toThrow('write failed');
      expect(getDelegate('brand').updateMany).not.toHaveBeenCalled();
    });

    it('lists in the preview exactly the characters the move resets, without changing anything', async () => {
      primeRelocatableBrand();
      mockSharedPersonas();

      const preview = await service.previewRelocation(
        BRAND_ID,
        DEST_ORG,
        actor,
      );
      expect(sharingResets()).toHaveLength(0);
      expect(
        getDelegate('personaAvailabilityAudit').createMany,
      ).not.toHaveBeenCalled();

      const { summary } = await service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        actor,
      );

      expect(preview.personasToReset).toEqual([
        {
          availabilityMode: 'ALL_BRANDS',
          availableBrandCount: 0,
          handle: 'mira',
          id: 'persona_all',
          label: 'Mira',
        },
        {
          availabilityMode: 'SELECTED_BRANDS',
          availableBrandCount: 2,
          handle: null,
          id: 'persona_list',
          label: 'Kai',
        },
      ]);
      expect(preview.counts.personasToReset).toBe(summary.personasSharingReset);
    });
  });

  describe('API key authority (#6689)', () => {
    const owner = { role: { key: 'owner' }, roleKey: 'owner' };

    it.each([
      ['no scopes', undefined],
      ['read scope only', ['read']],
    ])(
      'denies a key with %s before anything is read or moved',
      async (_name, scopes) => {
        primeRelocatableBrand();
        getDelegate('member').findFirst.mockResolvedValue(owner);
        const keyActor = {
          isApiKey: true,
          isSuperAdmin: false,
          scopes,
          userId: USER_ID,
        };

        await expect(
          service.relocateToOrganization(
            BRAND_ID,
            { organizationId: DEST_ORG },
            keyActor,
          ),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
          service.previewRelocation(BRAND_ID, DEST_ORG, keyActor),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(transactionSpy).not.toHaveBeenCalled();
      },
    );

    it('denies a superadmin issuer whose key lacks the admin scope', async () => {
      primeRelocatableBrand();

      await expect(
        service.relocateToOrganization(
          BRAND_ID,
          { organizationId: DEST_ORG },
          { isApiKey: true, isSuperAdmin: true, scopes: [], userId: USER_ID },
        ),
      ).rejects.toThrow(/requires the admin scope/);
      expect(transactionSpy).not.toHaveBeenCalled();
    });

    it('lets a key with the explicit admin scope relocate as its issuer would', async () => {
      primeRelocatableBrand();
      getDelegate('member').findFirst.mockResolvedValue(owner);

      await expect(
        service.relocateToOrganization(
          BRAND_ID,
          { organizationId: DEST_ORG },
          {
            isApiKey: true,
            isSuperAdmin: false,
            scopes: ['admin'],
            userId: USER_ID,
          },
        ),
      ).resolves.toMatchObject({ brand: { organizationId: DEST_ORG } });
    });

    it('leaves a session login, which carries no key scopes, unchanged', async () => {
      primeRelocatableBrand();
      getDelegate('member').findFirst.mockResolvedValue(owner);

      await expect(
        service.relocateToOrganization(
          BRAND_ID,
          { organizationId: DEST_ORG },
          { isSuperAdmin: false, userId: USER_ID },
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('org-only children of a moved parent (#6689)', () => {
    it('moves versions, executor rows, thread rows and publish receipts with their parent', async () => {
      primeRelocatableBrand();
      getDelegate('workflow').findMany.mockResolvedValue([{ id: 'wf_1' }]);
      getDelegate('workflowExecution').findMany.mockResolvedValue([
        { id: 'execution_1' },
      ]);
      getDelegate('agentThread').findMany.mockResolvedValue([
        { id: 'thread_1' },
      ]);
      getDelegate('post').findMany.mockResolvedValue([{ id: 'post_1' }]);

      await service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        { isSuperAdmin: true, userId: USER_ID },
      );

      const expectations: Array<[string, string, string]> = [
        ['workflowVersion', 'workflowId', 'wf_1'],
        ['workflowExecutionNodeResult', 'executionId', 'execution_1'],
        ['workflowArtifact', 'executionId', 'execution_1'],
        ['workflowNodeClaim', 'executionId', 'execution_1'],
        ['workflowNodeContinuation', 'executionId', 'execution_1'],
        ['agentThreadEvent', 'threadId', 'thread_1'],
        ['agentThreadSnapshot', 'threadId', 'thread_1'],
        ['threadContextState', 'threadId', 'thread_1'],
        ['postProviderPublishReceipt', 'postId', 'post_1'],
        ['postPublishFinalization', 'postId', 'post_1'],
      ];
      for (const [delegate, foreignKey, parentId] of expectations) {
        expect(getDelegate(delegate).updateMany).toHaveBeenCalledWith({
          data: { organizationId: DEST_ORG },
          where: {
            [foreignKey]: { in: [parentId] },
            organizationId: { not: DEST_ORG },
          },
        });
      }
      // An execution has no brand key: it is found through its workflow.
      expect(getDelegate('workflowExecution').findMany).toHaveBeenCalledWith({
        select: { id: true },
        where: { workflow: { brandId: BRAND_ID } },
      });
    });

    it('rolls the move back when a configured org-only child keeps the source organization', async () => {
      primeRelocatableBrand();
      getDelegate('workflowExecution').findMany.mockResolvedValue([
        { id: 'execution_1' },
      ]);
      getDelegate('workflowNodeClaim').count.mockResolvedValue(2);

      await expect(
        service.relocateToOrganization(
          BRAND_ID,
          { organizationId: DEST_ORG },
          { isSuperAdmin: true, userId: USER_ID },
        ),
      ).rejects.toThrow(/stale organization id on workflowNodeClaim \(2\)/);
      expect(cacheInvalidationService.invalidate).not.toHaveBeenCalled();
    });

    it('rolls the move back when the catalog shows an unconfigured org-only child', async () => {
      primeRelocatableBrand();
      queryRaw.mockImplementation(
        async (statement: TemplateStringsArray | Prisma.Sql) => {
          const text = Array.isArray(statement)
            ? statement.join('')
            : (statement as Prisma.Sql).sql;
          if (text.includes('AS retained')) return [{ retained: false }];
          if (text.includes('hasOpenHold')) return [{ hasOpenHold: false }];
          if (text.includes('pg_constraint'))
            return [
              {
                child_table: 'future_children',
                fk_column: 'postId',
                org_column: 'organizationId',
                parent_table: 'posts',
              },
            ];
          if (text.includes('information_schema')) return [];
          if (text.includes('COUNT(*)')) return [{ n: 3 }];
          return [{ id: 'locked' }];
        },
      );

      await expect(
        service.relocateToOrganization(
          BRAND_ID,
          { organizationId: DEST_ORG },
          { isSuperAdmin: true, userId: USER_ID },
        ),
      ).rejects.toThrow(
        /unhandled org-only child table\(s\).*future_children\.postId -> posts \(3\)/,
      );
    });
  });

  describe('transaction limits (#6689)', () => {
    it('gives a large brand time to finish', async () => {
      primeRelocatableBrand();
      await service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        { isSuperAdmin: true, userId: USER_ID },
      );

      const [, options] = transactionSpy.mock.calls[0];
      expect(options).toMatchObject({ isolationLevel: 'Serializable' });
      expect(options.timeout).toBeGreaterThanOrEqual(60_000);
      expect(options.maxWait).toBeGreaterThan(0);
    });

    it('defers the composite organization key checks before it touches anything', async () => {
      primeRelocatableBrand();

      await service.relocateToOrganization(
        BRAND_ID,
        { organizationId: DEST_ORG },
        { isSuperAdmin: true, userId: USER_ID },
      );

      expect(executeRaw).toHaveBeenCalledOnce();
      expect(executeRaw.mock.calls[0][0].join('')).toBe(
        'SET CONSTRAINTS ALL DEFERRED',
      );
      expect(executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        queryRaw.mock.invocationCallOrder[0],
      );
    });

    it('rolls a stale reference found at commit back as a 409', async () => {
      primeRelocatableBrand();
      transactionSpy.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('violates foreign key', {
          clientVersion: 'test',
          code: 'P2003',
        }),
      );

      await expect(
        service.relocateToOrganization(
          BRAND_ID,
          { organizationId: DEST_ORG },
          { isSuperAdmin: true, userId: USER_ID },
        ),
      ).rejects.toThrow(/still references the previous organization/);
      expect(transactionSpy).toHaveBeenCalledTimes(1);
      expect(cacheInvalidationService.invalidate).not.toHaveBeenCalled();
    });

    it('maps an expired transaction (P2028) to a clear retryable error, without retrying', async () => {
      primeRelocatableBrand();
      transactionSpy.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Transaction already closed', {
          clientVersion: 'test',
          code: 'P2028',
        }),
      );

      await expect(
        service.relocateToOrganization(
          BRAND_ID,
          { organizationId: DEST_ORG },
          { isSuperAdmin: true, userId: USER_ID },
        ),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(transactionSpy).toHaveBeenCalledTimes(1);
      expect(cacheInvalidationService.invalidate).not.toHaveBeenCalled();
    });

    it.each([
      'content version pins are immutable',
      'Execution read scope cannot be rebound or widened',
      'Execution read dependencies and lineage are append-only',
    ])('maps the trigger refusal "%s" to a 409', async (message) => {
      primeRelocatableBrand();
      transactionSpy.mockRejectedValue(new Error(message));

      await expect(
        service.relocateToOrganization(
          BRAND_ID,
          { organizationId: DEST_ORG },
          { isSuperAdmin: true, userId: USER_ID },
        ),
      ).rejects.toThrow(/immutable or append-only/);
    });
  });
});

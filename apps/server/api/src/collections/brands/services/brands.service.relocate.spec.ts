// Real enums + schema-derived metadata via the light @genfeedai/prisma/testing
// subpath, plus a runtime Prisma.PrismaClientKnownRequestError for the P2002 path.
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import {
  FIRST_ORDER_TARGETS,
  SECOND_ORDER_TARGETS,
} from '@api/collections/brands/constants/brand-org-cascade.constants';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import type { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import type { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import type { CacheService } from '@api/services/cache/services/cache.service';
import type { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Prisma } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { FilesClientService } from '@server/services/files-microservice/client/files-client.service';

type Delegate = {
  count: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
};

function makeDelegate(): Delegate {
  return {
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue({ id: 'created_id' }),
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

const EMPTY_RELOCATION_SUMMARY = {
  membersSevered: 0,
  schedulingPending: 0,
  workflowsClonedActive: 0,
  workflowsClonedPaused: 0,
  workflowsMoved: 0,
};

describe('BrandsService.relocateToOrganization', () => {
  let delegates: Map<string, Delegate>;
  let queryRaw: ReturnType<typeof vi.fn>;
  let transactionSpy: ReturnType<typeof vi.fn>;
  let cacheInvalidationService: {
    invalidate: ReturnType<typeof vi.fn>;
    invalidateByTags: ReturnType<typeof vi.fn>;
    invalidatePattern: ReturnType<typeof vi.fn>;
  };
  let prismaProxy: unknown;
  let service: BrandsService;

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
    queryRaw = vi.fn().mockResolvedValue([]);
    transactionSpy = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prismaProxy),
    );
    cacheInvalidationService = {
      invalidate: vi.fn(),
      invalidateByTags: vi.fn(),
      invalidatePattern: vi.fn(),
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
          return getDelegate(prop);
        },
      },
    );

    service = new BrandsService(
      prismaProxy as unknown as PrismaService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
      { invalidateByTags: vi.fn() } as unknown as CacheService,
      {} as unknown as BrandScraperService,
      {} as unknown as LlmDispatcherService,
      cacheInvalidationService as unknown as CacheInvalidationService,
      {} as unknown as FilesClientService,
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
    getDelegate('organization').findFirst.mockResolvedValue({ id: DEST_ORG });
  }

  // Brand read returns SOURCE_ORG first (pre-move), then the moved row (post-move).
  function primeRelocatableBrand(): void {
    getDelegate('brand')
      .findFirst.mockResolvedValueOnce({
        id: BRAND_ID,
        isDeleted: false,
        organizationId: SOURCE_ORG,
      })
      .mockResolvedValueOnce({ id: BRAND_ID, organizationId: DEST_ORG });
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
    getDelegate('batchWorkflowJob').count.mockResolvedValue(1);

    const preview = await service.previewRelocation(BRAND_ID, DEST_ORG, {
      isSuperAdmin: true,
      userId: USER_ID,
    });

    expect(preview).toEqual({
      ackToken: null,
      counts: {
        sharedWorkflows: 0,
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
        {
          count: 1,
          label: 'batch workflow job',
          resource: 'batchWorkflowJob',
        },
      ],
    });
  });

  it('does not relocate (or open a transaction) when the org is unchanged', async () => {
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

  it('cascades org across first- and second-order targets and invalidates both orgs', async () => {
    getDelegate('brand')
      .findFirst.mockResolvedValueOnce({
        id: BRAND_ID,
        isDeleted: false,
        organizationId: SOURCE_ORG,
      })
      .mockResolvedValueOnce({ id: BRAND_ID, organizationId: DEST_ORG });
    getDelegate('organization').findFirst.mockResolvedValue({ id: DEST_ORG });
    // A moved Task exists → its TaskComment children must follow.
    getDelegate('task').findMany.mockResolvedValue([{ id: 'task_1' }]);

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
        OR: [{ taskId: { in: ['task_1'] } }],
        organizationId: { not: DEST_ORG },
      },
    });

    // Sever: cleared stale lastUsedBrand pointers + default-recurring markers.
    expect(getDelegate('member').updateMany).toHaveBeenCalledWith({
      data: { lastUsedBrandId: null },
      where: { lastUsedBrandId: BRAND_ID, organizationId: { not: DEST_ORG } },
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
    expect(cacheInvalidationService.invalidateByTags).toHaveBeenCalled();

    expect(result).toEqual({
      brand: { id: BRAND_ID, organizationId: DEST_ORG },
      summary: EMPTY_RELOCATION_SUMMARY,
    });
  });

  it('moves a sole-brand workflow (with its execution + batch history) with the brand', async () => {
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
    // Org-keyed execution + batch history followed the workflow.
    expect(getDelegate('workflowExecution').updateMany).toHaveBeenCalledWith({
      data: { organizationId: DEST_ORG },
      where: {
        organizationId: { not: DEST_ORG },
        workflowId: { in: ['wf_sole'] },
      },
    });
    expect(getDelegate('batchWorkflowJob').updateMany).toHaveBeenCalledWith({
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

  it('ignores deprecated relocationAck and moves brand-owned workflows without cloning', async () => {
    primeRelocatableBrand();
    mockBrandWorkflows([{ id: 'wf_owned' }]);

    const result = await service.relocateToOrganization(
      BRAND_ID,
      { organizationId: DEST_ORG, relocationAck: 'legacy-token' },
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
    queryRaw.mockImplementation((strings: TemplateStringsArray) => {
      const sql = Array.from(strings).join('');
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
    });

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
});

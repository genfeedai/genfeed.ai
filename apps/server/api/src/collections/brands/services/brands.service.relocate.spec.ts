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
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { ConflictException, ForbiddenException } from '@nestjs/common';

type Delegate = {
  count: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
};

function makeDelegate(): Delegate {
  return {
    count: vi.fn().mockResolvedValue(0),
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

  // `severCrossOrgLinks` issues two workflow.findMany queries: the first (no `AND`)
  // returns every cross-org workflow on the brand; the second (with `AND`) returns
  // only the multi-brand subset. Route each by the presence of `where.AND`.
  function mockWorkflowSplit(opts: {
    cross: { id: string }[];
    shared: { id: string }[];
  }): void {
    getDelegate('workflow').findMany.mockImplementation(
      (args: { where?: { AND?: unknown } }) =>
        Promise.resolve(args.where?.AND ? opts.shared : opts.cross),
    );
  }

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

    expect(result).toEqual({ id: BRAND_ID, organizationId: DEST_ORG });
  });

  it('moves a sole-brand workflow (with its execution + batch history) with the brand', async () => {
    primeRelocatableBrand();
    // wf_sole is attached only to the moving brand → it should move, not sever.
    mockWorkflowSplit({ cross: [{ id: 'wf_sole' }], shared: [] });

    await service.relocateToOrganization(
      BRAND_ID,
      { organizationId: DEST_ORG },
      { isSuperAdmin: true, userId: USER_ID },
    );

    // Workflow definition re-homed to the destination org.
    expect(getDelegate('workflow').updateMany).toHaveBeenCalledWith({
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

  it('severs a multi-brand workflow, leaving it and its org in the source org', async () => {
    primeRelocatableBrand();
    // wf_shared drives another brand too → it must stay; only the brand link is cut.
    mockWorkflowSplit({
      cross: [{ id: 'wf_shared' }],
      shared: [{ id: 'wf_shared' }],
    });

    await service.relocateToOrganization(
      BRAND_ID,
      { organizationId: DEST_ORG },
      { isSuperAdmin: true, userId: USER_ID },
    );

    // Brand link severed for the shared workflow.
    expect(getDelegate('brand').update).toHaveBeenCalledWith({
      data: {
        members: { disconnect: [] },
        workflows: { disconnect: [{ id: 'wf_shared' }] },
      },
      where: { id: BRAND_ID },
    });
    // A severed workflow is NOT re-homed and its history stays put.
    expect(getDelegate('workflowExecution').updateMany).not.toHaveBeenCalled();
    expect(getDelegate('batchWorkflowJob').updateMany).not.toHaveBeenCalled();
    expect(getDelegate('workflow').updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { organizationId: DEST_ORG } }),
    );
    // Nothing moved → default-recurring null-out carries no move-exclusion.
    expect(getDelegate('workflow').updateMany).toHaveBeenCalledWith({
      data: { defaultRecurringBrandId: null },
      where: { defaultRecurringBrandId: BRAND_ID },
    });
  });

  it('rolls back when a brand-linked workflow/member is left stranded in the source org', async () => {
    primeRelocatableBrand();
    mockWorkflowSplit({ cross: [], shared: [] });
    // The M2M backstop recomputes the post-state and finds a workflow still attached to
    // the moved brand from a source org (e.g. a concurrent re-link the scalar auditor
    // cannot see).
    getDelegate('workflow').count.mockImplementation(
      (args: { where?: { brands?: { some?: { id?: string } } } }) =>
        Promise.resolve(args.where?.brands?.some?.id === BRAND_ID ? 1 : 0),
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

  it('rolls back when a moved workflow is still linked to a source-org brand', async () => {
    primeRelocatableBrand();
    mockWorkflowSplit({ cross: [{ id: 'wf_sole' }], shared: [] });
    // Post-move recheck: the moved workflow is scoped by `id: { in: [...] }` and turns
    // out to still reference a brand outside the destination org.
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

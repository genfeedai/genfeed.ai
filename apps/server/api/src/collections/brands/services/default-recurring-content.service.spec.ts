vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { DefaultRecurringContentService } from '@api/collections/brands/services/default-recurring-content.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';

/**
 * Regression coverage for the duplicate-default-workflow race.
 *
 * `ensureDefaultBundle` reads existing workflows with a bulk `findMany` and then
 * creates one workflow per missing contentType. Without a transaction, two
 * concurrent onboarding requests for the same brand can both observe "no
 * existing default workflow" and both create one — producing duplicates.
 *
 * The fix wraps the per-contentType check-and-create in a `Serializable`
 * transaction. The fake Prisma below models the two database guarantees the fix
 * relies on:
 *   1. Snapshot isolation — a transaction's re-check does not see writes
 *      committed by a concurrent transaction that started after its snapshot.
 *   2. Serializable conflict detection — the second transaction to commit a row
 *      matching another transaction's read predicate fails with `P2034`.
 *
 * A size-2 barrier on the bulk read forces both callers to observe the empty
 * state before either creates, so this test genuinely exercises the race: it
 * fails against the old non-transactional code (6 rows) and passes against the
 * fix (3 rows).
 */

type StoredWorkflow = {
  brandId: string;
  contentType: string;
  defaultRecurringBrandId: string | null;
  id: string;
  isDeleted: boolean;
  isScheduleEnabled: boolean | null;
  metadata: Record<string, unknown>;
  organizationId: string;
};

type WhereClause = {
  brandId?: string;
  isDeleted?: boolean;
  metadata?: { equals?: unknown; path?: string[] };
  organizationId?: string;
};

type CreateArgs = { data: Record<string, unknown> };
type UpdateArgs = { data: Record<string, unknown>; where: { id: string } };
type FindArgs = { where?: WhereClause };

// Structural shape of the interactive-transaction client the fix uses. Typing
// the spy callback against this (rather than `unknown`) means a new `tx.*` call
// added to the production code without a matching stub fails to compile here.
type FakeTxClient = {
  workflow: {
    create: (args: CreateArgs) => Promise<StoredWorkflow>;
    findFirst: (args: FindArgs) => Promise<StoredWorkflow | null>;
    update: (args: UpdateArgs) => Promise<StoredWorkflow | null>;
  };
};

const CONTENT_TYPES = ['post', 'newsletter', 'image'] as const;

function matches(row: StoredWorkflow, where: WhereClause | undefined): boolean {
  if (!where) {
    return true;
  }
  if (where.brandId !== undefined && row.brandId !== where.brandId) {
    return false;
  }
  if (where.isDeleted !== undefined && row.isDeleted !== where.isDeleted) {
    return false;
  }
  if (
    where.organizationId !== undefined &&
    row.organizationId !== where.organizationId
  ) {
    return false;
  }
  // The in-transaction re-check filters on the JSON metadata path
  // `defaultRecurringContent.contentType`.
  if (
    where.metadata?.equals !== undefined &&
    row.contentType !== where.metadata.equals
  ) {
    return false;
  }
  return true;
}

function rowFromCreateData(
  data: Record<string, unknown>,
  id: string,
): StoredWorkflow {
  const metadata = (data.metadata as Record<string, unknown>) ?? {};
  const defaultRecurringContent = metadata.defaultRecurringContent as
    | { contentType?: string }
    | undefined;

  return {
    brandId: (data.brandId as string) ?? '',
    contentType: defaultRecurringContent?.contentType ?? '',
    defaultRecurringBrandId: (data.defaultRecurringBrandId as string) ?? null,
    id,
    isDeleted: (data.isDeleted as boolean) ?? false,
    isScheduleEnabled: (data.isScheduleEnabled as boolean | null) ?? null,
    metadata,
    organizationId: (data.organizationId as string) ?? '',
  };
}

function createBarrier(size: number) {
  let arrived = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    async wait(): Promise<void> {
      if (size <= 1) {
        return;
      }
      arrived += 1;
      if (arrived >= size) {
        release();
      }
      await gate;
    },
  };
}

type FakePrismaOptions = {
  brand: Record<string, unknown>;
  bulkReadBarrierSize?: number;
  initialWorkflows?: StoredWorkflow[];
};

/**
 * In-memory Prisma double with snapshot-isolated, conflict-detecting
 * transactions. Exposes the committed store so assertions can inspect the
 * final state.
 */
function createFakePrisma(options: FakePrismaOptions) {
  const committed: StoredWorkflow[] = [...(options.initialWorkflows ?? [])];
  let seq = 0;
  const nextId = () => `wf_${++seq}`;
  const barrier = createBarrier(options.bulkReadBarrierSize ?? 1);

  const transactionSpy = vi.fn(
    async (
      fn: (tx: FakeTxClient) => Promise<unknown>,
      _opts?: { isolationLevel?: string },
    ) => {
      // Snapshot taken at transaction start — identity copy of committed rows.
      const snapshot = committed.slice();
      const staged: StoredWorkflow[] = [];

      // The fix reads credentials OUTSIDE the transaction, so the tx client only
      // needs the workflow delegate.
      const tx: FakeTxClient = {
        workflow: {
          create: async ({ data }: CreateArgs) => {
            const row = rowFromCreateData(data, nextId());
            staged.push(row);
            return row;
          },
          findFirst: async ({ where }: FindArgs) => {
            // Reads see the snapshot plus this transaction's own staged writes.
            const visible = [...snapshot, ...staged];
            return visible.find((row) => matches(row, where)) ?? null;
          },
          update: async ({ data, where }: UpdateArgs) => {
            const row =
              staged.find((r) => r.id === where.id) ??
              committed.find((r) => r.id === where.id);
            if (row && 'isScheduleEnabled' in data) {
              row.isScheduleEnabled = data.isScheduleEnabled as boolean | null;
            }
            return row ?? null;
          },
        },
      };

      const result = await fn(tx);

      // Commit phase — synchronous critical section (no await), so it is atomic
      // relative to other transactions.
      //
      // Two conflict types are modelled, matching the DB's real behaviour after
      // the partial unique index is in place:
      //
      // 1. P2002 — partial unique index violation: the row being inserted has a
      //    non-null `defaultRecurringBrandId` and a committed row with the same
      //    (defaultRecurringBrandId, organizationId, contentType) and
      //    isDeleted=false already exists (committed by ANY transaction, not just
      //    post-snapshot ones). This is the DB-level constraint fire that the
      //    service now correctly handles as "concurrent winner already created it".
      //
      // 2. P2034 — serialization failure: a committed row matching the
      //    transaction's READ predicate was written AFTER this snapshot (i.e. by
      //    a concurrent transaction). This represents Postgres aborting the
      //    Serializable transaction due to a rw-conflict unrelated to the unique
      //    constraint — the service retries on this code.
      for (const row of staged) {
        // P2002: DB-level partial unique index fire (any committed duplicate,
        // regardless of snapshot age). Only applies to default-recurring rows.
        if (row.defaultRecurringBrandId !== null) {
          const uniqueConflict = committed.some(
            (c) =>
              !c.isDeleted &&
              c.defaultRecurringBrandId === row.defaultRecurringBrandId &&
              c.organizationId === row.organizationId &&
              c.contentType === row.contentType,
          );
          if (uniqueConflict) {
            const error = new Error(
              'Unique constraint failed on the fields: (`defaultRecurringBrandId`,`organizationId`,`contentType`)',
            ) as Error & { code: string };
            error.code = 'P2002';
            throw error;
          }
        }

        // P2034: Serializable rw-conflict from a row committed after this
        // transaction's snapshot (concurrent write, not necessarily duplicate).
        const serializationConflict = committed.some(
          (c) =>
            !snapshot.includes(c) &&
            !c.isDeleted &&
            c.brandId === row.brandId &&
            c.contentType === row.contentType,
        );
        if (serializationConflict) {
          const error = new Error('could not serialize access') as Error & {
            code: string;
          };
          error.code = 'P2034';
          throw error;
        }
      }
      committed.push(...staged);
      return result;
    },
  );

  const prisma = {
    $transaction: transactionSpy,
    brand: {
      findFirst: async () => options.brand,
    },
    credential: {
      // The fix resolves the post credential here, on the non-tx client,
      // BEFORE opening the Serializable transaction. No connected credential in
      // these tests, so node config gets an undefined credentialId.
      findFirst: async () => null,
    },
    workflow: {
      // Top-level create models the OLD non-transactional code path: a plain
      // append with no conflict detection. Present so a regression that reverts
      // to `this.prisma.workflow.create` is caught (it would yield duplicates).
      create: async ({ data }: CreateArgs) => {
        const row = rowFromCreateData(data, nextId());
        committed.push(row);
        return row;
      },
      findFirst: async ({ where }: FindArgs) =>
        committed.find((row) => matches(row, where)) ?? null,
      findMany: async ({ where }: FindArgs) => {
        const result = committed
          .filter((row) => matches(row, where))
          .map((row) => ({
            id: row.id,
            isScheduleEnabled: row.isScheduleEnabled,
            metadata: row.metadata,
          }));
        // Force concurrent callers to observe the same (empty) snapshot before
        // either proceeds to create.
        await barrier.wait();
        return result;
      },
      update: async ({ data, where }: UpdateArgs) => {
        const row = committed.find((r) => r.id === where.id);
        if (row && 'isScheduleEnabled' in data) {
          row.isScheduleEnabled = data.isScheduleEnabled as boolean | null;
        }
        return row ?? null;
      },
    },
    workflowExecution: {
      findMany: async () => [],
    },
  } as unknown as PrismaService;

  return { committed, prisma, transactionSpy };
}

function createLogger() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
}

const ORGANIZATION_ID = 'org_1';
const BRAND_ID = 'brand_1';
const USER_ID = 'user_1';

function buildBrand() {
  return {
    agentConfig: { schedule: { timezone: 'UTC' } },
    id: BRAND_ID,
    isDeleted: false,
    label: 'Acme',
    organizationId: ORGANIZATION_ID,
  };
}

function buildParams() {
  return {
    brandId: BRAND_ID,
    includeStatus: false as const,
    organizationId: ORGANIZATION_ID,
    origin: 'onboarding' as const,
    userId: USER_ID,
  };
}

function countByContentType(rows: StoredWorkflow[]): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.contentType] = (acc[row.contentType] ?? 0) + 1;
    return acc;
  }, {});
}

function buildStoredWorkflow(
  contentType: string,
  isScheduleEnabled: boolean,
): StoredWorkflow {
  return {
    brandId: BRAND_ID,
    contentType,
    defaultRecurringBrandId: BRAND_ID,
    id: `seed_${contentType}`,
    isDeleted: false,
    isScheduleEnabled,
    metadata: { defaultRecurringContent: { contentType } },
    organizationId: ORGANIZATION_ID,
  };
}

describe('DefaultRecurringContentService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates one default recurring workflow per content type for a fresh brand', async () => {
    const { committed, prisma, transactionSpy } = createFakePrisma({
      brand: buildBrand(),
    });
    const service = new DefaultRecurringContentService(prisma, createLogger());

    await service.ensureDefaultBundle(buildParams());

    expect(committed).toHaveLength(CONTENT_TYPES.length);
    expect(countByContentType(committed)).toEqual({
      image: 1,
      newsletter: 1,
      post: 1,
    });
    // Every create went through a Serializable transaction.
    expect(transactionSpy).toHaveBeenCalledTimes(CONTENT_TYPES.length);
    for (const call of transactionSpy.mock.calls) {
      expect(call[1]).toEqual({ isolationLevel: 'Serializable' });
    }
  });

  it('creates exactly one workflow per content type under concurrent ensureDefaultBundle calls', async () => {
    const { committed, prisma, transactionSpy } = createFakePrisma({
      brand: buildBrand(),
      // Two concurrent callers; barrier guarantees both read the empty state
      // before either creates, reproducing the race. The per-type transactions
      // then interleave naturally under the JS microtask queue because the
      // production loop processes content types sequentially (`for...of`).
      bulkReadBarrierSize: 2,
    });
    const service = new DefaultRecurringContentService(prisma, createLogger());

    await Promise.all([
      service.ensureDefaultBundle(buildParams()),
      service.ensureDefaultBundle(buildParams()),
    ]);

    expect(committed).toHaveLength(CONTENT_TYPES.length);
    expect(countByContentType(committed)).toEqual({
      image: 1,
      newsletter: 1,
      post: 1,
    });
    // The race protection depends on Serializable isolation; assert it here so
    // dropping the isolation level fails the concurrency test directly rather
    // than relying on the single-caller test above.
    expect(transactionSpy.mock.calls.length).toBeGreaterThan(0);
    for (const call of transactionSpy.mock.calls) {
      expect(call[1]).toEqual({ isolationLevel: 'Serializable' });
    }
  });

  it('retries on P2034 serialization failure and creates the workflow on the next attempt', async () => {
    // Simulates the root-cause bug: an unrelated concurrent write (different
    // org, a UI edit) causes a P2034 serialization failure. The original code
    // silently swallowed P2034 as "already created", leaving the brand without
    // its default recurring workflows. The fix must RETRY and ultimately create
    // the workflow.
    //
    // Strategy: the spy throws P2034 on the first call and succeeds on the
    // second. We also need a real committed store so getStatus (called at the
    // end via includeStatus: undefined default) can observe the created row.
    const { committed, prisma: basePrisma } = createFakePrisma({
      brand: buildBrand(),
    });

    let transactionCallCount = 0;
    const overriddenTransactionSpy = vi.fn(
      async (
        fn: (tx: FakeTxClient) => Promise<unknown>,
        opts?: { isolationLevel?: string },
      ) => {
        transactionCallCount += 1;
        if (transactionCallCount === 1) {
          // First call: simulate unrelated serialization failure (not a
          // "workflow already created" signal — the store is still empty).
          const error = new Error('could not serialize access') as Error & {
            code: string;
          };
          error.code = 'P2034';
          throw error;
        }
        // Subsequent calls: delegate to the real fake transaction logic.
        return basePrisma.$transaction(fn, opts);
      },
    );

    const prisma = {
      ...basePrisma,
      $transaction: overriddenTransactionSpy,
    } as unknown as PrismaService;

    const service = new DefaultRecurringContentService(prisma, createLogger());

    // Must not throw — retry should succeed and workflows must be created.
    await expect(
      service.ensureDefaultBundle({ ...buildParams(), includeStatus: false }),
    ).resolves.toEqual({ isConfigured: true, items: [] });

    // Three workflows created after retrying; the false P2034 must NOT have
    // been misread as "already created and skipped".
    expect(committed).toHaveLength(CONTENT_TYPES.length);
    expect(countByContentType(committed)).toEqual({
      image: 1,
      newsletter: 1,
      post: 1,
    });
    // The first content type's first attempt failed; it retried once. The
    // remaining content types succeeded on the first attempt. Total tx calls
    // must be > CONTENT_TYPES.length (at least one retry).
    expect(transactionCallCount).toBeGreaterThan(CONTENT_TYPES.length);
  });

  it('treats a P2002 unique constraint violation as success (concurrent winner already committed)', async () => {
    // P2002 is the legitimate "already created" signal — a concurrent caller
    // committed the row first and a unique constraint (if present) fires.
    // The fix must stop retrying immediately and return success.
    const transactionSpy = vi.fn(async () => {
      const error = new Error('unique constraint failed') as Error & {
        code: string;
      };
      error.code = 'P2002';
      throw error;
    });
    const prisma = {
      $transaction: transactionSpy,
      brand: { findFirst: async () => buildBrand() },
      credential: { findFirst: async () => null },
      workflow: { findMany: async () => [], update: vi.fn() },
    } as unknown as PrismaService;
    const service = new DefaultRecurringContentService(prisma, createLogger());

    await expect(
      service.ensureDefaultBundle({ ...buildParams(), includeStatus: false }),
    ).resolves.toEqual({ isConfigured: true, items: [] });
    // One P2002 per missing content type — no retries (each is immediately treated
    // as "concurrent winner already created it").
    expect(transactionSpy).toHaveBeenCalledTimes(CONTENT_TYPES.length);
  });

  it('DB partial unique index (defaultRecurringBrandId, organizationId, contentType) fires P2002 on true duplicate create', async () => {
    // This test exercises the DB-level constraint added in migration
    // 20260629202231. When two concurrent callers both observe "no existing
    // workflow" and both attempt to create one, the unique index on
    // (defaultRecurringBrandId, organizationId, contentType) WHERE isDeleted=false
    // ensures the second committer gets P2002. The service must treat P2002 as
    // "concurrent winner already committed" — not retry, not error.
    //
    // The fake transaction commit phase models this exactly: if a staged row has
    // a non-null defaultRecurringBrandId and an identical (brand, org, type) row
    // already exists in committed, P2002 is thrown (matching the real DB index).
    //
    // We seed a committed workflow that represents the first caller's committed
    // row, then verify that the second caller's attempt resolves as success.
    const preCommitted: StoredWorkflow[] = CONTENT_TYPES.map((contentType) =>
      buildStoredWorkflow(contentType, true),
    );

    // The fake prisma's `workflow.findMany` returns an empty list (simulating
    // that the bulk read happened BEFORE the pre-committed rows landed — a
    // classic race), but the transaction commit phase will fire P2002 because
    // the index already holds these rows in `committed`.
    const { committed, prisma, transactionSpy } = createFakePrisma({
      brand: buildBrand(),
      // Pre-seed committed store with the "first caller already won" rows.
      initialWorkflows: preCommitted,
    });

    // Override findMany to return empty (simulate bulk read pre-dating the
    // first caller's commit), while the committed store already has the rows.
    const findManySpy = vi.fn(async () => []);
    const prismaWithEmptyBulkRead = {
      ...prisma,
      workflow: {
        ...((prisma as unknown as Record<string, unknown>).workflow as Record<
          string,
          unknown
        >),
        findMany: findManySpy,
      },
    } as unknown as PrismaService;

    const service = new DefaultRecurringContentService(
      prismaWithEmptyBulkRead,
      createLogger(),
    );

    // Must resolve successfully — the P2002 from the partial unique index is
    // the correct "already created by concurrent winner" signal.
    await expect(
      service.ensureDefaultBundle({ ...buildParams(), includeStatus: false }),
    ).resolves.toEqual({ isConfigured: true, items: [] });

    // Each contentType attempt should have fired exactly once and been handled
    // as P2002 — no retries (P2002 is not a retryable error).
    expect(transactionSpy).toHaveBeenCalledTimes(CONTENT_TYPES.length);
    for (const call of transactionSpy.mock.calls) {
      expect(call[1]).toEqual({ isolationLevel: 'Serializable' });
    }

    // The committed store must have only the original 3 rows — none added by
    // the second caller (its creates were rejected by the unique index).
    expect(committed).toHaveLength(CONTENT_TYPES.length);
    expect(countByContentType(committed)).toEqual({
      image: 1,
      newsletter: 1,
      post: 1,
    });

    // The surviving rows are the pre-committed ones (the first caller's rows).
    for (const row of committed) {
      expect(row.id).toMatch(/^seed_/);
      expect(row.isDeleted).toBe(false);
    }
  });

  it('rethrows P2034 after exhausting all retries', async () => {
    // If all MAX_SERIALIZATION_RETRIES attempts fail with P2034, the error
    // must propagate so the caller (onboarding flow, system job) sees a failure
    // and can alert/retry at a higher level. The brand should NOT be silently
    // left without its default recurring workflows.
    let callCount = 0;
    const transactionSpy = vi.fn(async () => {
      callCount += 1;
      const error = new Error('could not serialize access') as Error & {
        code: string;
      };
      error.code = 'P2034';
      throw error;
    });
    const prisma = {
      $transaction: transactionSpy,
      brand: { findFirst: async () => buildBrand() },
      credential: { findFirst: async () => null },
      workflow: { findMany: async () => [], update: vi.fn() },
    } as unknown as PrismaService;
    const service = new DefaultRecurringContentService(prisma, createLogger());

    await expect(
      service.ensureDefaultBundle({ ...buildParams(), includeStatus: false }),
    ).rejects.toThrow('could not serialize access');
    // 3 retries per content type, aborts on the first content type that
    // exhausts all retries.
    expect(callCount).toBe(3);
  });

  it('rethrows unknown transaction errors without retrying', async () => {
    const transactionSpy = vi.fn(async () => {
      throw new Error('connection lost');
    });
    const prisma = {
      $transaction: transactionSpy,
      brand: { findFirst: async () => buildBrand() },
      credential: { findFirst: async () => null },
      workflow: { findMany: async () => [], update: vi.fn() },
    } as unknown as PrismaService;
    const service = new DefaultRecurringContentService(prisma, createLogger());

    await expect(
      service.ensureDefaultBundle({ ...buildParams(), includeStatus: false }),
    ).rejects.toThrow('connection lost');
    // Aborts immediately — no retry for non-P2034 errors.
    expect(transactionSpy).toHaveBeenCalledTimes(1);
  });

  it('re-enables existing disabled default workflows without creating duplicates', async () => {
    const { committed, prisma, transactionSpy } = createFakePrisma({
      brand: buildBrand(),
      initialWorkflows: CONTENT_TYPES.map((contentType) =>
        buildStoredWorkflow(contentType, false),
      ),
    });
    const service = new DefaultRecurringContentService(prisma, createLogger());

    await service.ensureDefaultBundle(buildParams());

    // No new workflows created — the fast path just re-enables the disabled ones.
    expect(committed).toHaveLength(CONTENT_TYPES.length);
    expect(countByContentType(committed)).toEqual({
      image: 1,
      newsletter: 1,
      post: 1,
    });
    expect(committed.every((row) => row.isScheduleEnabled === true)).toBe(true);
    // All present in the bulk read, so no transaction is opened.
    expect(transactionSpy).not.toHaveBeenCalled();
  });
});

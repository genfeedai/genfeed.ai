vi.mock('@genfeedai/prisma', () => ({ PrismaClient: class {} }));

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
  id: string;
  isDeleted: boolean;
  isScheduleEnabled: boolean | null;
  metadata: Record<string, unknown>;
  organizationId: string;
};

type WhereClause = {
  brands?: { some?: { id?: string } };
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
  if (
    where.brands?.some?.id !== undefined &&
    row.brandId !== where.brands.some.id
  ) {
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
  const brands = data.brands as { connect?: Array<{ id: string }> } | undefined;
  const metadata = (data.metadata as Record<string, unknown>) ?? {};
  const defaultRecurringContent = metadata.defaultRecurringContent as
    | { contentType?: string }
    | undefined;

  return {
    brandId: brands?.connect?.[0]?.id ?? '',
    contentType: defaultRecurringContent?.contentType ?? '',
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
      // relative to other transactions. A staged row conflicts when a matching
      // row was committed by another transaction after this snapshot.
      for (const row of staged) {
        const conflict = committed.some(
          (c) =>
            !snapshot.includes(c) &&
            !c.isDeleted &&
            c.brandId === row.brandId &&
            c.contentType === row.contentType,
        );
        if (conflict) {
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

  it('treats a P2034 serialization conflict as success and does not throw', async () => {
    const transactionSpy = vi.fn(async () => {
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

    await expect(service.ensureDefaultBundle(buildParams())).resolves.toEqual({
      isConfigured: true,
      items: [],
    });
    // Spy throws P2034 unconditionally, exercising the catch-handler path only
    // (one swallow per missing content type). Actual conflict detection is
    // covered by the concurrency test above.
    expect(transactionSpy).toHaveBeenCalledTimes(CONTENT_TYPES.length);
  });

  it('rethrows non-serialization transaction errors', async () => {
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

    await expect(service.ensureDefaultBundle(buildParams())).rejects.toThrow(
      'unique constraint failed',
    );
    // Aborts on the first failing content type.
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

import { GenerationBillingService } from '@api/collections/credits/services/generation-billing.service';
import { GenerationQuoteGroupService } from '@api/collections/credits/services/generation-quote-group.service';
import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { quoteModelBillablePricing } from '@genfeedai/pricing';

const org = 'org-1';
const now = new Date('2026-10-04T12:00:00Z');
const old = new Date(now.getTime() - 60 * 60 * 1000);

function quote() {
  const result = quoteModelBillablePricing(
    billableProfile({ key: 'crun/x/y', provider: 'crun', cost: 8 }),
    { modelKey: 'crun/x/y', provider: 'crun', outputs: 2, requests: 1 },
    1,
    now.toISOString(),
  );
  if (result.status !== 'priced') throw new Error('Fixture quote invalid');
  return result.snapshot;
}

interface FakeIngredient {
  id: string;
  organizationId: string;
  status: string;
  modelUsed: string;
  createdAt: Date;
  isDeleted: boolean;
  generationBilling: unknown;
}
interface FakeHold {
  id: string;
  isDeleted: boolean;
  organizationId: string;
  status: string;
  workloadType: string;
  amount: number;
  metadata: Record<string, unknown>;
}

/** In-memory ledger: the hold flips to RELEASED only through releaseReservation. */
function world(options: { releaseFails?: number } = {}) {
  let releaseFailures = options.releaseFails ?? 0;
  const hold: FakeHold = {
    id: 'hold-1',
    isDeleted: false,
    organizationId: org,
    status: 'RESERVED',
    workloadType: 'media-generation-group',
    amount: 16,
    metadata: {
      modelQuote: quote(),
      boundOutputIds: ['a', 'b'],
      dispatchClosed: false,
      failedOutputIds: [],
      completedArtifacts: [],
    },
  };
  const ingredients: FakeIngredient[] = ['a', 'b'].map((id, outputIndex) => ({
    id,
    organizationId: org,
    status: 'PROCESSING',
    modelUsed: 'crun/x/y',
    createdAt: old,
    isDeleted: false,
    generationBilling: {
      kind: 'quote-group',
      reservationId: hold.id,
      outputIndex,
    },
  }));
  const tasks: { ingredientId: string; reservationId: string }[] = [];
  const matches = (row: object, where: Record<string, unknown>) => {
    const fields = new Map(Object.entries(row));
    return Object.entries(where).every(([key, value]) => {
      const field = fields.get(key);
      if (key === 'metadata' || key === 'generationBilling')
        return (
          JSON.stringify(field) ===
          JSON.stringify((value as { equals: unknown }).equals)
        );
      if (key === 'createdAt')
        return field instanceof Date && field <= (value as { lte: Date }).lte;
      if (key === 'modelUsed')
        return String(field).startsWith(
          (value as { startsWith: string }).startsWith,
        );
      if (key === 'organizationId' && typeof value === 'object') return true;
      return field === value;
    });
  };
  const prisma = {
    // Mirrors the sweep SQL: PROCESSING crun outputs older than the cutoff
    // with no live task, oldest first, limited. Values: status, like, cutoff, limit.
    $queryRaw: vi
      .fn()
      .mockImplementation(async (sql?: { values?: unknown[] }) => {
        const values = sql?.values ?? [];
        if (values.length < 4) return [];
        const [, , cutoff, limit] = values as [string, string, Date, number];
        return ingredients
          .filter(
            (row) =>
              row.status === 'PROCESSING' &&
              row.modelUsed.startsWith('crun/') &&
              row.createdAt <= cutoff &&
              !tasks.some((task) => task.ingredientId === row.id),
          )
          .sort(
            (left, right) =>
              left.createdAt.getTime() - right.createdAt.getTime(),
          )
          .slice(0, limit)
          .map((row) => ({ id: row.id, organizationId: row.organizationId }));
      }),
    $transaction: async (run: (tx: unknown) => unknown) => run(prisma),
    crunGenerationTask: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        tasks.find((task) => task.ingredientId === where.ingredientId) ?? null,
      count: async ({ where }: { where: Record<string, unknown> }) =>
        tasks.filter((task) => task.reservationId === where.reservationId)
          .length,
    },
    ingredient: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        ingredients.find((row) => matches(row, where)) ?? null,
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        ingredients.filter((row) => matches(row, where)),
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const rows = ingredients.filter((row) => matches(row, where));
        for (const row of rows) Object.assign(row, data);
        return { count: rows.length };
      },
    },
    creditReservation: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        matches(hold, where) ? hold : null,
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        if (!matches(hold, where)) return { count: 0 };
        Object.assign(hold, data);
        return { count: 1 };
      },
    },
  };
  const credits = {
    releaseReservation: vi.fn().mockImplementation(async () => {
      if (releaseFailures > 0) {
        releaseFailures -= 1;
        throw new Error('transient ledger outage');
      }
      hold.status = 'RELEASED';
    }),
  };
  const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const service = new GenerationBillingService(
    credits as never,
    {} as never,
    prisma as never,
    logger as never,
    new GenerationQuoteGroupService(
      credits as never,
      prisma as never,
      logger as never,
    ),
  );
  return { service, hold, ingredients, tasks, credits, logger };
}

describe('Crun pre-submission abort of taskless outputs', () => {
  it('releases the funded hold once every bound output is aborted', async () => {
    const w = world();
    expect(w.hold.status).toBe('RESERVED');
    await w.service.abortUnsubmittedOutput('a', org);
    // One output is still bound, so the funding must stay held.
    expect(w.hold.status).toBe('RESERVED');
    expect(w.ingredients[0].status).toBe('FAILED');
    await w.service.abortUnsubmittedOutput('b', org);
    expect(w.hold.status).toBe('RELEASED');
    expect(w.hold.metadata).toMatchObject({
      boundOutputIds: [],
      abortedOutputIds: ['a', 'b'],
    });
    expect(w.ingredients.map((row) => row.status)).toEqual([
      'FAILED',
      'FAILED',
    ]);
    expect(w.credits.releaseReservation).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: org, reservationId: 'hold-1' }),
    );
  });

  it('leaves an output that already has a task row to the task path', async () => {
    const w = world();
    w.tasks.push({ ingredientId: 'a', reservationId: 'hold-1' });
    await w.service.abortUnsubmittedOutput('a', org);
    expect(w.ingredients[0].status).toBe('PROCESSING');
    expect(w.hold.status).toBe('RESERVED');
    expect(w.hold.metadata).toMatchObject({ boundOutputIds: ['a', 'b'] });
  });

  it('never releases a hold that still has a task', async () => {
    const w = world();
    w.tasks.push({ ingredientId: 'b', reservationId: 'hold-1' });
    await w.service.abortUnsubmittedOutput('a', org);
    expect(w.hold.status).toBe('RESERVED');
  });

  it('fails a free output and a BYOK output with submission-rejected proof', async () => {
    const w = world();
    w.ingredients[0].generationBilling = null;
    w.ingredients[1].generationBilling = {
      kind: 'byok',
      amount: 1,
      description: 'd',
      expiresAt: now.toISOString(),
      source: 'video-generate',
      state: 'pending',
      userId: 'u',
      submissionIntentProvider: 'crun',
    };
    await w.service.abortUnsubmittedOutput('a', org);
    await w.service.abortUnsubmittedOutput('b', org);
    expect(w.ingredients[0].status).toBe('FAILED');
    expect(w.ingredients[1]).toMatchObject({
      status: 'FAILED',
      generationBilling: {
        state: 'failed',
        confirmedFailure: { kind: 'submission-rejected', provider: 'crun' },
      },
    });
    expect(w.credits.releaseReservation).not.toHaveBeenCalled();
  });

  it('recovers through the sweep after a transient cleanup failure', async () => {
    const w = world({ releaseFails: 1 });
    await w.service.abortUnsubmittedOutput('a', org);
    await expect(w.service.abortUnsubmittedOutput('b', org)).rejects.toThrow(
      'transient ledger outage',
    );
    // Evidence is saved but the ledger release and the failure were not.
    expect(w.hold.status).toBe('RESERVED');
    expect(w.ingredients[1].status).toBe('PROCESSING');

    expect(await w.service.reconcileAbortedCrunDispatches(now)).toBe(1);
    expect(w.hold.status).toBe('RELEASED');
    expect(w.ingredients[1].status).toBe('FAILED');
    expect(await w.service.reconcileAbortedCrunDispatches(now)).toBe(0);
  });

  it('keeps retrying a sweep failure without aborting the batch', async () => {
    const w = world({ releaseFails: 1 });
    w.ingredients[0].status = 'FAILED';
    (w.hold.metadata as { boundOutputIds: string[] }).boundOutputIds = ['b'];
    expect(await w.service.reconcileAbortedCrunDispatches(now)).toBe(0);
    expect(w.logger.error).toHaveBeenCalled();
    expect(await w.service.reconcileAbortedCrunDispatches(now)).toBe(1);
    expect(w.hold.status).toBe('RELEASED');
  });

  it('is not starved by 200+ older task-backed outputs', async () => {
    const w = world();
    for (let index = 0; index < 250; index += 1) {
      w.ingredients.push({
        id: `task-backed-${index}`,
        organizationId: org,
        status: 'PROCESSING',
        modelUsed: 'crun/x/y',
        createdAt: new Date(old.getTime() - 60 * 60 * 1000 - index),
        isDeleted: false,
        generationBilling: null,
      });
      w.tasks.push({
        ingredientId: `task-backed-${index}`,
        reservationId: 'other',
      });
    }
    expect(await w.service.reconcileAbortedCrunDispatches(now)).toBe(2);
    expect(w.hold.status).toBe('RELEASED');
    expect(w.ingredients[0].status).toBe('FAILED');
    expect(w.ingredients[1].status).toBe('FAILED');
    expect(
      w.ingredients
        .filter((row) => row.id.startsWith('task-backed'))
        .every((row) => row.status === 'PROCESSING'),
    ).toBe(true);
  });

  it('does not sweep outputs younger than the dispatch window', async () => {
    const w = world();
    for (const row of w.ingredients) row.createdAt = now;
    expect(await w.service.reconcileAbortedCrunDispatches(now)).toBe(0);
    expect(w.hold.status).toBe('RESERVED');
  });
});

import { MediaVendorCostLedgerService } from '@api/services/media-vendor-cost/media-vendor-cost-ledger.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';

type Row = Record<string, unknown>;

interface Continuation {
  executionId: string;
  id: string;
  ingredientId: string;
  nodeId: string;
  organizationId: string;
}

interface CostWhere {
  costEvidence?: { in: string[] };
  createdAt?: { gte: Date; lte: Date };
  idempotencyKey?: string;
  ingredientId?: string;
  isDeleted?: boolean;
  organizationId?: string;
  workflowExecutionId?: { not: null };
}

function matchesCost(row: Row, where: CostWhere): boolean {
  const createdAt = row.createdAt as Date;
  return (
    (where.organizationId === undefined ||
      row.organizationId === where.organizationId) &&
    (where.isDeleted === undefined || row.isDeleted === where.isDeleted) &&
    (where.idempotencyKey === undefined ||
      row.idempotencyKey === where.idempotencyKey) &&
    (where.ingredientId === undefined ||
      row.ingredientId === where.ingredientId) &&
    (where.workflowExecutionId === undefined ||
      row.workflowExecutionId != null) &&
    (where.costEvidence === undefined ||
      where.costEvidence.in.includes(String(row.costEvidence))) &&
    (where.createdAt === undefined ||
      (createdAt >= where.createdAt.gte && createdAt <= where.createdAt.lte))
  );
}

// The vendor-cost ledger and the workflow tables it reads attribution from.
function createDatabase() {
  const db = {
    continuations: [] as Continuation[],
    costs: [] as Row[],
    executions: [{ id: 'run', isDeleted: false, organizationId: 'org' }],
  };
  const prisma = {
    mediaVendorCost: {
      create: async ({ data }: { data: Row }) => {
        db.costs.push({ createdAt: new Date(), ...data });
      },
      findFirst: async ({ where }: { where: CostWhere }) =>
        db.costs.find((row) => matchesCost(row, where)) ?? null,
      groupBy: async ({ where }: { where: CostWhere }) => {
        const groups = new Map<string, Row[]>();
        for (const row of db.costs.filter((cost) => matchesCost(cost, where))) {
          const key = `${row.model}|${row.provider}|${row.isByok}`;
          groups.set(key, [...(groups.get(key) ?? []), row]);
        }
        return [...groups.values()].map((rows) => ({
          _count: { _all: rows.length },
          _sum: {
            units: rows.reduce((sum, row) => sum + Number(row.units), 0),
            vendorCostMicros: rows.reduce(
              (sum, row) => sum + Number(row.vendorCostMicros),
              0,
            ),
          },
          isByok: rows[0].isByok,
          model: rows[0].model,
          provider: rows[0].provider,
        }));
      },
      updateMany: async ({ data, where }: { data: Row; where: CostWhere }) => {
        const hits = db.costs.filter((row) => matchesCost(row, where));
        for (const row of hits) Object.assign(row, data);
        return { count: hits.length };
      },
      upsert: async ({ create, where }: { create: Row; where: CostWhere }) => {
        if (!db.costs.some((row) => matchesCost(row, where))) {
          db.costs.push({ createdAt: new Date(), ...create });
        }
      },
    },
    workflowExecution: {
      findFirst: async ({ where }: { where: Row }) =>
        db.executions.find(
          (execution) =>
            execution.id === where.id &&
            execution.organizationId === where.organizationId &&
            execution.isDeleted === where.isDeleted,
        ) ?? null,
    },
    workflowNodeContinuation: {
      findFirst: async ({ where }: { where: Row }) => {
        const continuation = db.continuations.find(
          (entry) =>
            entry.ingredientId === where.ingredientId &&
            entry.organizationId === where.organizationId,
        );
        return continuation
          ? {
              executionId: continuation.executionId,
              id: continuation.id,
              nodeId: continuation.nodeId,
            }
          : null;
      },
    },
  };
  return {
    db,
    service: new MediaVendorCostLedgerService(
      prisma as unknown as PrismaService,
      { debug: () => undefined } as unknown as LoggerService,
    ),
  };
}

const generation = {
  brandId: 'brand-1',
  category: 'video',
  ingredientId: 'ing-1',
  isByok: false,
  model: 'bytedance/seedance-2.5',
  organizationId: 'org-1',
  pricingType: 'per-second',
  provider: 'replicate',
  units: 10,
  vendorCostMicros: 2_400_000,
} as const;

describe('MediaVendorCostLedgerService', () => {
  it('keeps one ledger row per generation however often it is recorded', async () => {
    const { db, service } = createDatabase();

    await service.record(generation);
    await service.record({ ...generation, vendorCostMicros: 9_999_999 });

    expect(db.costs).toEqual([
      expect.objectContaining({
        ...generation,
        costEvidence: 'unknown',
        idempotencyKey: 'media:org-1:ing-1',
        isDeleted: false,
      }),
    ]);
  });

  it('aggregates live rows of the organization inside the date range', async () => {
    const { db, service } = createDatabase();
    const inRange = new Date('2026-08-10T00:00:00Z');
    const cost = (overrides: Row) => ({
      createdAt: inRange,
      isByok: false,
      isDeleted: false,
      model: 'seedance',
      organizationId: 'org-1',
      provider: 'replicate',
      units: 5,
      vendorCostMicros: 1_000,
      ...overrides,
    });
    db.costs.push(
      cost({}),
      cost({ units: 3, vendorCostMicros: 500 }),
      cost({ isByok: true, vendorCostMicros: 7_000 }),
      cost({ createdAt: new Date('2026-07-01T00:00:00Z') }),
      cost({ organizationId: 'org-2' }),
      cost({ isDeleted: true }),
    );

    await expect(
      service.aggregateByOrgModel({
        from: new Date('2026-08-01T00:00:00Z'),
        organizationId: 'org-1',
        to: new Date('2026-08-17T00:00:00Z'),
      }),
    ).resolves.toEqual([
      {
        byokGenerationCount: 1,
        generationCount: 3,
        model: 'seedance',
        platformGenerationCount: 2,
        provider: 'replicate',
        units: 13,
        vendorCostMicros: 1_500,
      },
    ]);
  });

  it('attributes a callback cost to its durable workflow operation', async () => {
    const { db, service } = createDatabase();
    db.continuations.push({
      executionId: 'run',
      id: 'operation',
      ingredientId: 'output',
      nodeId: 'node',
      organizationId: 'org',
    });

    await service.record({
      category: 'image',
      costEvidence: 'observed',
      ingredientId: 'output',
      isByok: false,
      model: 'model',
      organizationId: 'org',
      provider: 'replicate',
      units: 1,
      vendorCostMicros: 123,
    });

    expect(db.costs).toEqual([
      expect.objectContaining({
        costEvidence: 'observed',
        idempotencyKey: 'media:org:output',
        vendorCostMicros: 123,
        workflowExecutionId: 'run',
        workflowNodeId: 'node',
        workflowOperationId: 'operation',
      }),
    ]);
  });

  it('settles late evidence at the pinned price, ignoring the reported cost', async () => {
    const { db, service } = createDatabase();
    db.costs.push({
      brandId: 'brand-1',
      costEvidence: 'unknown',
      idempotencyKey: 'media:org:output',
      ingredientId: 'output',
      isByok: true,
      isDeleted: false,
      organizationId: 'org',
      pricingSnapshot: {
        isByok: false,
        pricingType: 'per-second',
        providerCostUsd: 0.12,
      },
      units: 0,
      vendorCostMicros: 0,
      workflowExecutionId: 'run',
    });

    await service.record({
      category: 'video',
      costEvidence: 'calculated',
      ingredientId: 'output',
      isByok: true,
      model: 'model',
      organizationId: 'org',
      provider: 'replicate',
      realizedDurationSeconds: 2.5,
      units: 999,
      vendorCostMicros: 9_999_999,
    });

    expect(db.costs).toEqual([
      expect.objectContaining({
        brandId: null,
        costEvidence: 'calculated',
        isByok: false,
        units: 2.5,
        vendorCostMicros: 300_000,
      }),
    ]);
  });

  it('leaves an already settled intent alone when non-observed evidence arrives late', async () => {
    const { db, service } = createDatabase();
    const settled = {
      costEvidence: 'calculated',
      idempotencyKey: 'media:org:output',
      ingredientId: 'output',
      isDeleted: false,
      organizationId: 'org',
      pricingSnapshot: { pricingType: 'per-second', providerCostUsd: 0.12 },
      units: 2.5,
      vendorCostMicros: 300_000,
      workflowExecutionId: 'run',
    };
    db.costs.push({ ...settled });

    await service.record({
      category: 'video',
      costEvidence: 'calculated',
      ingredientId: 'output',
      isByok: false,
      model: 'model',
      organizationId: 'org',
      provider: 'replicate',
      realizedDurationSeconds: 10,
      units: 10,
      vendorCostMicros: 1,
    });

    expect(db.costs).toEqual([settled]);
  });

  it('settles a workflow intent as BYOK at zero cost after its execution was deleted, without a new row', async () => {
    const { db, service } = createDatabase();
    db.executions = [];
    db.continuations.push({
      executionId: 'run',
      id: 'continuation',
      ingredientId: 'avatar',
      nodeId: 'avatar',
      organizationId: 'org-1',
    });
    db.costs.push({
      costEvidence: 'pending',
      idempotencyKey: 'media:org-1:avatar',
      ingredientId: 'avatar',
      isDeleted: false,
      organizationId: 'org-1',
      pricingSnapshot: { billingDisposition: 'pending_charge', isByok: null },
      vendorCostMicros: 0,
      workflowExecutionId: 'run',
    });

    await service.record({
      category: 'video',
      costEvidence: 'observed',
      ingredientId: 'avatar',
      isByok: true,
      model: 'avatar',
      organizationId: 'org-1',
      provider: 'heygen',
      units: 1,
      vendorCostMicros: 300_000,
    });

    expect(db.costs).toEqual([
      expect.objectContaining({
        costEvidence: 'byok',
        isByok: true,
        vendorCostMicros: 0,
      }),
    ]);
  });
});

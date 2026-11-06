import { isDeepStrictEqual } from 'node:util';
import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { persistQuoteGroupDisposition } from '@api/helpers/utils/credits/persist-quote-group-completion.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CreditReservationStatus,
  IngredientStatus,
} from '@genfeedai/contracts';
import { MEDIA_GENERATION_GROUP_WORKLOAD_TYPE } from '@genfeedai/contracts/constants';
import { quoteModelBillablePricing } from '@genfeedai/pricing';
import { beforeEach, describe, expect, it } from 'vitest';

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

interface Database {
  holds: Row[];
  ingredients: Row[];
  tasks: Row[];
}

const quote = quoteModelBillablePricing(
  billableProfile(),
  { modelKey: 'test/model', outputs: 2, provider: 'replicate', requests: 2 },
  1,
  '2026-09-30T00:00:00.000Z',
);
if (quote.status !== 'priced') throw new Error(quote.reason);

const receipt = {
  kind: 'quote-group',
  outputIndex: 0,
  reservationId: 'hold-1',
};
const metadata = {
  boundOutputIds: ['image-0', 'image-1'],
  dispatchClosed: false,
  modelQuote: quote.snapshot,
  pricingAudit: 'preserved',
};
const where = {
  id: 'image-0',
  isDeleted: false,
  organizationId: 'org-1',
  status: IngredientStatus.PROCESSING,
};
const generated = {
  s3Key: 'durable/image.png',
  status: IngredientStatus.GENERATED,
};
const failed = { status: IngredientStatus.FAILED };

// Prisma filters as Postgres applies them to these rows.
const matches = (row: Row, filter: Where): boolean =>
  Object.entries(filter).every(([key, condition]) => {
    if (key === 'AND') {
      return (condition as Where[]).every((clause) => matches(row, clause));
    }
    if (condition && typeof condition === 'object' && 'equals' in condition) {
      return isDeepStrictEqual(row[key], condition.equals);
    }
    return row[key] === condition;
  });

describe('persistQuoteGroupDisposition', () => {
  let db: Database;
  let isLedgerDown: boolean;
  let concurrentCancellation: (() => void) | undefined;
  let transactions: unknown[];
  let prisma: PrismaService;

  const ingredient = () => db.ingredients[0];
  const hold = () => db.holds[0];
  const seed = (ingredientFields: Row = {}, holdFields: Row = {}) => {
    db.ingredients.push({
      sourceActionId: 'action-current',
      generationBilling: receipt,
      id: 'image-0',
      isDeleted: false,
      organizationId: 'org-1',
      status: IngredientStatus.PROCESSING,
      ...ingredientFields,
    });
    db.holds.push({
      id: 'hold-1',
      isDeleted: false,
      metadata: structuredClone(metadata),
      organizationId: 'org-1',
      status: CreditReservationStatus.RESERVED,
      workloadType: MEDIA_GENERATION_GROUP_WORKLOAD_TYPE,
      ...holdFields,
    });
  };

  beforeEach(() => {
    db = { holds: [], ingredients: [], tasks: [] };
    isLedgerDown = false;
    concurrentCancellation = undefined;
    transactions = [];

    const table = (rows: () => Row[]) => ({
      findFirst: async ({ where: filter }: { where: Where }) => {
        const row = rows().find((candidate) => matches(candidate, filter));
        return row ? structuredClone(row) : null;
      },
      updateMany: async ({
        data,
        where: filter,
      }: {
        data: Row;
        where: Where;
      }) => {
        const changed = rows().filter((row) => matches(row, filter));
        for (const row of changed) Object.assign(row, structuredClone(data));
        return { count: changed.length };
      },
    });
    const ingredients = table(() => db.ingredients);
    const holds = table(() => db.holds);
    const tx = {
      creditReservation: {
        ...holds,
        updateMany: async (args: { data: Row; where: Where }) => {
          if (isLedgerDown) throw new Error('database unavailable');
          return holds.updateMany(args);
        },
      },
      crunGenerationTask: table(() => db.tasks),
      ingredient: {
        ...ingredients,
        updateMany: async (args: { data: Row; where: Where }) => {
          // A cancellation committing first aborts this serializable write.
          if (concurrentCancellation) {
            throw Object.assign(new Error('Write conflict'), { code: 'P2034' });
          }
          return ingredients.updateMany(args);
        },
      },
    };
    prisma = {
      // A serializable transaction: a throw rolls back every write in it.
      $transaction: async (
        operation: (client: typeof tx) => unknown,
        options: unknown,
      ) => {
        transactions.push(options);
        const snapshot = structuredClone(db);
        try {
          return await operation(tx);
        } catch (error) {
          db = snapshot;
          concurrentCancellation?.();
          concurrentCancellation = undefined;
          throw error;
        }
      },
    } as unknown as PrismaService;
  });

  it('writes the durable artifact and sticky financial evidence in one serializable transaction', async () => {
    seed();

    await expect(
      persistQuoteGroupDisposition(prisma, where, generated),
    ).resolves.toEqual({ count: 1 });

    expect(transactions).toEqual([{ isolationLevel: 'Serializable' }]);
    expect(ingredient()).toMatchObject(generated);
    expect(hold()?.metadata).toEqual({
      ...metadata,
      completedArtifacts: [
        {
          completedAt: expect.any(String),
          ingredientId: 'image-0',
          s3Key: 'durable/image.png',
        },
      ],
      failedOutputIds: [],
      providerCompletionConflicts: [],
      providerCompletions: [],
    });
  });

  it('does not interpret a library FAILED update as provider-negative evidence', async () => {
    seed();

    await expect(
      persistQuoteGroupDisposition(prisma, where, failed),
    ).resolves.toBeNull();
    expect(ingredient()?.status).toBe(IngredientStatus.PROCESSING);
    expect(hold()?.metadata).toEqual(metadata);
  });

  it('saves a confirmed provider-negative disposition with the FAILED write', async () => {
    seed();

    await expect(
      persistQuoteGroupDisposition(prisma, where, failed, true),
    ).resolves.toEqual({ count: 1 });
    expect(ingredient()?.status).toBe(IngredientStatus.FAILED);
    expect(hold()?.metadata).toMatchObject({
      completedArtifacts: [],
      failedOutputIds: ['image-0'],
    });
  });

  it('preserves provider evidence when the durable artifact is saved', async () => {
    const providerCompletion = {
      duration: 3,
      externalIdHash: 'a'.repeat(64),
      height: 720,
      ingredientId: 'image-0',
      modelKey: 'test/model',
      outputIndex: 0,
      provider: 'fal',
      quoteHash: 'b'.repeat(64),
      width: 1280,
    };
    seed(
      {},
      {
        metadata: {
          ...metadata,
          providerCompletionConflicts: ['image-1'],
          providerCompletions: [providerCompletion],
        },
      },
    );

    await persistQuoteGroupDisposition(prisma, where, generated);

    expect(hold()?.metadata).toMatchObject({
      completedArtifacts: [
        expect.objectContaining({
          ingredientId: 'image-0',
          s3Key: 'durable/image.png',
        }),
      ],
      providerCompletionConflicts: ['image-1'],
      providerCompletions: [expect.objectContaining(providerCompletion)],
    });
  });

  it.each([
    ['a processing output', IngredientStatus.PROCESSING],
    ['an already generated output', IngredientStatus.GENERATED],
  ])(
    'leaves %s without a quote receipt on the legacy path',
    async (_case, status) => {
      seed({ generationBilling: null, status });

      await expect(
        persistQuoteGroupDisposition(prisma, where, generated),
      ).resolves.toBeNull();
      expect(ingredient()?.status).toBe(status);
      expect(hold()?.metadata).toEqual(metadata);
    },
  );

  it('does not manufacture evidence when the terminal transition matches nothing', async () => {
    seed();

    await expect(
      persistQuoteGroupDisposition(
        prisma,
        { ...where, sourceActionId: 'action-stale' },
        generated,
      ),
    ).resolves.toEqual({ count: 0 });
    expect(ingredient()?.status).toBe(IngredientStatus.PROCESSING);
    expect(hold()?.metadata).toEqual(metadata);
  });

  it.each([
    [IngredientStatus.GENERATED, CreditReservationStatus.SETTLED],
    [IngredientStatus.FAILED, CreditReservationStatus.RELEASED],
  ])(
    'returns a lost claim for a %s output even when its hold is %s',
    async (status, holdStatus) => {
      seed({ status }, { status: holdStatus });

      await expect(
        persistQuoteGroupDisposition(prisma, where, failed, true),
      ).resolves.toEqual({ count: 0 });
      expect(ingredient()?.status).toBe(status);
      expect(hold()).toMatchObject({ metadata, status: holdStatus });
    },
  );

  it.each([
    ['settled', { status: CreditReservationStatus.SETTLED }],
    ['released', { status: CreditReservationStatus.RELEASED }],
    ['deleted', { isDeleted: true }],
    ['owned by another organization', { organizationId: 'org-2' }],
  ])(
    'refuses to finish a processing output whose hold is %s',
    async (_case, holdFields) => {
      seed({}, holdFields);

      await expect(
        persistQuoteGroupDisposition(prisma, where, generated),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          detail: 'Completed generation quote hold is unavailable',
        }),
      });
      expect(ingredient()?.status).toBe(IngredientStatus.PROCESSING);
      expect(hold()?.metadata).toEqual(metadata);
    },
  );

  it('reloads terminal ownership after a serializable cancellation conflict', async () => {
    seed();
    concurrentCancellation = () => {
      Object.assign(db.ingredients[0] as Row, {
        status: IngredientStatus.GENERATED,
      });
      Object.assign(db.holds[0] as Row, {
        status: CreditReservationStatus.SETTLED,
      });
    };

    await expect(
      persistQuoteGroupDisposition(prisma, where, failed, true),
    ).resolves.toEqual({ count: 0 });
    expect(transactions).toHaveLength(2);
    expect(ingredient()?.status).toBe(IngredientStatus.GENERATED);
    expect(hold()).toMatchObject({
      metadata,
      status: CreditReservationStatus.SETTLED,
    });
  });

  it('rolls the GENERATED write back when the evidence cannot be saved', async () => {
    seed();
    isLedgerDown = true;

    await expect(
      persistQuoteGroupDisposition(prisma, where, generated),
    ).rejects.toThrow('database unavailable');
    expect(ingredient()?.status).toBe(IngredientStatus.PROCESSING);
    expect(hold()?.metadata).toEqual(metadata);
  });
});

import { isDeepStrictEqual } from 'node:util';
import {
  persistSubmissionFailure,
  persistSubmissionRejection,
} from '@api/helpers/utils/credits/persist-submission-failure.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  CreditReservationStatus,
  IngredientStatus,
} from '@genfeedai/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

interface Database {
  holds: Row[];
  ingredients: Row[];
  tasks: Row[];
}

const ORG = 'org-1';
const AVATAR = 'avatar-1';

const where = {
  id: AVATAR,
  organizationId: ORG,
  isDeleted: false,
  status: IngredientStatus.PROCESSING,
};
const failed = { status: IngredientStatus.FAILED };

const intentHold = (status: string) => ({
  id: 'hold-1',
  isDeleted: false,
  metadata: {
    assetId: AVATAR,
    audit: 'preserved',
    submissionIntent: { provider: 'heygen', version: 1 },
  },
  organizationId: ORG,
  status,
  workloadId: AVATAR,
  workloadType: 'media-generation',
});

const byokReceipt = (fields: Row = {}) => ({
  amount: 0,
  audit: 'preserved',
  description: 'Avatar',
  expiresAt: '2026-09-30T00:00:00.000Z',
  kind: 'byok',
  source: ActivitySource.VIDEO_GENERATION,
  state: 'pending',
  submissionIntentProvider: 'heygen',
  userId: 'user-1',
  ...fields,
});

const proof = (kind: string) => ({
  confirmedFailure: {
    ingredientId: AVATAR,
    kind,
    observedAt: expect.any(String),
    provider: 'heygen',
    version: 1,
  },
});

// Prisma filters as Postgres applies them to these rows.
const matches = (row: Row, filter: Where): boolean =>
  Object.entries(filter).every(([key, condition]) => {
    if (key === 'AND') {
      return (condition as Where[]).every((clause) => matches(row, clause));
    }
    if (condition && typeof condition === 'object' && 'notIn' in condition) {
      return !(condition.notIn as unknown[]).includes(row[key]);
    }
    if (condition && typeof condition === 'object' && 'equals' in condition) {
      return isDeepStrictEqual(row[key], condition.equals);
    }
    return row[key] === condition;
  });

describe('confirmed submitted-generation failure evidence', () => {
  let db: Database;
  let isLedgerDown: boolean;
  let conflicts: number;
  let prisma: PrismaService;

  const ingredient = () => db.ingredients[0];
  const hold = () => db.holds[0];
  const seedIngredient = (fields: Row = {}) => {
    db.ingredients.push({
      id: AVATAR,
      isDeleted: false,
      organizationId: ORG,
      status: IngredientStatus.PROCESSING,
      ...fields,
    });
  };
  const seedCrunTask = (fields: Row) => {
    db.tasks.push({
      ingredientId: AVATAR,
      isDeleted: false,
      organizationId: ORG,
      ...fields,
    });
  };

  beforeEach(() => {
    db = { holds: [], ingredients: [], tasks: [] };
    isLedgerDown = false;
    conflicts = 0;

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
    const holds = table(() => db.holds);
    const tx = {
      $queryRaw: async () => [],
      creditReservation: {
        ...holds,
        updateMany: async (args: { data: Row; where: Where }) => {
          if (isLedgerDown) throw new Error('Financial write failed');
          return holds.updateMany(args);
        },
      },
      crunGenerationTask: table(() => db.tasks),
      ingredient: table(() => db.ingredients),
    };
    prisma = {
      // A serializable transaction: it aborts on a write conflict and rolls
      // back every write when the callback throws.
      $transaction: async (operation: (client: typeof tx) => unknown) => {
        if (conflicts > 0) {
          conflicts -= 1;
          throw Object.assign(new Error('Write conflict'), { code: 'P2034' });
        }
        const snapshot = structuredClone(db);
        try {
          return await operation(tx);
        } catch (error) {
          db = snapshot;
          throw error;
        }
      },
    } as unknown as PrismaService;
  });

  describe('with a credit hold for the submission', () => {
    beforeEach(() => {
      seedIngredient();
      db.holds.push(intentHold(CreditReservationStatus.RESERVED));
    });

    it('does not treat a generic FAILED projection as provider proof', async () => {
      await expect(
        persistSubmissionFailure(prisma, where, failed, false),
      ).resolves.toBeNull();
      expect(ingredient()?.status).toBe(IngredientStatus.PROCESSING);
      expect(hold()).toEqual(intentHold(CreditReservationStatus.RESERVED));
    });

    it('fails the library row and records provider proof on the hold together', async () => {
      await expect(
        persistSubmissionFailure(prisma, where, failed, true),
      ).resolves.toEqual({ count: 1 });

      expect(ingredient()?.status).toBe(IngredientStatus.FAILED);
      expect(hold()).toEqual({
        ...intentHold(CreditReservationStatus.RESERVED),
        metadata: {
          ...intentHold(CreditReservationStatus.RESERVED).metadata,
          ...proof('provider-terminal'),
        },
      });
    });

    it('rolls the FAILED write back when the proof cannot be saved', async () => {
      isLedgerDown = true;

      await expect(
        persistSubmissionFailure(prisma, where, failed, true),
      ).rejects.toThrow('Financial write failed');
      expect(ingredient()?.status).toBe(IngredientStatus.PROCESSING);
      expect(hold()).toEqual(intentHold(CreditReservationStatus.RESERVED));
    });

    it('retries a serialization conflict', async () => {
      conflicts = 2;

      await expect(
        persistSubmissionFailure(prisma, where, failed, true),
      ).resolves.toEqual({ count: 1 });
      expect(ingredient()?.status).toBe(IngredientStatus.FAILED);
    });

    it('gives up after three serialization conflicts', async () => {
      conflicts = 3;

      await expect(
        persistSubmissionFailure(prisma, where, failed, true),
      ).rejects.toThrow('Write conflict');
      expect(ingredient()?.status).toBe(IngredientStatus.PROCESSING);
    });

    it('records no proof when the library row is no longer processing', async () => {
      ingredient().status = IngredientStatus.GENERATED;

      await expect(
        persistSubmissionFailure(prisma, where, failed, true),
      ).resolves.toEqual({ count: 0 });
      expect(ingredient()?.status).toBe(IngredientStatus.GENERATED);
      expect(hold()).toEqual(intentHold(CreditReservationStatus.RESERVED));
    });

    it('records provider proof after a generic FAILED projection won', async () => {
      ingredient().status = IngredientStatus.FAILED;
      const alreadyFailed = { ...where, status: IngredientStatus.FAILED };

      await expect(
        persistSubmissionFailure(prisma, alreadyFailed, failed, true),
      ).resolves.toEqual({ count: 1 });
      expect(hold()?.metadata).toEqual(
        expect.objectContaining(proof('provider-terminal')),
      );
    });

    it('records a rejection on the hold before any library projection', async () => {
      await persistSubmissionRejection(prisma, AVATAR, ORG);

      expect(ingredient()?.status).toBe(IngredientStatus.PROCESSING);
      expect(hold()?.metadata).toEqual(
        expect.objectContaining(proof('submission-rejected')),
      );
    });
  });

  it('still fails the library row when the hold already expired at its ceiling', async () => {
    seedIngredient();
    db.holds.push(intentHold(CreditReservationStatus.EXPIRED));

    await expect(
      persistSubmissionFailure(prisma, where, failed, true),
    ).resolves.toEqual({ count: 1 });
    expect(ingredient()?.status).toBe(IngredientStatus.FAILED);
    expect(hold()).toEqual(intentHold(CreditReservationStatus.EXPIRED));
  });

  it('refuses a failure for a hold that was released', async () => {
    seedIngredient();
    db.holds.push(intentHold(CreditReservationStatus.RELEASED));

    await expect(
      persistSubmissionFailure(prisma, where, failed, true),
    ).rejects.toThrow('already ended');
    expect(ingredient()?.status).toBe(IngredientStatus.PROCESSING);
  });

  describe('with a BYOK receipt on the library row', () => {
    it.each([IngredientStatus.PROCESSING, IngredientStatus.FAILED])(
      'ends the receipt with the FAILED write from %s',
      async (status) => {
        seedIngredient({ generationBilling: byokReceipt(), status });

        await expect(
          persistSubmissionFailure(prisma, { ...where, status }, failed, true),
        ).resolves.toEqual({ count: 1 });
        expect(ingredient()).toMatchObject({
          generationBilling: {
            ...byokReceipt({ state: 'failed' }),
            ...proof('provider-terminal'),
          },
          status: IngredientStatus.FAILED,
        });
      },
    );

    it('ends the receipt on rejection before the library projection', async () => {
      seedIngredient({ generationBilling: byokReceipt() });

      await persistSubmissionRejection(prisma, AVATAR, ORG);

      expect(ingredient()).toMatchObject({
        generationBilling: {
          ...byokReceipt({ state: 'failed' }),
          ...proof('submission-rejected'),
        },
        status: IngredientStatus.PROCESSING,
      });
    });

    it('never rewrites a completed receipt as a rejection', async () => {
      seedIngredient({
        generationBilling: byokReceipt({ state: 'recorded' }),
        status: IngredientStatus.GENERATED,
      });

      await expect(
        persistSubmissionRejection(prisma, AVATAR, ORG),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          detail: 'Submission rejection conflicts with completed BYOK usage',
        }),
      });
      expect(ingredient()?.generationBilling).toEqual(
        byokReceipt({ state: 'recorded' }),
      );
    });

    it('denies a forged Crun failure even when the caller skips confirmation', async () => {
      seedIngredient({
        generationBilling: byokReceipt({ submissionIntentProvider: 'crun' }),
      });
      seedCrunTask({ providerTaskId: null, state: 'submitting' });

      await expect(
        persistSubmissionFailure(prisma, where, failed, false),
      ).resolves.toEqual({ count: 0 });
      expect(ingredient()?.status).toBe(IngredientStatus.PROCESSING);
    });

    it('denies a Crun receipt whose durable task is missing', async () => {
      seedIngredient({
        generationBilling: byokReceipt({ submissionIntentProvider: 'crun' }),
      });

      await expect(
        persistSubmissionFailure(prisma, where, failed, true),
      ).resolves.toEqual({ count: 0 });
      expect(ingredient()?.status).toBe(IngredientStatus.PROCESSING);
    });
  });
});

import { randomUUID } from 'node:crypto';
import {
  CREDIT_USAGE_AMOUNT_SQL,
  CREDIT_USAGE_BRAND_SQL,
  CREDIT_USAGE_FILTER_SQL,
  creditUsageSignBuckets,
  creditUsageWhere,
  netCreditUsage,
} from '@api/collections/credits/services/credit-usage.util';
import { CreditTransactionCategory } from '@genfeedai/contracts';
import { REFERRAL_REWARD_REVERSAL_REFERENCE_TYPE } from '@genfeedai/contracts/constants';
import { Prisma, PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

// Explicit opt-in only: an isolated migrated database, never DATABASE_URL.
// Skipped unless `CREDIT_BALANCE_TEST_DATABASE_URL` is set.
const connectionString = process.env.CREDIT_BALANCE_TEST_DATABASE_URL;

/**
 * The SQL fragments (cost reporting, unit economics, business analytics) and
 * the Prisma `where` (billing accounts, lifecycle email, usage metrics) must
 * count the same ledger rows the same way.
 */
describe.skipIf(!connectionString)(
  'credit usage semantics against a real database',
  () => {
    const prisma = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;
    const database = () => {
      if (!prisma) {
        throw new Error('CREDIT_BALANCE_TEST_DATABASE_URL is required');
      }
      return prisma;
    };

    let userId: string;
    let organizationId: string;

    beforeEach(async () => {
      const suffix = randomUUID();
      userId = `credit-usage-user-${suffix}`;
      organizationId = `credit-usage-org-${suffix}`;
      const db = database();
      await db.user.create({ data: { handle: userId, id: userId } });
      await db.organization.create({
        data: {
          id: organizationId,
          label: organizationId,
          slug: organizationId,
          userId,
        },
      });

      const row = (
        category: CreditTransactionCategory,
        amount: number,
        extra: Partial<Prisma.CreditTransactionUncheckedCreateInput> = {},
      ): Prisma.CreditTransactionUncheckedCreateInput => ({
        amount,
        category,
        organizationId,
        ...extra,
      });
      await db.creditTransaction.createMany({
        data: [
          row(CreditTransactionCategory.DEDUCT, 10, { brandId: 'brand-a' }),
          // Written before the brandId column: brand lives on metadata only.
          row(CreditTransactionCategory.DEDUCT, 4, {
            metadata: { brandId: 'brand-a' },
          }),
          // Legacy negative-signed deduction: usage counts its magnitude.
          row(CreditTransactionCategory.DEDUCT, -4, { brandId: 'brand-a' }),
          row(CreditTransactionCategory.REFUND, 3, { brandId: 'brand-a' }),
          row(CreditTransactionCategory.DEDUCT, 5, {
            metadata: { brandId: '' },
            referenceType: 'credit_reservation',
          }),
          row(CreditTransactionCategory.DEDUCT, 7, {
            referenceType: REFERRAL_REWARD_REVERSAL_REFERENCE_TYPE,
          }),
          row(CreditTransactionCategory.ADD, 100),
        ],
      });
    });

    afterEach(async () => {
      const db = database();
      await db.creditTransaction.deleteMany({ where: { organizationId } });
      await db.organization.deleteMany({ where: { id: organizationId } });
      await db.user.deleteMany({ where: { id: userId } });
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it('nets refunds and drops referral reversals in SQL', async () => {
      const [result] = await database().$queryRaw<Array<{ usage: number }>>(
        Prisma.sql`
          SELECT SUM(${CREDIT_USAGE_AMOUNT_SQL})::double precision AS "usage"
          FROM "credit_transactions"
          WHERE "organizationId" = ${organizationId}
            AND "isDeleted" = false
            AND ${CREDIT_USAGE_FILTER_SQL}
        `,
      );

      expect(result.usage).toBe(20);
    });

    it('counts the same rows through the Prisma where', async () => {
      const buckets = await Promise.all(
        creditUsageSignBuckets().map((sign) =>
          database().creditTransaction.groupBy({
            by: ['category'],
            _sum: { amount: true },
            where: {
              ...creditUsageWhere(),
              ...sign,
              isDeleted: false,
              organizationId,
            },
          }),
        ),
      );

      expect(netCreditUsage(buckets.flat())).toBe(20);
    });

    it('attributes brand from the column, then non-empty metadata', async () => {
      const rows = await database().$queryRaw<
        Array<{ brandId: string | null; usage: number }>
      >(
        Prisma.sql`
          SELECT
            ${CREDIT_USAGE_BRAND_SQL} AS "brandId",
            SUM(${CREDIT_USAGE_AMOUNT_SQL})::double precision AS "usage"
          FROM "credit_transactions"
          WHERE "organizationId" = ${organizationId}
            AND "isDeleted" = false
            AND ${CREDIT_USAGE_FILTER_SQL}
          GROUP BY 1
          ORDER BY 1 NULLS LAST
        `,
      );

      expect(rows).toEqual([
        { brandId: 'brand-a', usage: 15 },
        { brandId: null, usage: 5 },
      ]);
    });
  },
);

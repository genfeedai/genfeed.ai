import { CreditTransactionCategory } from '@genfeedai/contracts';
import { REFERRAL_REWARD_REVERSAL_REFERENCE_TYPE } from '@genfeedai/contracts/constants';
import { Prisma } from '@genfeedai/prisma';

/**
 * Credit usage is what stayed spent: deductions net of refunds. A referral
 * reward reversal deducts balance but is an adjustment, not usage. Every usage
 * report reads the ledger through these definitions so totals agree.
 */
const CREDIT_USAGE_CATEGORIES = [
  CreditTransactionCategory.DEDUCT,
  CreditTransactionCategory.REFUND,
];

/** Prisma `where` keys selecting the `credit_transactions` rows that count as usage. */
export function creditUsageWhere() {
  return {
    category: { in: CREDIT_USAGE_CATEGORIES },
    // `NOT { referenceType }` would also drop rows whose referenceType is NULL.
    OR: [
      { referenceType: null },
      { referenceType: { not: REFERRAL_REWARD_REVERSAL_REFERENCE_TYPE } },
    ],
  } satisfies Prisma.CreditTransactionWhereInput;
}

/**
 * Prisma cannot sum `ABS("amount")`. Query usage once per bucket so each
 * grouped sum has a single sign, then `netCreditUsage` over every bucket's
 * rows equals the per-row SQL.
 */
export function creditUsageSignBuckets() {
  return [
    { amount: { gte: 0 } },
    { amount: { lt: 0 } },
  ] satisfies Prisma.CreditTransactionWhereInput[];
}

/** One usage row's contribution: refunds count negative. */
export function signedCreditUsage(entry: {
  amount?: number | null;
  category?: string | null;
}): number {
  const magnitude = Math.abs(Number(entry.amount) || 0);
  return entry.category === CreditTransactionCategory.REFUND
    ? -magnitude
    : magnitude;
}

/** Net usage from usage rows grouped by `category` within `creditUsageSignBuckets`. */
export function netCreditUsage(
  rows: ReadonlyArray<{
    _sum: { amount: number | null };
    category: string | null;
  }>,
): number {
  return rows.reduce(
    (total, row) =>
      total +
      signedCreditUsage({ amount: row._sum.amount, category: row.category }),
    0,
  );
}

/** SQL predicate selecting usage rows of an unaliased `"credit_transactions"`. */
export const CREDIT_USAGE_FILTER_SQL = Prisma.sql`"category" IN (${CreditTransactionCategory.DEDUCT}, ${CreditTransactionCategory.REFUND}) AND "referenceType" IS DISTINCT FROM ${REFERRAL_REWARD_REVERSAL_REFERENCE_TYPE}`;

/** SQL expression for one usage row's signed amount; sum it over usage rows. */
export const CREDIT_USAGE_AMOUNT_SQL = Prisma.sql`CASE WHEN "category" = ${CreditTransactionCategory.REFUND} THEN -ABS("amount") ELSE ABS("amount") END`;

/** SQL expression for a ledger row's brand; older rows carry it on metadata only. */
export const CREDIT_USAGE_BRAND_SQL = Prisma.sql`COALESCE("brandId", NULLIF("metadata"->>'brandId', ''))`;

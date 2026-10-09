import { readArtifactRecord } from '@api/agent-artifacts/agent-artifact-material.util';
import {
  type StrategyBudgetAttribution,
  strategyBudgetAttributionSchema,
} from '@api/collections/credits/services/strategy-budget-attribution.context';
import { CreditReservationStatus } from '@genfeedai/contracts';
import type {
  BreakoutLiveCapacityInput,
  LearningFormat,
} from '@genfeedai/contracts/interfaces';
import { Prisma } from '@genfeedai/prisma';

export type { StrategyBudgetAttribution } from '@api/collections/credits/services/strategy-budget-attribution.context';
export type BreakoutMonthlyUsage =
  | { status: 'held'; reason: 'ledger_usage_unavailable' }
  | {
      status: 'available';
      periodStart: string;
      periodEnd: string;
      spentCredits: number;
      heldCredits: number;
      usedCredits: number;
      dimensionUsage: {
        platforms: Partial<Record<string, number>>;
        formats: Partial<Record<LearningFormat, number>>;
      } | null;
    };
const LIMIT = 2000;
function attribution(metadata: unknown): StrategyBudgetAttribution | null {
  const parsed = strategyBudgetAttributionSchema.safeParse(
    readArtifactRecord(metadata).strategyBudgetAttribution,
  );
  return parsed.success ? parsed.data : null;
}

/** Ledger spend plus remaining live holds. A stored aggregate never gets added to its own ledger. */
export async function readBreakoutMonthlyUsage(
  tx: Prisma.TransactionClient,
  input: Readonly<BreakoutLiveCapacityInput & { storedMonthlyUsed: number }>,
): Promise<BreakoutMonthlyUsage> {
  const now = new Date(input.nowMs);
  if (
    !Number.isSafeInteger(input.nowMs) ||
    !Number.isFinite(now.getTime()) ||
    !Number.isFinite(input.storedMonthlyUsed) ||
    input.storedMonthlyUsed < 0
  )
    throw new RangeError('Valid monthly usage inputs are required');
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  const where = {
    organizationId: input.organizationId,
    isDeleted: false,
    OR: [{ brandId: input.brandId }, { brandId: null }],
  };
  const transactions = await tx.creditTransaction.findMany({
    where: {
      ...where,
      category: { in: ['deduct', 'refund'] },
      createdAt: { gte: start, lt: end },
    },
    select: {
      id: true,
      organizationId: true,
      brandId: true,
      amount: true,
      category: true,
      metadata: true,
      reservationId: true,
      reservation: {
        select: { organizationId: true, brandId: true, metadata: true },
      },
    },
    take: LIMIT + 1,
  });
  // Expiry alone does not release an unknown provider outcome. Carryover holds remain commitments.
  const reservations = await tx.creditReservation.findMany({
    where: { ...where, status: CreditReservationStatus.RESERVED },
    select: {
      id: true,
      organizationId: true,
      brandId: true,
      amount: true,
      settledAmount: true,
      status: true,
      metadata: true,
    },
    take: LIMIT + 1,
  });
  const held = { status: 'held', reason: 'ledger_usage_unavailable' } as const;
  if (transactions.length > LIMIT || reservations.length > LIMIT) return held;
  let spent = new Prisma.Decimal(0);
  let reserved = new Prisma.Decimal(0);
  const platformUsage = new Map<string, Prisma.Decimal>();
  const formatUsage = new Map<LearningFormat, Prisma.Decimal>();
  function add(scope: StrategyBudgetAttribution, amount: Prisma.Decimal) {
    platformUsage.set(
      scope.platform,
      (platformUsage.get(scope.platform) ?? new Prisma.Decimal(0)).plus(amount),
    );
    formatUsage.set(
      scope.format,
      (formatUsage.get(scope.format) ?? new Prisma.Decimal(0)).plus(amount),
    );
  }
  function validScope(
    scope: StrategyBudgetAttribution | null,
    organizationId: string,
    brandId: string | null,
  ) {
    return (
      scope &&
      scope.organizationId === input.organizationId &&
      organizationId === input.organizationId &&
      scope.brandId === input.brandId &&
      (brandId === null || brandId === input.brandId)
    );
  }
  const seen = new Set<string>();
  for (const row of transactions) {
    if (seen.has(row.id) || !Number.isFinite(row.amount)) return held;
    seen.add(row.id);
    const direct = attribution(row.metadata);
    const inherited =
      row.reservation &&
      row.reservation.organizationId === input.organizationId &&
      (row.reservation.brandId === null ||
        row.reservation.brandId === input.brandId)
        ? attribution(row.reservation.metadata)
        : null;
    if (
      direct &&
      inherited &&
      JSON.stringify(direct) !== JSON.stringify(inherited)
    )
      return held;
    const scope = direct ?? inherited;
    if (row.amount === 0) continue;
    if (
      scope?.organizationId === input.organizationId &&
      scope.brandId !== input.brandId &&
      row.brandId === null
    )
      continue;
    // Unknown historical brand/strategy attribution stays unknown, never an invented zero.
    if (!validScope(scope, row.organizationId, row.brandId) || !scope)
      return held;
    if (scope.strategyId !== input.strategyId) continue;
    if (row.category !== 'deduct' && row.category !== 'refund') return held;
    const amount = new Prisma.Decimal(row.amount)
      .abs()
      .times(row.category === 'deduct' ? 1 : -1);
    spent = spent.plus(amount);
    add(scope, amount);
  }
  seen.clear();
  for (const row of reservations) {
    if (
      seen.has(row.id) ||
      !Number.isFinite(row.amount) ||
      row.amount < 0 ||
      row.status !== CreditReservationStatus.RESERVED ||
      (row.settledAmount !== null && row.settledAmount !== 0)
    )
      return held;
    seen.add(row.id);
    const scope = attribution(row.metadata);
    if (row.amount === 0) continue;
    if (
      scope?.organizationId === input.organizationId &&
      scope.brandId !== input.brandId &&
      row.brandId === null
    )
      continue;
    if (!validScope(scope, row.organizationId, row.brandId) || !scope)
      return held;
    if (scope.strategyId !== input.strategyId) continue;
    const amount = new Prisma.Decimal(row.amount);
    reserved = reserved.plus(amount);
    add(scope, amount);
  }
  // Unmatched refunds (including previous-month charges) need reconciliation, not negative spend credit.
  if (
    spent.isNegative() ||
    [...platformUsage.values(), ...formatUsage.values()].some((value) =>
      value.isNegative(),
    )
  )
    return held;
  const counterGap = new Prisma.Decimal(input.storedMonthlyUsed).greaterThan(
    spent,
  );
  const used = Prisma.Decimal.max(spent, input.storedMonthlyUsed).plus(
    reserved,
  );
  if (used.greaterThan(Number.MAX_SAFE_INTEGER)) return held;
  return {
    status: 'available',
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    spentCredits: spent.toNumber(),
    heldCredits: reserved.toNumber(),
    usedCredits: used.toNumber(),
    dimensionUsage: counterGap
      ? null
      : {
          platforms: Object.fromEntries(
            [...platformUsage].map(([key, value]) => [key, value.toNumber()]),
          ),
          formats: Object.fromEntries(
            [...formatUsage].map(([key, value]) => [key, value.toNumber()]),
          ),
        },
  };
}

import {
  readBreakoutMonthlyUsage,
  type StrategyBudgetAttribution,
} from '@api/collections/outliers/services/breakout-monthly-usage.util';
import { CreditReservationStatus, Platform } from '@genfeedai/contracts';
import type {
  CreditReservation,
  CreditTransaction,
  Prisma,
} from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

const input = {
  organizationId: 'org-a',
  brandId: 'brand-a',
  credentialId: 'credential-a',
  strategyId: 'strategy-a',
  platform: Platform.TWITTER,
  nowMs: Date.parse('2026-10-15T12:00:00Z'),
  storedMonthlyUsed: 10,
};
const attribution: StrategyBudgetAttribution = {
  version: 1,
  organizationId: input.organizationId,
  brandId: input.brandId,
  strategyId: input.strategyId,
  platform: Platform.TWITTER,
  format: 'text',
};
const metadata = { strategyBudgetAttribution: attribution };
type Ledger = Pick<
  CreditTransaction,
  | 'id'
  | 'organizationId'
  | 'brandId'
  | 'amount'
  | 'category'
  | 'metadata'
  | 'reservationId'
> & {
  reservation: Pick<
    CreditReservation,
    'organizationId' | 'brandId' | 'metadata'
  > | null;
};
type Hold = Pick<
  CreditReservation,
  | 'id'
  | 'organizationId'
  | 'brandId'
  | 'amount'
  | 'settledAmount'
  | 'status'
  | 'metadata'
>;
function fixture() {
  const rows: Ledger[] = [
    {
      id: 'charge-a',
      organizationId: input.organizationId,
      brandId: input.brandId,
      amount: 10,
      category: 'deduct',
      metadata,
      reservationId: 'settled-a',
      reservation: null,
    },
  ];
  const holds: Hold[] = [
    {
      id: 'hold-a',
      organizationId: input.organizationId,
      brandId: input.brandId,
      amount: 5,
      settledAmount: null,
      status: CreditReservationStatus.RESERVED,
      metadata,
    },
  ];
  const findTransactions = vi.fn(
    async (_query: Prisma.CreditTransactionFindManyArgs) => rows,
  );
  const findReservations = vi.fn(
    async (_query: Prisma.CreditReservationFindManyArgs) => holds,
  );
  const tx = {
    creditTransaction: { findMany: findTransactions },
    creditReservation: { findMany: findReservations },
  } as unknown as Prisma.TransactionClient;
  return { rows, holds, findTransactions, findReservations, tx };
}
describe('common-month actual spend and active reservations', () => {
  it('counts the ledger once and includes active holds in each monthly sub-budget', async () => {
    const h = fixture();
    expect(await readBreakoutMonthlyUsage(h.tx, input)).toEqual({
      status: 'available',
      periodStart: '2026-10-01T00:00:00.000Z',
      periodEnd: '2026-11-01T00:00:00.000Z',
      spentCredits: 10,
      heldCredits: 5,
      usedCredits: 15,
      dimensionUsage: {
        platforms: { [Platform.TWITTER]: 15 },
        formats: { text: 15 },
      },
    });
    expect(h.findTransactions).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: input.organizationId,
          isDeleted: false,
          createdAt: {
            gte: new Date('2026-10-01T00:00:00Z'),
            lt: new Date('2026-11-01T00:00:00Z'),
          },
        }),
      }),
    );
    expect(h.findReservations).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: CreditReservationStatus.RESERVED,
        }),
      }),
    );
    const holdWhere = h.findReservations.mock.calls[0]?.[0];
    expect(JSON.stringify(holdWhere)).not.toContain('expiresAt');
  });
  it('inherits exact scoped settlement attribution and subtracts actual refunds', async () => {
    const h = fixture();
    h.rows[0].metadata = null;
    h.rows[0].reservation = {
      organizationId: input.organizationId,
      brandId: input.brandId,
      metadata,
    };
    h.rows.push({
      ...h.rows[0],
      id: 'refund-a',
      category: 'refund',
      amount: 2,
    });
    expect(
      await readBreakoutMonthlyUsage(h.tx, { ...input, storedMonthlyUsed: 8 }),
    ).toMatchObject({
      spentCredits: 8,
      heldCredits: 5,
      usedCredits: 13,
      dimensionUsage: { formats: { text: 13 } },
    });
  });
  it('keeps an aggregate counter gap explicit without adding the counter to its own ledger', async () => {
    const h = fixture();
    expect(
      await readBreakoutMonthlyUsage(h.tx, { ...input, storedMonthlyUsed: 20 }),
    ).toMatchObject({
      spentCredits: 10,
      heldCredits: 5,
      usedCredits: 25,
      dimensionUsage: null,
    });
  });
  it('does not charge one strategy for a positively attributed other strategy', async () => {
    const h = fixture();
    h.rows.push({
      ...h.rows[0],
      id: 'other-charge',
      amount: 100,
      metadata: {
        strategyBudgetAttribution: { ...attribution, strategyId: 'other' },
      },
    });
    h.holds.push({
      ...h.holds[0],
      id: 'other-hold',
      amount: 100,
      metadata: {
        strategyBudgetAttribution: { ...attribution, strategyId: 'other' },
      },
    });
    expect(await readBreakoutMonthlyUsage(h.tx, input)).toMatchObject({
      usedCredits: 15,
    });
  });
  it.each([
    'legacy',
    'foreign',
    'reservation_conflict',
    'invalid_amount',
    'partial_settlement',
    'duplicate',
    'truncated',
    'unmatched_refund',
  ] as const)('holds ambiguous accounting (%s)', async (reason) => {
    const h = fixture();
    if (reason === 'legacy') h.rows[0].metadata = null;
    if (reason === 'foreign') h.rows[0].organizationId = 'foreign';
    if (reason === 'reservation_conflict')
      h.rows[0].reservation = {
        organizationId: input.organizationId,
        brandId: input.brandId,
        metadata: {
          strategyBudgetAttribution: { ...attribution, format: 'image' },
        },
      };
    if (reason === 'invalid_amount') h.holds[0].amount = Number.NaN;
    if (reason === 'partial_settlement') h.holds[0].settledAmount = 2;
    if (reason === 'duplicate') h.rows.push({ ...h.rows[0] });
    if (reason === 'truncated')
      h.rows.push(
        ...Array.from({ length: 2000 }, (_, index) => ({
          ...h.rows[0],
          id: `row-${index}`,
        })),
      );
    if (reason === 'unmatched_refund') h.rows[0].category = 'refund';
    expect(await readBreakoutMonthlyUsage(h.tx, input)).toEqual({
      status: 'held',
      reason: 'ledger_usage_unavailable',
    });
  });
  it('does not invent allocations for brandless legacy charges or erase unresolved carryover holds', async () => {
    const h = fixture();
    h.rows[0].brandId = null;
    h.rows[0].metadata = null;
    expect(await readBreakoutMonthlyUsage(h.tx, input)).toMatchObject({
      status: 'held',
    });
    h.rows[0].metadata = metadata;
    h.holds[0].metadata = null;
    expect(await readBreakoutMonthlyUsage(h.tx, input)).toMatchObject({
      status: 'held',
    });
  });
});

import { readBreakoutLiveCapacity } from '@api/collections/outliers/services/breakout-live-capacity.util';
import {
  readBreakoutCreditUsage,
  readBreakoutMonthlyUsage,
} from '@api/collections/outliers/services/breakout-monthly-usage.util';
import { Platform, TargetExecutionState } from '@genfeedai/contracts';
import type { BreakoutLiveCapacityInput } from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/collections/outliers/services/breakout-monthly-usage.util',
  () => ({
    readBreakoutMonthlyUsage: vi.fn(),
    readBreakoutCreditUsage: vi.fn(),
  }),
);

const input: BreakoutLiveCapacityInput = {
  organizationId: 'org-a',
  brandId: 'brand-a',
  credentialId: 'credential-a',
  platform: Platform.TWITTER,
  strategyId: 'strategy-a',
  nowMs: Date.parse('2026-10-15T12:00:00.000Z'),
};
function fixture() {
  const strategy = {
    config: {
      dailyCreditBudget: 100,
      dailyCreditsUsed: 5,
      weeklyCreditBudget: 300,
      creditsUsedThisWeek: 10,
      monthToDateCreditsUsed: 20,
      postsPerWeek: 7,
      publishingCeilingPerWeek: 10,
      readyDraftReserve: 3,
      timezone: 'Europe/Malta',
    },
    policies: {
      budgetPolicy: {
        monthlyCreditBudget: 500,
        perPlatformCaps: [] as Array<{ key: string; creditBudget: number }>,
        perFormatCaps: [] as Array<{ key: string; creditBudget: number }>,
      },
    },
    platforms: [Platform.TWITTER],
  };
  const wallet = { balance: 100, heldAmount: 40, version: 4 };
  const findStrategy = vi.fn(async () => strategy);
  const findWallet = vi.fn(async (): Promise<typeof wallet | null> => wallet);
  const findPosts = vi.fn(async () => [
    {
      id: 'post-a',
      groupId: 'group-a',
      publishedAt: new Date(input.nowMs),
      scheduledDate: null as Date | null,
      targetExecutionState: TargetExecutionState.PUBLISHED,
    },
  ]);
  const links = vi.fn(async () => []);
  const tx = {
    agentStrategy: { findFirst: findStrategy },
    credential: { findFirst: vi.fn(async () => ({ id: input.credentialId })) },
    brand: { findFirst: vi.fn(async () => ({ id: input.brandId })) },
    organization: {
      findFirst: vi.fn(async () => ({ billingAccountId: 'billing-a' })),
    },
    billingAccount: {
      findFirst: vi.fn(async () => ({ id: 'billing-a', isDeleted: false })),
    },
    billingAccountOrganization: { findMany: links },
    creditBalance: { findFirst: findWallet },
    post: { findMany: findPosts },
  } as unknown as Prisma.TransactionClient;
  return { tx, strategy, wallet, findWallet, findPosts, findStrategy, links };
}
describe('read-only live breakout capacity evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readBreakoutCreditUsage).mockImplementation(
      async (_tx, snapshot) => ({
        status: 'available',
        periodStart: new Date(snapshot.periodStartMs).toISOString(),
        periodEnd: new Date(snapshot.periodEndMs).toISOString(),
        spentCredits: snapshot.storedUsed,
        heldCredits: 0,
        usedCredits: snapshot.storedUsed,
        dimensionUsage: null,
      }),
    );
    vi.mocked(readBreakoutMonthlyUsage).mockImplementation(
      async (_tx, snapshot) => ({
        status: 'available',
        periodStart: '2026-10-01T00:00:00.000Z',
        periodEnd: '2026-11-01T00:00:00.000Z',
        spentCredits: snapshot.storedMonthlyUsed,
        heldCredits: 0,
        usedCredits: snapshot.storedMonthlyUsed,
        dimensionUsage: null,
      }),
    );
  });
  it('subtracts actual daily and weekly spend plus active holds using the scheduler UTC boundaries', async () => {
    const h = fixture();
    vi.mocked(readBreakoutCreditUsage).mockImplementation(
      async (_tx, snapshot) => ({
        status: 'available',
        periodStart: new Date(snapshot.periodStartMs).toISOString(),
        periodEnd: new Date(snapshot.periodEndMs).toISOString(),
        spentCredits: snapshot.storedUsed,
        heldCredits: 50,
        usedCredits: snapshot.storedUsed + 50,
        dimensionUsage: null,
      }),
    );
    expect(await readBreakoutLiveCapacity(h.tx, input)).toMatchObject({
      budget: { remainingDailyCredits: 45, remainingWeeklyCredits: 240 },
    });
    expect(readBreakoutCreditUsage).toHaveBeenCalledWith(
      h.tx,
      expect.objectContaining({
        periodStartMs: Date.parse('2026-10-15T00:00:00Z'),
        periodEndMs: Date.parse('2026-10-16T00:00:00Z'),
        storedUsed: 5,
      }),
    );
    expect(readBreakoutCreditUsage).toHaveBeenCalledWith(
      h.tx,
      expect.objectContaining({
        periodStartMs: Date.parse('2026-10-12T00:00:00Z'),
        periodEndMs: Date.parse('2026-10-19T00:00:00Z'),
        storedUsed: 10,
      }),
    );
  });
  it('subtracts actual monthly spend plus active holds from configured platform/format sub-budgets', async () => {
    const h = fixture();
    h.strategy.policies.budgetPolicy.perPlatformCaps = [
      { key: Platform.TWITTER, creditBudget: 50 },
    ];
    h.strategy.policies.budgetPolicy.perFormatCaps = [
      { key: 'text', creditBudget: 25 },
    ];
    vi.mocked(readBreakoutMonthlyUsage).mockResolvedValue({
      status: 'available',
      periodStart: '2026-10-01T00:00:00Z',
      periodEnd: '2026-11-01T00:00:00Z',
      spentCredits: 20,
      heldCredits: 5,
      usedCredits: 25,
      dimensionUsage: {
        platforms: { [Platform.TWITTER]: 25 },
        formats: { text: 25 },
      },
    });
    expect(await readBreakoutLiveCapacity(h.tx, input)).toMatchObject({
      capUsageBasis: 'monthly_ledger_and_reservations',
      budget: {
        remainingMonthlyCredits: 475,
        remainingPlatformCredits: 25,
        remainingFormatCredits: { text: 0 },
      },
    });
  });
  it('holds unreadable historical ledger allocation without inventing zero spend', async () => {
    const h = fixture();
    vi.mocked(readBreakoutMonthlyUsage).mockResolvedValue({
      status: 'held',
      reason: 'ledger_usage_unavailable',
    });
    expect(await readBreakoutLiveCapacity(h.tx, input)).toEqual({
      status: 'held',
      reason: 'ledger_usage_unavailable',
    });
  });
  it('resolves the real billing scope and subtracts current held funds', async () => {
    const h = fixture();
    expect(await readBreakoutLiveCapacity(h.tx, input)).toMatchObject({
      status: 'available',
      walletVersion: 4,
      remainingPublicationSlots: 9,
      budget: {
        availableOrganizationCredits: 60,
        remainingDailyCredits: 95,
        remainingWeeklyCredits: 290,
        remainingMonthlyCredits: 480,
        remainingPacingCredits: 480,
      },
    });
    expect(h.findWallet).toHaveBeenCalledWith({
      where: { billingAccountId: 'billing-a', isDeleted: false },
      orderBy: { createdAt: 'asc' },
      select: { balance: true, heldAmount: true, version: true },
    });
    expect(h.findStrategy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: input.strategyId,
          organizationId: input.organizationId,
          brandId: input.brandId,
          isDeleted: false,
          isActive: true,
        },
      }),
    );
  });
  it('counts a content group once across scheduled and published targets', async () => {
    const h = fixture();
    h.findPosts.mockResolvedValue([
      {
        id: 'post-a',
        groupId: 'group-a',
        publishedAt: new Date(input.nowMs),
        scheduledDate: null,
        targetExecutionState: TargetExecutionState.PUBLISHED,
      },
      {
        id: 'post-b',
        groupId: 'group-a',
        publishedAt: new Date(input.nowMs),
        scheduledDate: null,
        targetExecutionState: TargetExecutionState.PUBLISHED,
      },
    ]);
    expect(await readBreakoutLiveCapacity(h.tx, input)).toMatchObject({
      remainingPublicationSlots: 9,
    });
    expect(h.findPosts).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: input.organizationId,
          brandId: input.brandId,
          agentStrategyId: input.strategyId,
          isDeleted: false,
          parentId: null,
        }),
        take: 1001,
      }),
    );
  });
  it('holds a saturated cadence read instead of guessing unused posting slots', async () => {
    const h = fixture();
    h.findPosts.mockResolvedValue(
      Array.from({ length: 1001 }, (_, index) => ({
        id: `post-${index}`,
        groupId: 'group-a',
        publishedAt: new Date(input.nowMs),
        scheduledDate: null,
        targetExecutionState: TargetExecutionState.PUBLISHED,
      })),
    );
    expect(await readBreakoutLiveCapacity(h.tx, input)).toMatchObject({
      cadenceTruncated: true,
      remainingPublicationSlots: null,
    });
  });
  it('does not invent a period or zero spend for configured dimensional caps', async () => {
    const h = fixture();
    h.strategy.policies.budgetPolicy.perPlatformCaps = [
      { key: Platform.TWITTER, creditBudget: 50 },
    ];
    h.strategy.policies.budgetPolicy.perFormatCaps = [
      { key: 'text', creditBudget: 20 },
    ];
    expect(await readBreakoutLiveCapacity(h.tx, input)).toMatchObject({
      capUsageBasis: 'configured_cap_usage_unavailable',
      budget: {
        remainingPlatformCredits: null,
        remainingFormatCredits: { text: null },
      },
    });
  });
  it('preserves ordinary budget pacing rather than borrowing a trend reserve', async () => {
    const h = fixture();
    h.strategy.config.monthToDateCreditsUsed = 400;
    expect(await readBreakoutLiveCapacity(h.tx, input)).toMatchObject({
      budget: { remainingMonthlyCredits: 100, remainingPacingCredits: 0 },
    });
  });
  it('holds invalid caps and missing wallets without creating a balance', async () => {
    const h = fixture();
    h.strategy.policies.budgetPolicy.perFormatCaps = [
      { key: 'unknown-format', creditBudget: 20 },
    ];
    expect(await readBreakoutLiveCapacity(h.tx, input)).toEqual({
      status: 'held',
      reason: 'policy_unreadable',
    });
    expect(h.findWallet).not.toHaveBeenCalled();
    h.strategy.policies.budgetPolicy.perFormatCaps = [];
    h.findWallet.mockResolvedValue(null);
    expect(await readBreakoutLiveCapacity(h.tx, input)).toEqual({
      status: 'held',
      reason: 'wallet_unavailable',
    });
  });
  it('never widens the source account to another strategy platform', async () => {
    const h = fixture();
    h.strategy.platforms = [];
    expect(await readBreakoutLiveCapacity(h.tx, input)).toEqual({
      status: 'held',
      reason: 'account_unavailable',
    });
    expect(h.findWallet).not.toHaveBeenCalled();
  });
});

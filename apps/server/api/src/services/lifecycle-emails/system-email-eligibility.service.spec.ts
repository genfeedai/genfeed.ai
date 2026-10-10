import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import * as deployment from '@genfeedai/config';
import { IngredientStatus } from '@genfeedai/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemEmailEligibilityService } from './system-email-eligibility.service';

const input = {
  organizationId: 'org-1',
  userId: 'user-1',
  templateKey: 'welcome-day-2',
};
// A rollout long past, so windows run from organization creation.
const configGet = vi.fn((key: string): string | undefined =>
  key === 'FREE_TRIAL_ROLLOUT_AT' ? '2026-01-01T00:00:00.000Z' : undefined,
);

function fixture() {
  const prisma = {
    credential: { findFirst: vi.fn().mockResolvedValue(null) },
    article: { findFirst: vi.fn().mockResolvedValue(null) },
    post: { findFirst: vi.fn().mockResolvedValue(null) },
    ingredient: { findFirst: vi.fn().mockResolvedValue({ id: 'asset-1' }) },
    organization: { findFirst: vi.fn().mockResolvedValue({ id: 'org-1' }) },
    creditBalance: {
      findFirst: vi.fn().mockResolvedValue({ balance: 1200, heldAmount: 400 }),
    },
    lifecycleEmailDelivery: {
      findFirst: vi.fn().mockResolvedValue({ status: 'canceled' }),
    },
    creditTransaction: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  return {
    prisma,
    service: new SystemEmailEligibilityService(
      prisma as unknown as PrismaService,
      { apiUrl: '', get: configGet },
    ),
  };
}

describe('send-time system email eligibility', () => {
  it('suppresses a connection nudge if an account was connected after scheduling', async () => {
    const { prisma, service } = fixture();
    prisma.credential.findFirst.mockResolvedValue({ id: 'credential-1' });
    expect(await service.shouldSend(input)).toBe(false);
    expect(prisma.credential.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          isDeleted: false,
          isConnected: true,
        }),
      }),
    );
  });
  it('requires the same brand to have a connection for its reminder', async () => {
    const { prisma, service } = fixture();
    expect(
      await service.shouldSend({
        ...input,
        templateKey: 'publishing-connection',
        policyData: { brandId: 'brand-1' },
      }),
    ).toBe(true);
    expect(prisma.credential.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ brandId: 'brand-1' }),
      }),
    );
  });
  it('subtracts held credits and cancels low-balance email after a top-up', async () => {
    const { prisma, service } = fixture();
    const lowCredit = {
      ...input,
      templateKey: 'credit-low',
      policyData: { lowCreditThreshold: 1000 },
    };
    expect(await service.shouldSend(lowCredit)).toBe(true);
    prisma.creditBalance.findFirst.mockResolvedValue({
      balance: 5000,
      heldAmount: 400,
    });
    expect(await service.shouldSend(lowCredit)).toBe(false);
  });
  it('judges a low-balance email against the relative threshold it was queued with', async () => {
    const { service } = fixture();
    // 800 spendable: low against a 1000-credit threshold, not against 500.
    expect(
      await service.shouldSend({
        ...input,
        templateKey: 'credit-low',
        policyData: { lowCreditThreshold: 500 },
      }),
    ).toBe(false);
    expect(
      await service.shouldSend({ ...input, templateKey: 'credit-low' }),
    ).toBe(false);
  });
  it('cancels checkout recovery when checkout completed while delivery was pending', async () => {
    const { service } = fixture();
    expect(
      await service.shouldSend({
        ...input,
        templateKey: 'checkout-recovery',
        policyData: { lifecycleDeliveryId: 'delivery-1' },
      }),
    ).toBe(false);
  });
  it('rejects a stale generation email after a different completion replaces it', async () => {
    const { prisma, service } = fixture();
    prisma.ingredient.findFirst.mockResolvedValue({
      status: IngredientStatus.GENERATED,
      generationStartedAt: new Date('2026-09-09T12:00:00Z'),
      generationCompletedAt: new Date('2026-09-09T12:04:00Z'),
      s3Key: 'output.mp4',
    });
    expect(
      await service.shouldSend({
        ...input,
        templateKey: 'generation-ready',
        policyData: {
          assetId: 'asset-1',
          completedAt: '2026-09-09T12:03:00.000Z',
          status: IngredientStatus.GENERATED,
        },
      }),
    ).toBe(false);
  });
  it('refuses an unconfirmed purchase receipt', async () => {
    const { service } = fixture();
    expect(
      await service.shouldSend({
        ...input,
        templateKey: 'credit-purchase-confirmation',
        policyData: { transactionId: 'txn-1' },
      }),
    ).toBe(false);
  });
});

describe('free-trial notice eligibility at send time', () => {
  const HOUR_MS = 3_600_000;
  const neverPaid = (
    createdHoursAgo: number,
    subscriptions: unknown[] = [],
  ) => ({
    billingAccount: null,
    createdAt: new Date(Date.now() - createdHoursAgo * HOUR_MS),
    creditTransactions: [],
    isProactiveOnboarding: false,
    subscriptions,
    user: { userSubscription: null },
    warmupAccounts: [],
  });

  beforeEach(() => {
    vi.spyOn(deployment, 'usesMeteredCredits').mockReturnValue(true);
    vi.spyOn(deployment, 'isSelfHostedDeployment').mockReturnValue(false);
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['trial-ending', 50, true],
    ['trial-ending', 80, false],
    ['trial-credits-low', 10, true],
    ['trial-credits-low', 80, false],
    ['trial-ended', 80, true],
  ])('%s at %sh after creation → %s', async (templateKey, hours, expected) => {
    const { prisma, service } = fixture();
    prisma.organization.findFirst.mockResolvedValue(neverPaid(hours));
    expect(await service.shouldSend({ ...input, templateKey })).toBe(expected);
  });

  it('keeps "ends soon" for a legacy organization inside its rollout grace', async () => {
    const { prisma, service } = fixture();
    prisma.organization.findFirst.mockResolvedValue(neverPaid(24 * 400));
    configGet.mockImplementationOnce(() =>
      new Date(Date.now() - 50 * HOUR_MS).toISOString(),
    );
    expect(
      await service.shouldSend({ ...input, templateKey: 'trial-ending' }),
    ).toBe(true);
  });

  it.each(['trial-ending', 'trial-ended', 'trial-credits-low'])(
    'drops %s once the organization has paid',
    async (templateKey) => {
      const { prisma, service } = fixture();
      prisma.organization.findFirst.mockResolvedValue(
        neverPaid(80, [{ id: 'sub' }]),
      );
      expect(await service.shouldSend({ ...input, templateKey })).toBe(false);
    },
  );
});

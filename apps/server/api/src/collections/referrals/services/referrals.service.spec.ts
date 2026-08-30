import { ReferralsService } from '@api/collections/referrals/services/referrals.service';
import {
  ActivitySource,
  ReferralClaimStatus,
  ReferralRewardStatus,
  ReferralStatus,
} from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { ActivitiesService } from '@server/collections/activities/services/activities.service';
import { BillingAccountsService } from '@server/collections/billing-accounts/services/billing-accounts.service';
import { CreditsUtilsService } from '@server/collections/credits/services/credits.utils.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const configMock = vi.hoisted(() => ({ organizationBilling: true }));

vi.mock('@genfeedai/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/config')>()),
  hasOrganizationBilling: () => configMock.organizationBilling,
}));

type MockFn = ReturnType<typeof vi.fn>;

type PrismaMock = {
  billingAccountOrganization: { findFirst: MockFn; findMany: MockFn };
  billingAccountMember: { findFirst: MockFn; findMany: MockFn };
  creditTransaction: { findFirst: MockFn };
  organization: { findFirst: MockFn; findMany: MockFn };
  referral: { count: MockFn; create: MockFn; findFirst: MockFn };
  referralCode: { create: MockFn; findFirst: MockFn; update: MockFn };
  referralReward: {
    count: MockFn;
    create: MockFn;
    findFirst: MockFn;
    findMany: MockFn;
    groupBy: MockFn;
    update: MockFn;
    updateMany: MockFn;
  };
  subscription: { findFirst: MockFn };
};

const ACTOR = { organizationId: 'org_referred', userId: 'user_referred' };
const NOW = new Date('2026-08-30T00:00:00.000Z');

function reward(overrides: Record<string, unknown> = {}) {
  return {
    attemptCount: 0,
    cancelledAt: null,
    createdAt: NOW,
    eligibleAt: NOW,
    failureReason: null,
    grantTransaction: null,
    grantTransactionId: null,
    grantedAt: null,
    id: 'reward_1',
    isDeleted: false,
    lockedAt: null,
    grossAmountCents: 10_000,
    netAmountCents: 10_000,
    purchasedCredits: 10_000,
    nextAttemptAt: NOW,
    referral: {
      code: {
        isActive: true,
        isDeleted: false,
        ownerUserId: 'user_referrer',
        rewardBillingAccountId: 'ba_referrer',
        rewardOrganizationId: 'org_referrer',
      },
      codeId: 'code_1',
      id: 'referral_1',
      referredBillingAccountId: 'ba_referred',
      referredOrganizationId: 'org_referred',
      referrerBillingAccountId: 'ba_referrer',
      referrerOrganizationId: 'org_referrer',
      status: ReferralStatus.ACTIVE,
    },
    referralCodeId: 'code_1',
    referralId: 'referral_1',
    refundedAmountCents: 0,
    reversedAt: null,
    reversedCredits: 0,
    rewardCredits: 1_000,
    status: ReferralRewardStatus.PENDING,
    stripeCheckoutSessionId: 'cs_1',
    stripePaymentIntentId: 'pi_1',
    updatedAt: NOW,
    ...overrides,
  };
}

describe('ReferralsService', () => {
  let prisma: PrismaMock;
  let service: ReferralsService;
  let credits: {
    addOrganizationCreditsWithExpiration: MockFn;
    deductCreditsFromOrganization: MockFn;
    getOrganizationCreditsBalance: MockFn;
  };
  let activities: { create: MockFn };

  beforeEach(() => {
    configMock.organizationBilling = true;
    prisma = {
      billingAccountOrganization: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi
          .fn()
          .mockResolvedValue([{ organizationId: ACTOR.organizationId }]),
      },
      billingAccountMember: {
        findFirst: vi.fn().mockResolvedValue({ id: 'member_1' }),
        findMany: vi.fn().mockResolvedValue([{ userId: ACTOR.userId }]),
      },
      creditTransaction: { findFirst: vi.fn().mockResolvedValue(null) },
      organization: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([{ id: ACTOR.organizationId }]),
      },
      referral: {
        count: vi.fn(),
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      referralCode: {
        create: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      referralReward: {
        count: vi.fn(),
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        groupBy: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      subscription: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    credits = {
      addOrganizationCreditsWithExpiration: vi.fn(),
      deductCreditsFromOrganization: vi.fn(),
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(0),
    };
    const billing = {
      resolveForOrganization: vi.fn().mockResolvedValue({ id: 'ba_referred' }),
    };
    const config = { get: vi.fn().mockReturnValue('https://app.example.test') };
    const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
    activities = { create: vi.fn() };
    service = new ReferralsService(
      prisma as unknown as PrismaService,
      billing as unknown as BillingAccountsService,
      credits as unknown as CreditsUtilsService,
      config as unknown as ConfigService,
      logger as unknown as LoggerService,
      activities as unknown as ActivitiesService,
    );
  });

  it('rejects a referral to the same billing account', async () => {
    prisma.referralCode.findFirst.mockResolvedValue({
      id: 'code_1',
      rewardBillingAccountId: 'ba_referred',
    });

    await expect(service.claim(ACTOR, 'validcode1')).resolves.toEqual({
      isAccepted: false,
      status: ReferralClaimStatus.INELIGIBLE,
    });
    expect(prisma.referral.create).not.toHaveBeenCalled();
  });

  it('rejects billing accounts that share an active member', async () => {
    prisma.referralCode.findFirst.mockResolvedValue({
      id: 'code_1',
      rewardBillingAccountId: 'ba_referrer',
      rewardOrganizationId: 'org_referrer',
    });
    prisma.billingAccountMember.findFirst
      .mockResolvedValueOnce({ id: 'target_member' })
      .mockResolvedValueOnce({ id: 'shared_member' });

    const result = await service.claim(ACTOR, 'validcode1');

    expect(result.status).toBe(ReferralClaimStatus.INELIGIBLE);
    expect(prisma.referral.create).not.toHaveBeenCalled();
  });

  it('creates one immutable first-touch attribution for an eligible account', async () => {
    prisma.referralCode.findFirst.mockResolvedValue({
      id: 'code_1',
      rewardBillingAccountId: 'ba_referrer',
      rewardOrganizationId: 'org_referrer',
    });
    prisma.billingAccountMember.findFirst
      .mockResolvedValueOnce({ id: 'target_member' })
      .mockResolvedValueOnce(null);
    prisma.referral.create.mockResolvedValue({ id: 'referral_1' });

    const result = await service.claim(ACTOR, 'validcode1');

    expect(result).toEqual({
      isAccepted: true,
      status: ReferralClaimStatus.ACCEPTED,
    });
    expect(prisma.referral.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        codeId: 'code_1',
        referredBillingAccountId: 'ba_referred',
        referredOrganizationId: 'org_referred',
        referrerBillingAccountId: 'ba_referrer',
        referrerOrganizationId: 'org_referrer',
        rewardEndsAt: expect.any(Date),
        status: ReferralStatus.ACTIVE,
      }),
    });
  });

  it('rejects an account with a prior PAYG purchase in any linked organization', async () => {
    prisma.referralCode.findFirst.mockResolvedValue({
      id: 'code_1',
      rewardBillingAccountId: 'ba_referrer',
      rewardOrganizationId: 'org_referrer',
    });
    prisma.billingAccountMember.findFirst
      .mockResolvedValueOnce({ id: 'target_member' })
      .mockResolvedValueOnce(null);
    prisma.billingAccountOrganization.findMany.mockResolvedValue([
      { organizationId: ACTOR.organizationId },
      { organizationId: 'org_linked_2' },
    ]);
    prisma.organization.findMany.mockResolvedValue([
      { id: ACTOR.organizationId },
      { id: 'org_linked_2' },
    ]);
    prisma.creditTransaction.findFirst.mockResolvedValue({ id: 'tx_paid' });

    const result = await service.claim(ACTOR, 'validcode1');

    expect(result.status).toBe(ReferralClaimStatus.INELIGIBLE);
    expect(prisma.creditTransaction.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: expect.objectContaining({
        organizationId: { in: [ACTOR.organizationId, 'org_linked_2'] },
        source: {
          in: [ActivitySource.PAY_AS_YOU_GO, 'pay-as-you-go'],
        },
      }),
    });
    expect(prisma.referral.create).not.toHaveBeenCalled();
  });

  it('rejects an account with a prior subscription in any linked organization', async () => {
    prisma.referralCode.findFirst.mockResolvedValue({
      id: 'code_1',
      rewardBillingAccountId: 'ba_referrer',
      rewardOrganizationId: 'org_referrer',
    });
    prisma.billingAccountMember.findFirst
      .mockResolvedValueOnce({ id: 'target_member' })
      .mockResolvedValueOnce(null);
    prisma.billingAccountOrganization.findMany.mockResolvedValue([
      { organizationId: ACTOR.organizationId },
      { organizationId: 'org_linked_2' },
    ]);
    prisma.organization.findMany.mockResolvedValue([
      { id: ACTOR.organizationId },
      { id: 'org_linked_2' },
    ]);
    prisma.subscription.findFirst.mockResolvedValue({ id: 'sub_paid' });

    const result = await service.claim(ACTOR, 'validcode1');

    expect(result.status).toBe(ReferralClaimStatus.INELIGIBLE);
    expect(prisma.subscription.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        isDeleted: false,
        organizationId: { in: [ACTOR.organizationId, 'org_linked_2'] },
        stripeSubscriptionId: { not: null },
      },
    });
    expect(prisma.referral.create).not.toHaveBeenCalled();
  });

  it('creates a seven-day pending reward worth ten percent of net PAYG spend', async () => {
    prisma.referral.findFirst.mockResolvedValue({
      codeId: 'code_1',
      id: 'referral_1',
    });
    prisma.referralReward.create.mockResolvedValue(reward());

    await service.recordPaygPurchase({
      grossAmountCents: 14_814,
      netAmountCents: 12_345,
      organizationId: ACTOR.organizationId,
      purchasedCredits: 12_345,
      stripeCheckoutSessionId: 'cs_1',
      stripePaymentIntentId: 'pi_1',
    });

    expect(prisma.referralReward.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        grossAmountCents: 14_814,
        netAmountCents: 12_345,
        referralCodeId: 'code_1',
        referralId: 'referral_1',
        rewardCredits: 1_234,
        status: ReferralRewardStatus.PENDING,
        stripeCheckoutSessionId: 'cs_1',
      }),
    });
    const data = prisma.referralReward.create.mock.calls[0]?.[0].data;
    expect(data.eligibleAt.getTime() - data.nextAttemptAt.getTime()).toBe(0);
  });

  it('adjusts a pending reward to the remaining net purchase after a partial refund', async () => {
    prisma.referralReward.findMany.mockResolvedValue([{ id: 'reward_1' }]);
    prisma.referralReward.findFirst.mockResolvedValue(reward());

    await service.applyPaymentReversal({
      disputed: false,
      refundedAmountCents: 2_500,
      stripePaymentIntentId: 'pi_1',
    });

    expect(prisma.referralReward.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        refundedAmountCents: 2_500,
        rewardCredits: 750,
        status: ReferralRewardStatus.PENDING,
      }),
      where: {
        id: 'reward_1',
        isDeleted: false,
        lockedAt: expect.any(Date),
      },
    });
    expect(credits.deductCreditsFromOrganization).not.toHaveBeenCalled();
  });

  it('debits only the newly reversed portion of a granted reward', async () => {
    prisma.referralReward.findMany.mockResolvedValue([{ id: 'reward_1' }]);
    prisma.referralReward.findFirst.mockResolvedValue(
      reward({
        refundedAmountCents: 2_000,
        grantedAt: NOW,
        grantTransactionId: 'tx_grant',
        reversedCredits: 200,
        status: ReferralRewardStatus.GRANTED,
      }),
    );

    await service.applyPaymentReversal({
      disputed: false,
      refundedAmountCents: 5_000,
      stripePaymentIntentId: 'pi_1',
    });

    expect(credits.deductCreditsFromOrganization).toHaveBeenCalledWith(
      'org_referrer',
      'user_referrer',
      300,
      'Referral reward reversal',
      expect.any(String),
      expect.objectContaining({
        idempotencyKey: 'referral-reward-reversal:reward_1:5000',
        maxOverdraftCredits: 300,
      }),
    );
    expect(prisma.referralReward.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        refundedAmountCents: 5_000,
        reversedCredits: 500,
        status: ReferralRewardStatus.GRANTED,
      }),
      where: {
        id: 'reward_1',
        isDeleted: false,
        lockedAt: expect.any(Date),
      },
    });
  });

  it('normalizes tax-inclusive partial refunds to the pre-tax reward basis', async () => {
    prisma.referralReward.findMany.mockResolvedValue([{ id: 'reward_1' }]);
    prisma.referralReward.findFirst.mockResolvedValue(
      reward({ grossAmountCents: 12_000 }),
    );

    await service.applyPaymentReversal({
      disputed: false,
      refundedAmountCents: 6_000,
      stripePaymentIntentId: 'pi_1',
    });

    expect(prisma.referralReward.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        refundedAmountCents: 5_000,
        rewardCredits: 500,
      }),
      where: {
        id: 'reward_1',
        isDeleted: false,
        lockedAt: expect.any(Date),
      },
    });
  });

  it('composes the overdraft allowance with an existing negative balance', async () => {
    prisma.referralReward.findMany.mockResolvedValue([{ id: 'reward_1' }]);
    prisma.referralReward.findFirst.mockResolvedValue(
      reward({ grantedAt: NOW, grantTransactionId: 'tx_grant' }),
    );
    credits.getOrganizationCreditsBalance.mockResolvedValue(-100);

    await service.applyPaymentReversal({
      disputed: true,
      refundedAmountCents: 10_000,
      stripePaymentIntentId: 'pi_1',
    });

    expect(credits.deductCreditsFromOrganization).toHaveBeenCalledWith(
      'org_referrer',
      'user_referrer',
      1_000,
      'Referral reward reversal',
      expect.any(String),
      expect.objectContaining({ maxOverdraftCredits: 1_100 }),
    );
  });

  it('fails with a retryable error when settlement owns the reward lease', async () => {
    prisma.referralReward.findMany.mockResolvedValue([{ id: 'reward_1' }]);
    prisma.referralReward.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.applyPaymentReversal({
        disputed: false,
        refundedAmountCents: 5_000,
        stripePaymentIntentId: 'pi_1',
      }),
    ).rejects.toThrow('retry payment reversal');
    expect(credits.deductCreditsFromOrganization).not.toHaveBeenCalled();
  });

  it('settles a due reward once and binds the durable ledger transaction', async () => {
    prisma.referralReward.findMany.mockResolvedValue([{ id: 'reward_1' }]);
    prisma.referralReward.findFirst.mockResolvedValue(reward());
    prisma.organization.findFirst.mockResolvedValue({ id: 'org_referrer' });
    prisma.creditTransaction.findFirst.mockResolvedValue({
      id: 'tx_grant',
      organizationId: 'org_referrer',
    });

    await service.settleDueRewards();

    expect(credits.addOrganizationCreditsWithExpiration).toHaveBeenCalledWith(
      'org_referrer',
      1_000,
      ActivitySource.REFERRAL,
      'Referral purchase reward',
      expect.any(Date),
      expect.objectContaining({
        idempotencyKey: 'referral-reward-grant:reward_1',
      }),
    );
    expect(prisma.referralReward.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        grantTransactionId: 'tx_grant',
        lockedAt: null,
        status: ReferralRewardStatus.GRANTED,
      }),
      where: {
        id: 'reward_1',
        isDeleted: false,
        lockedAt: expect.any(Date),
        status: ReferralRewardStatus.PROCESSING,
      },
    });
    expect(prisma.creditTransaction.findFirst).toHaveBeenCalledWith({
      where: {
        idempotencyKey: 'referral-reward-grant:reward_1',
        isDeleted: false,
      },
    });
    expect(activities.create).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_referrer' }),
    );
  });

  it('finalizes an idempotent grant against its original destination', async () => {
    prisma.referralReward.findMany.mockResolvedValue([{ id: 'reward_1' }]);
    prisma.referralReward.findFirst.mockResolvedValue(reward());
    prisma.organization.findFirst.mockResolvedValue({ id: 'org_fallback' });
    prisma.creditTransaction.findFirst.mockResolvedValue({
      id: 'tx_grant',
      organizationId: 'org_original',
    });

    await service.settleDueRewards();

    expect(credits.addOrganizationCreditsWithExpiration).toHaveBeenCalledWith(
      'org_fallback',
      expect.any(Number),
      expect.any(String),
      expect.any(String),
      expect.any(Date),
      expect.objectContaining({
        idempotencyKey: 'referral-reward-grant:reward_1',
      }),
    );
    expect(prisma.referralReward.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        grantTransactionId: 'tx_grant',
        status: ReferralRewardStatus.GRANTED,
      }),
      where: expect.objectContaining({ id: 'reward_1', isDeleted: false }),
    });
    expect(activities.create).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_original' }),
    );
  });

  it('requeues a failed settlement with a guarded exponential backoff', async () => {
    prisma.referralReward.findMany.mockResolvedValue([{ id: 'reward_1' }]);
    prisma.referralReward.findFirst
      .mockResolvedValueOnce(reward())
      .mockResolvedValueOnce({ attemptCount: 2 });
    prisma.organization.findFirst.mockResolvedValue(null);
    prisma.billingAccountOrganization.findMany.mockResolvedValue([]);

    await service.settleDueRewards();

    expect(prisma.referralReward.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        failureReason: 'Referral reward destination is no longer eligible',
        lockedAt: null,
        nextAttemptAt: expect.any(Date),
        status: ReferralRewardStatus.FAILED,
      }),
      where: {
        id: 'reward_1',
        isDeleted: false,
        lockedAt: expect.any(Date),
        status: ReferralRewardStatus.PROCESSING,
      },
    });
  });

  it('recovers expired settlement and reversal leases before selecting work', async () => {
    prisma.referralReward.findMany.mockResolvedValue([]);

    await service.settleDueRewards();

    expect(prisma.referralReward.updateMany).toHaveBeenNthCalledWith(1, {
      data: {
        failureReason: 'Settlement lease expired',
        lockedAt: null,
        nextAttemptAt: expect.any(Date),
        status: ReferralRewardStatus.FAILED,
      },
      where: {
        isDeleted: false,
        lockedAt: { lt: expect.any(Date) },
        status: ReferralRewardStatus.PROCESSING,
      },
    });
    expect(prisma.referralReward.updateMany).toHaveBeenNthCalledWith(2, {
      data: { lockedAt: null },
      where: {
        isDeleted: false,
        lockedAt: { lt: expect.any(Date) },
        status: { not: ReferralRewardStatus.PROCESSING },
      },
    });
  });

  it('does not run settlement in community mode', async () => {
    configMock.organizationBilling = false;

    await service.settleDueRewards();

    expect(prisma.referralReward.updateMany).not.toHaveBeenCalled();
    expect(prisma.referralReward.findMany).not.toHaveBeenCalled();
  });

  it('counts failed rewards consistently as converted and pending', async () => {
    prisma.referralCode.findFirst.mockResolvedValue({
      code: 'frend2345xyz',
      createdAt: NOW,
      id: 'code_1',
      isDeleted: false,
      updatedAt: NOW,
    });
    prisma.referral.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    prisma.referralReward.groupBy.mockResolvedValue([
      {
        _sum: { reversedCredits: 0, rewardCredits: 250 },
        status: ReferralRewardStatus.FAILED,
      },
    ]);
    prisma.referralReward.findMany.mockResolvedValue([]);

    const result = await service.getMine(ACTOR);

    expect(prisma.referral.count).toHaveBeenNthCalledWith(2, {
      where: expect.objectContaining({
        rewards: {
          some: {
            isDeleted: false,
            status: {
              in: expect.arrayContaining([ReferralRewardStatus.FAILED]),
            },
          },
        },
      }),
    });
    expect(result).toMatchObject({ convertedCount: 1, pendingCredits: 250 });
  });

  it('bounds direct admin pagination before calculating Prisma skip', async () => {
    prisma.referralReward.findMany.mockResolvedValue([]);
    prisma.referralReward.count.mockResolvedValue(0);

    await service.listAdmin({
      limit: 100,
      page: Number.MAX_SAFE_INTEGER,
    });

    expect(prisma.referralReward.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 99_999_900,
        take: 100,
      }),
    );
  });

  it('reactivates a soft-deleted code instead of violating its unique key', async () => {
    prisma.referralCode.findFirst.mockResolvedValue({
      id: 'code_1',
      isDeleted: true,
    });
    prisma.referralCode.update.mockResolvedValue({
      code: 'restoredcode',
      createdAt: NOW,
      id: 'code_1',
      isDeleted: false,
      updatedAt: NOW,
    });
    prisma.referral.count.mockResolvedValue(0);
    prisma.referralReward.groupBy.mockResolvedValue([]);
    prisma.referralReward.findMany.mockResolvedValue([]);

    await service.getMine(ACTOR);

    expect(prisma.referralCode.update).toHaveBeenCalledWith({
      data: {
        isActive: true,
        isDeleted: false,
        rewardOrganizationId: ACTOR.organizationId,
      },
      where: { id: 'code_1' },
    });
  });
});

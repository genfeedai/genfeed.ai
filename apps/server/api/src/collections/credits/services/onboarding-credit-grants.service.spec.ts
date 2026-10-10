import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { FreeTrialService } from '@api/collections/credits/services/free-trial.service';
import { OnboardingCreditGrantsService } from '@api/collections/credits/services/onboarding-credit-grants.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import {
  type PrismaTransactionClient,
  TransactionUtil,
} from '@api/helpers/utils/transaction/transaction.util';
import * as deployment from '@genfeedai/config';
import type { IFreeTrialState } from '@genfeedai/contracts/interfaces/billing';
import {
  type IOnboardingJourneyMissionState,
  ONBOARDING_JOURNEY_MISSIONS,
  ONBOARDING_SIGNUP_GIFT_CREDITS,
  ONBOARDING_TRIAL_CREDITS,
} from '@genfeedai/contracts/types';
import { LoggerService } from '@libs/logger/logger.service';

// A transactional snapshot model exercises lost-update retries and rollback without
// letting mock writes leak out of an aborted transaction.
describe('OnboardingCreditGrantsService', () => {
  let missions: IOnboardingJourneyMissionState[];
  let balance: number;
  let revision: number;
  let ledger: string[];
  let failUpdate: boolean;
  const organization = {
    id: 'org',
    userId: 'user',
    billingAccountId: 'billing',
  };
  const historicalGift = vi.fn();
  const findOrganization = vi.fn();
  const effects = vi.fn();
  const trialState = vi.fn<() => Promise<IFreeTrialState>>();
  const logger = { warn: vi.fn() };
  const grants = vi.fn(
    async (
      input: { creditsToAdd: number; options: { idempotencyKey: string } },
      tx: PrismaTransactionClient,
    ) => {
      const state = tx as unknown as { balance: number; ledger: string[] };
      const wasApplied = !state.ledger.includes(input.options.idempotencyKey);
      const currentBalance = state.balance;
      if (wasApplied) {
        state.balance += input.creditsToAdd;
        state.ledger.push(input.options.idempotencyKey);
      }
      return { currentBalance, newBalance: state.balance, wasApplied };
    },
  );
  const transaction = vi.fn(
    async (operation: (tx: PrismaTransactionClient) => Promise<unknown>) => {
      const startRevision = revision;
      const state = {
        balance,
        ledger: [...ledger],
        missions: structuredClone(missions),
      };
      const tx = Object.assign(state, {
        organization: { findFirst: findOrganization },
        creditTransaction: { findFirst: historicalGift },
        organizationSetting: {
          findFirst: async () => ({
            id: 'settings',
            onboardingJourneyMissions: state.missions,
          }),
          update: async ({
            data,
          }: {
            data: {
              onboardingJourneyMissions: IOnboardingJourneyMissionState[];
            };
          }) => {
            if (failUpdate) throw new Error('settings failure');
            state.missions = data.onboardingJourneyMissions;
          },
        },
      });
      const result = await operation(tx as unknown as PrismaTransactionClient);
      if (startRevision !== revision) throw { code: 'P2034' };
      balance = state.balance;
      ledger = state.ledger;
      missions = state.missions;
      revision += 1;
      return result;
    },
  );
  const service = new OnboardingCreditGrantsService(
    { runInTransaction: transaction } as unknown as TransactionUtil,
    {
      normalizeJourneyState:
        OrganizationSettingsService.prototype.normalizeJourneyState,
    } as OrganizationSettingsService,
    {
      addPromotionalCreditsInTransaction: grants,
      publishCreditAddition: effects,
    } as unknown as CreditsUtilsService,
    { getState: trialState } as unknown as FreeTrialService,
    logger as unknown as LoggerService,
  );
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(deployment, 'isSelfHostedDeployment').mockReturnValue(false);
    vi.spyOn(deployment, 'usesMeteredCredits').mockReturnValue(true);
    missions = OrganizationSettingsService.prototype.normalizeJourneyState();
    balance = 0;
    revision = 0;
    ledger = [];
    failUpdate = false;
    historicalGift.mockResolvedValue(null);
    findOrganization.mockResolvedValue(organization);
    trialState.mockResolvedValue({
      isTrialExpired: false,
      trialEndsAt: new Date('2026-10-13T00:00:00.000Z'),
    });
  });
  afterEach(() => vi.restoreAllMocks());
  it('grants each mission once across concurrent retries and retains provenance', async () => {
    await Promise.all([
      service.completeMissions('org', ['complete_company_info'], 'user'),
      service.completeMissions('org', ['complete_company_info'], 'user'),
    ]);
    await service.completeMissions('org', ['complete_company_info'], 'user');
    expect(balance).toBe(25);
    expect(ledger).toHaveLength(1);
    expect(grants).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'onboarding-journey',
        options: expect.objectContaining({
          actorUserId: 'user',
          referenceId: 'complete_company_info',
          metadata: expect.objectContaining({
            kind: 'promotional',
            missionId: 'complete_company_info',
          }),
        }),
      }),
      expect.anything(),
    );
  });
  it('uses the durable mission key even if a claim flag was reset', async () => {
    await service.completeMissions('org', ['complete_company_info']);
    const completedMission = missions.find(
      (mission) => mission.id === 'complete_company_info',
    );
    if (!completedMission) throw new Error('Missing mission fixture');
    completedMission.rewardClaimed = false;
    await service.completeMissions('org', []);
    expect(balance).toBe(25);
    expect(ledger).toHaveLength(1);
  });
  it('does not duplicate credits when post-commit effects fail and callers retry', async () => {
    effects.mockRejectedValueOnce(new Error('cache unavailable'));
    await expect(
      service.completeMissions('org', ['complete_company_info']),
    ).rejects.toThrow('cache unavailable');
    await service.completeMissions('org', ['complete_company_info']);
    expect(balance).toBe(25);
    expect(ledger).toHaveLength(1);
    expect(effects).toHaveBeenCalledTimes(2);
  });
  it('keeps concurrent signup retries at a single 25-credit entitlement', async () => {
    await Promise.all([
      service.grantSignupGift('org', 'user'),
      service.grantSignupGift('org', 'user'),
    ]);
    expect(balance).toBe(25);
    expect(ledger).toHaveLength(1);
  });
  it('merges different concurrent missions from fresh state', async () => {
    await Promise.all([
      service.completeMissions('org', ['complete_company_info']),
      service.completeMissions('org', ['publish_first_post']),
    ]);
    expect(missions.filter((m) => m.rewardClaimed)).toHaveLength(2);
    expect(ledger).toHaveLength(2);
  });
  it('rolls ledger and balance back when storing claims fails', async () => {
    failUpdate = true;
    await expect(
      service.completeMissions('org', ['complete_company_info']),
    ).rejects.toThrow('settings failure');
    expect(balance).toBe(0);
    expect(ledger).toEqual([]);
    expect(missions.some((m) => m.rewardClaimed)).toBe(false);
    expect(effects).not.toHaveBeenCalled();
  });
  it('retries serialization failures with serializable isolation', async () => {
    transaction.mockRejectedValueOnce({ code: 'P2034' });
    await service.completeMissions('org', ['complete_company_info']);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(balance).toBe(25);
  });
  it.each(['40001', '40P01'])(
    'retries raw SQL transaction conflicts with SQLSTATE %s',
    async (sqlState) => {
      transaction.mockRejectedValueOnce({
        code: 'P2010',
        meta: { code: sqlState },
      });
      await service.completeMissions('org', ['complete_company_info']);
      expect(transaction).toHaveBeenCalledTimes(2);
      expect(balance).toBe(25);
      expect(ledger).toHaveLength(1);
    },
  );
  it.each(['40001', '40P01'])(
    'retries Prisma 7 adapter-pg conflicts with originalCode %s',
    async (originalCode) => {
      transaction.mockRejectedValueOnce({
        code: 'P2010',
        meta: {
          driverAdapterError: Object.assign(new Error('DriverAdapterError'), {
            cause: {
              originalCode,
              originalMessage:
                'could not serialize access due to concurrent update',
              kind: 'TransactionWriteConflict',
            },
          }),
        },
      });
      await service.completeMissions('org', ['complete_company_info']);
      expect(transaction).toHaveBeenCalledTimes(2);
      expect(balance).toBe(25);
      expect(ledger).toHaveLength(1);
    },
  );
  it.each([
    { code: 'P2010', meta: { code: '23505' } },
    {
      code: 'P2010',
      meta: { driverAdapterError: { cause: { originalCode: '23505' } } },
    },
    {
      code: 'P2010',
      meta: { driverAdapterError: { cause: { originalCode: 40001 } } },
    },
    { code: 'P2010', meta: { driverAdapterError: { cause: null } } },
    { code: 'P2010', meta: { driverAdapterError: null } },
    { code: 'P2010', meta: { code: 40001 } },
    { code: 'P2010', meta: null },
    { code: 'P2010', meta: '40001' },
    { code: 'P2010' },
    { code: 'P2002', meta: { code: '40001' } },
    '40001',
    null,
  ])('does not retry unrelated or malformed errors: %j', async (error) => {
    transaction.mockRejectedValueOnce(error);
    await expect(
      service.completeMissions('org', ['complete_company_info']),
    ).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(balance).toBe(0);
    expect(ledger).toEqual([]);
    expect(effects).not.toHaveBeenCalled();
  });
  it.each([
    {
      code: 'P2010',
      meta: { driverAdapterError: { cause: { originalCode: '40001' } } },
    },
    { code: 'P2034' },
    { code: 'P2010', meta: { code: '40001' } },
    { code: 'P2010', meta: { code: '40P01' } },
  ])('throws the original conflict after three attempts: %j', async (error) => {
    transaction
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error);
    await expect(
      service.completeMissions('org', ['complete_company_info']),
    ).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(balance).toBe(0);
    expect(ledger).toEqual([]);
    expect(effects).not.toHaveBeenCalled();
  });
  it('does not regrant legacy claimed missions', async () => {
    missions[0].rewardClaimed = true;
    missions[0].isCompleted = true;
    await service.completeMissions('org', []);
    expect(grants).not.toHaveBeenCalled();
  });
  it('preserves the 25 signup and 175 mission reward amounts', async () => {
    await service.grantSignupGift('org', 'user');
    expect(balance).toBe(25);
    await service.completeMissions(
      'org',
      ONBOARDING_JOURNEY_MISSIONS.map((m) => m.id),
    );
    expect(balance).toBe(200);
  });
  it('suppresses historical signup gifts even after all credits expired or were spent', async () => {
    historicalGift.mockResolvedValue({ id: 'legacy', amount: 25 });
    await service.grantSignupGift('org', 'user');
    expect(grants).not.toHaveBeenCalled();
    expect(historicalGift).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ source: 'onboarding-signup-gift' }),
      }),
    );
  });
  it('only recovers ordinary owner signup gifts', async () => {
    findOrganization.mockResolvedValue(null);
    await service.grantSignupGift('org', 'invited');
    expect(grants).not.toHaveBeenCalled();
    expect(findOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'invited',
          isProactiveOnboarding: false,
          warmupAccounts: { none: { isDeleted: false } },
        }),
      }),
    );
    findOrganization.mockResolvedValue(organization);
    await service.grantSignupGift('org', 'user');
    expect(balance).toBe(25);
  });
  describe('free-trial credits (finish or skip)', () => {
    it('grants 75 credits once per user across a finish, a skip and concurrent retries', async () => {
      const results = await Promise.all([
        service.grantTrialCredits('org', 'user'),
        service.grantTrialCredits('org', 'user'),
      ]);
      const retry = await service.grantTrialCredits('org', 'user');

      expect(ONBOARDING_TRIAL_CREDITS).toBe(75);
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(retry).toBe(false);
      expect(balance).toBe(75);
      expect(ledger).toEqual(['onboarding:trial:user']);
      expect(grants).toHaveBeenCalledWith(
        expect.objectContaining({
          creditsToAdd: 75,
          source: 'onboarding-trial',
          options: expect.objectContaining({
            actorUserId: 'user',
            billingAccountId: 'billing',
            idempotencyKey: 'onboarding:trial:user',
            metadata: { kind: 'promotional', campaign: 'onboarding-trial' },
          }),
        }),
        expect.anything(),
      );
      expect(effects).toHaveBeenCalledTimes(1);
      expect(effects).toHaveBeenCalledWith(
        'org',
        75,
        expect.objectContaining({ wasApplied: true }),
      );
    });

    it('stacks on the 25-credit signup gift and the per-answer rewards', async () => {
      await service.grantSignupGift('org', 'user');
      await service.grantOnboardingAnswerCredits('org', 'brand-1', ['goals']);
      await service.grantTrialCredits('org', 'user');

      expect(balance).toBe(ONBOARDING_SIGNUP_GIFT_CREDITS + 5 + 75);
      expect(ledger).toEqual([
        'onboarding:welcome:user',
        'onboarding:answer:brand-1:goals',
        'onboarding:trial:user',
      ]);
    });

    it('is suppressed by a historical trial grant on any organization the user owns', async () => {
      historicalGift.mockResolvedValue({ id: 'earlier', amount: 75 });

      await expect(service.grantTrialCredits('org', 'user')).resolves.toBe(
        false,
      );
      expect(grants).not.toHaveBeenCalled();
      expect(historicalGift).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            source: 'onboarding-trial',
            OR: expect.arrayContaining([
              { idempotencyKey: 'onboarding:trial:user' },
              { organization: { userId: 'user' } },
            ]),
          }),
        }),
      );
    });

    it('skips proactive, warm-up and non-owner workspaces like the signup gift', async () => {
      findOrganization.mockResolvedValue(null);

      await expect(service.grantTrialCredits('org', 'invited')).resolves.toBe(
        false,
      );
      expect(grants).not.toHaveBeenCalled();
      expect(findOrganization).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'invited',
            isProactiveOnboarding: false,
            warmupAccounts: { none: { isDeleted: false } },
          }),
        }),
      );
    });

    it('never grants when billing is off or the deployment is self-hosted', async () => {
      vi.mocked(deployment.usesMeteredCredits).mockReturnValue(false);
      await expect(service.grantTrialCredits('org', 'user')).resolves.toBe(
        false,
      );
      vi.mocked(deployment.usesMeteredCredits).mockReturnValue(true);
      vi.mocked(deployment.isSelfHostedDeployment).mockReturnValue(true);
      await expect(service.grantTrialCredits('org', 'user')).resolves.toBe(
        false,
      );
      expect(transaction).not.toHaveBeenCalled();
      expect(grants).not.toHaveBeenCalled();
    });

    it('grants nothing once the trial is already over', async () => {
      trialState.mockResolvedValue({
        isTrialExpired: true,
        trialEndsAt: new Date('2026-10-01T00:00:00.000Z'),
      });

      await expect(service.grantTrialCredits('org', 'user')).resolves.toBe(
        false,
      );
      expect(transaction).not.toHaveBeenCalled();
    });

    it('logs and swallows a failed grant on the best-effort path', async () => {
      transaction.mockRejectedValueOnce(new Error('ledger down'));

      await expect(
        service.grantTrialCreditsBestEffort('org', 'user'),
      ).resolves.toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        'Could not grant free-trial credits',
        expect.objectContaining({
          error: 'ledger down',
          organizationId: 'org',
        }),
      );
    });
  });

  it('pays +5 once per brand per answered card across retries and concurrent saves', async () => {
    const [first, concurrent] = await Promise.all([
      service.grantOnboardingAnswerCredits(
        'org',
        'brand-1',
        ['goals', 'audience', 'goals'],
        'user',
      ),
      service.grantOnboardingAnswerCredits('org', 'brand-1', ['goals']),
    ]);
    const retry = await service.grantOnboardingAnswerCredits('org', 'brand-1', [
      'goals',
      'audience',
    ]);
    const otherBrand = await service.grantOnboardingAnswerCredits(
      'org',
      'brand-2',
      ['goals'],
    );
    expect([...first, ...concurrent].sort()).toEqual(['audience', 'goals']);
    expect(retry).toEqual([]);
    expect(otherBrand).toEqual(['goals']);
    expect(balance).toBe(15);
    expect(ledger).toEqual([
      'onboarding:answer:brand-1:goals',
      'onboarding:answer:brand-1:audience',
      'onboarding:answer:brand-2:goals',
    ]);
    expect(grants).toHaveBeenCalledWith(
      expect.objectContaining({
        creditsToAdd: 5,
        source: 'onboarding-answer',
        options: expect.objectContaining({
          actorUserId: 'user',
          referenceId: 'brand-1',
          metadata: expect.objectContaining({ fieldId: 'audience' }),
        }),
      }),
      expect.anything(),
    );
  });
  it('never pays answer credits when credits are not metered', async () => {
    vi.mocked(deployment.usesMeteredCredits).mockReturnValue(false);
    expect(
      await service.grantOnboardingAnswerCredits('org', 'brand-1', ['goals']),
    ).toEqual([]);
    vi.mocked(deployment.usesMeteredCredits).mockReturnValue(true);
    vi.mocked(deployment.isSelfHostedDeployment).mockReturnValue(true);
    expect(
      await service.grantOnboardingAnswerCredits('org', 'brand-1', ['goals']),
    ).toEqual([]);
    expect(grants).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
  it('persists self-hosted completion without calling the metered implementation', async () => {
    vi.mocked(deployment.isSelfHostedDeployment).mockReturnValue(true);
    vi.mocked(deployment.usesMeteredCredits).mockReturnValue(false);
    await service.grantSignupGift('org', 'user');
    await service.completeMissions('org', ['complete_company_info']);
    expect(
      missions.find((m) => m.id === 'complete_company_info')?.isCompleted,
    ).toBe(true);
    expect(grants).not.toHaveBeenCalled();
  });
});

describe('OnboardingCreditGrantsService.captureOnboardingCompletedBestEffort (genfeedai/genfeed.ai#4969)', () => {
  it('captures onboarding_completed through the injected funnel capture service', () => {
    const funnelCaptureService = {
      capture: vi.fn().mockResolvedValue(undefined),
    };
    const service = new OnboardingCreditGrantsService(
      {} as unknown as TransactionUtil,
      {} as unknown as OrganizationSettingsService,
      {} as unknown as CreditsUtilsService,
      {} as unknown as FreeTrialService,
      {} as unknown as LoggerService,
      funnelCaptureService as never,
    );

    service.captureOnboardingCompletedBestEffort('user-1');

    expect(funnelCaptureService.capture).toHaveBeenCalledTimes(1);
    expect(funnelCaptureService.capture).toHaveBeenCalledWith({
      distinctId: 'user-1',
      event: 'onboarding_completed',
    });
  });

  it('is a no-op when no funnel capture service is configured', () => {
    const service = new OnboardingCreditGrantsService(
      {} as unknown as TransactionUtil,
      {} as unknown as OrganizationSettingsService,
      {} as unknown as CreditsUtilsService,
      {} as unknown as FreeTrialService,
      {} as unknown as LoggerService,
    );

    expect(() =>
      service.captureOnboardingCompletedBestEffort('user-1'),
    ).not.toThrow();
  });
});

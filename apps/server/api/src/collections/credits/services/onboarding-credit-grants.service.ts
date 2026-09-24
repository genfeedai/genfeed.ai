import { isCreditTransactionConflict } from '@api/collections/credits/services/credit-transaction-conflict';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import {
  type PrismaTransactionClient,
  TransactionUtil,
} from '@api/helpers/utils/transaction/transaction.util';
import { isSelfHostedDeployment, usesMeteredCredits } from '@genfeedai/config';
import { CreditTransactionCategory } from '@genfeedai/contracts';
import {
  type IOnboardingJourneyMissionState,
  ONBOARDING_SIGNUP_GIFT_CREDITS,
  type OnboardingJourneyMissionId,
} from '@genfeedai/contracts/types';
import { toPrismaJson } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';

const REWARD_EXPIRY_MS = 365 * 24 * 60 * 60 * 1000;
const WELCOME_CAMPAIGN = 'onboarding-signup-gift';

@Injectable()
export class OnboardingCreditGrantsService {
  constructor(
    private readonly transactionUtil: TransactionUtil,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly creditsUtilsService: CreditsUtilsService,
  ) {}

  async grantSignupGift(organizationId: string, userId: string): Promise<void> {
    if (!usesMeteredCredits()) return;
    const result = await this.runSerializable(async (tx) => {
      const organization = await tx.organization.findFirst({
        where: {
          id: organizationId,
          isDeleted: false,
          userId,
          isProactiveOnboarding: false,
          warmupAccounts: { none: { isDeleted: false } },
        },
      });
      if (!organization) return null;
      const idempotencyKey = `onboarding:welcome:${userId}`;
      // tenant-scope-ignore: the welcome entitlement is user-scoped across owned organizations; historical ledger evidence survives spent/expired credit buckets.
      const existing = await tx.creditTransaction.findFirst({
        where: {
          category: CreditTransactionCategory.ADD,
          isDeleted: false,
          source: WELCOME_CAMPAIGN,
          OR: [
            { idempotencyKey },
            { actorUserId: userId },
            { organization: { userId } },
          ],
        },
      });
      if (existing)
        return existing.organizationId === organizationId
          ? {
              currentBalance: existing.balanceAfter ?? 0,
              newBalance: existing.balanceAfter ?? 0,
              wasApplied: false,
            }
          : null;
      return this.creditsUtilsService.addPromotionalCreditsInTransaction(
        {
          creditsToAdd: ONBOARDING_SIGNUP_GIFT_CREDITS,
          description: 'Signup gift credits',
          expiresAt: new Date(Date.now() + REWARD_EXPIRY_MS),
          organizationId,
          source: WELCOME_CAMPAIGN,
          options: {
            actorUserId: userId,
            billingAccountId: organization.billingAccountId ?? undefined,
            idempotencyKey,
            referenceId: userId,
            referenceType: WELCOME_CAMPAIGN,
            metadata: { kind: 'promotional', campaign: WELCOME_CAMPAIGN },
          },
        },
        tx,
      );
    });
    if (result)
      await this.creditsUtilsService.publishCreditAddition(
        organizationId,
        ONBOARDING_SIGNUP_GIFT_CREDITS,
        result,
      );
  }

  async completeMissions(
    organizationId: string,
    completedIds: readonly OnboardingJourneyMissionId[],
    actorUserId?: string,
  ): Promise<IOnboardingJourneyMissionState[]> {
    const metered = usesMeteredCredits() && !isSelfHostedDeployment();
    const outcome = await this.runSerializable(async (tx) => {
      const settings = await tx.organizationSetting.findFirst({
        where: { organizationId },
      });
      if (!settings) return { missions: [], additions: [] };
      const missions = this.organizationSettingsService.normalizeJourneyState(
        settings.onboardingJourneyMissions as unknown as IOnboardingJourneyMissionState[],
      );
      const additions = [];
      for (const mission of missions) {
        if (completedIds.includes(mission.id)) {
          mission.isCompleted = true;
          mission.completedAt ??= new Date();
        }
        if (!metered) {
          mission.rewardClaimed = false;
          mission.rewardCredits = 0;
          continue;
        }
        if (!mission.isCompleted || mission.rewardClaimed) continue;
        const result =
          await this.creditsUtilsService.addPromotionalCreditsInTransaction(
            {
              creditsToAdd: mission.rewardCredits,
              description: `Onboarding journey reward: ${mission.id}`,
              expiresAt: new Date(Date.now() + REWARD_EXPIRY_MS),
              organizationId,
              source: 'onboarding-journey',
              options: {
                actorUserId,
                idempotencyKey: `onboarding:mission:${organizationId}:${mission.id}`,
                referenceId: mission.id,
                referenceType: 'onboarding-journey',
                metadata: {
                  kind: 'promotional',
                  campaign: 'onboarding-journey',
                  missionId: mission.id,
                },
              },
            },
            tx,
          );
        mission.rewardClaimed = true;
        additions.push({ credits: mission.rewardCredits, result });
      }
      await tx.organizationSetting.update({
        where: { id: settings.id, organizationId },
        data: {
          ...(metered && missions.some((mission) => mission.rewardClaimed)
            ? { hasEverHadCredits: true }
            : {}),
          onboardingJourneyMissions: toPrismaJson(missions),
          onboardingJourneyCompletedAt: missions.every((m) => m.isCompleted)
            ? (settings.onboardingJourneyCompletedAt ?? new Date())
            : null,
        },
      });
      return { missions, additions };
    });
    if (
      metered &&
      outcome.additions.length === 0 &&
      outcome.missions.some((mission) => mission.rewardClaimed)
    ) {
      await this.creditsUtilsService.publishCreditAddition(organizationId, 0, {
        currentBalance: 0,
        newBalance: 0,
        wasApplied: false,
      });
    }
    for (const addition of outcome.additions)
      await this.creditsUtilsService.publishCreditAddition(
        organizationId,
        addition.credits,
        addition.result,
      );
    return outcome.missions;
  }

  private async runSerializable<T>(
    operation: (tx: PrismaTransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.transactionUtil.runInTransaction(operation, {
          isolationLevel: 'Serializable',
        });
      } catch (error: unknown) {
        if (!isCreditTransactionConflict(error) || attempt === 2) throw error;
      }
    }
    throw new Error('Onboarding grant exhausted serialization retries');
  }
}

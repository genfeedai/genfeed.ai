import { isCreditTransactionConflict } from '@api/collections/credits/services/credit-transaction-conflict';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import {
  type PrismaTransactionClient,
  TransactionUtil,
} from '@api/helpers/utils/transaction/transaction.util';
import {
  captureOnboardingCompletedBestEffort as captureOnboardingCompletedEvent,
  ServerFunnelCaptureService,
} from '@api/services/analytics/server-funnel-capture.service';
import { isSelfHostedDeployment, usesMeteredCredits } from '@genfeedai/config';
import { CreditTransactionCategory } from '@genfeedai/contracts';
import type { OnboardingAnswerFieldId } from '@genfeedai/contracts/interfaces';
import {
  type IOnboardingJourneyMissionState,
  ONBOARDING_ANSWER_REWARD_CREDITS,
  ONBOARDING_SIGNUP_GIFT_CREDITS,
  type OnboardingJourneyMissionId,
} from '@genfeedai/contracts/types';
import { toPrismaJson } from '@genfeedai/prisma';
import { crossOrgUnsafe } from '@libs/prisma/tenant-context';
import { Injectable, Optional } from '@nestjs/common';

const REWARD_EXPIRY_MS = 365 * 24 * 60 * 60 * 1000;
const WELCOME_CAMPAIGN = 'onboarding-signup-gift';
const ANSWER_CAMPAIGN = 'onboarding-answer';

@Injectable()
export class OnboardingCreditGrantsService {
  constructor(
    private readonly transactionUtil: TransactionUtil,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly creditsUtilsService: CreditsUtilsService,
    @Optional()
    private readonly funnelCaptureService?: ServerFunnelCaptureService,
  ) {}

  /**
   * Fire-and-forget PostHog capture for the `onboarding_completed` funnel
   * event (genfeedai/genfeed.ai#4969), added here — an existing dependency of
   * `AgentOnboardingToolHandler`, already at its constructor-dependency limit
   * — rather than as a new dependency of that handler. Delegates to the
   * shared `captureOnboardingCompletedBestEffort` in
   * `server-funnel-capture.service.ts`, the single emission point every
   * onboarding-completion surface (agent-first here, the classic wizard via
   * `UsersController#completeOnboardingFunnel`) shares (genfeedai/genfeed.ai#5311).
   * Callers gate on their own atomic false->true claim so this fires exactly
   * once per user, never on a repeat or losing side of a race. Never throws:
   * `ServerFunnelCaptureService.capture` already catches and reports its own
   * failures.
   */
  captureOnboardingCompletedBestEffort(userId: string): void {
    captureOnboardingCompletedEvent(this.funnelCaptureService, userId);
  }

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
      const existing = await crossOrgUnsafe(
        async () =>
          // tenant-scope-ignore: the welcome entitlement is user-scoped across owned organizations; historical ledger evidence survives spent/expired credit buckets.
          await tx.creditTransaction.findFirst({
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
          }),
      );
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

  /**
   * +5 credits for each answered onboarding card, once per brand per field.
   * The ledger idempotency key is the guard, so re-saving an answer, a retry
   * or a concurrent save never pays twice. Skips never reach this method.
   * Returns the field ids that were paid in this call.
   */
  async grantOnboardingAnswerCredits(
    organizationId: string,
    brandId: string,
    fieldIds: readonly OnboardingAnswerFieldId[],
    actorUserId?: string,
  ): Promise<OnboardingAnswerFieldId[]> {
    if (
      fieldIds.length === 0 ||
      !usesMeteredCredits() ||
      isSelfHostedDeployment()
    )
      return [];
    const additions = await this.runSerializable(async (tx) => {
      const paid: Array<{
        fieldId: OnboardingAnswerFieldId;
        result: Awaited<
          ReturnType<CreditsUtilsService['addPromotionalCreditsInTransaction']>
        >;
      }> = [];
      for (const fieldId of new Set(fieldIds)) {
        const result =
          await this.creditsUtilsService.addPromotionalCreditsInTransaction(
            {
              creditsToAdd: ONBOARDING_ANSWER_REWARD_CREDITS,
              description: `Onboarding answer reward: ${fieldId}`,
              expiresAt: new Date(Date.now() + REWARD_EXPIRY_MS),
              organizationId,
              source: ANSWER_CAMPAIGN,
              options: {
                actorUserId,
                idempotencyKey: `onboarding:answer:${brandId}:${fieldId}`,
                referenceId: brandId,
                referenceType: ANSWER_CAMPAIGN,
                metadata: {
                  kind: 'promotional',
                  campaign: ANSWER_CAMPAIGN,
                  fieldId,
                },
              },
            },
            tx,
          );
        if (result.wasApplied) paid.push({ fieldId, result });
      }
      return paid;
    });
    for (const addition of additions)
      await this.creditsUtilsService.publishCreditAddition(
        organizationId,
        ONBOARDING_ANSWER_REWARD_CREDITS,
        addition.result,
      );
    return additions.map((addition) => addition.fieldId);
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

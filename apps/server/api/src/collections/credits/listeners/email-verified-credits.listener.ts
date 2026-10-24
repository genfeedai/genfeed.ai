import { BETTER_AUTH_EMAIL_VERIFIED_EVENT } from '@api/auth/better-auth/better-auth.constants';
import type { IBetterAuthEmailVerifiedEvent } from '@api/auth/better-auth/better-auth.types';
import { OnboardingCreditGrantsService } from '@api/collections/credits/services/onboarding-credit-grants.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { crossOrgUnsafe } from '@libs/prisma/tenant-context';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

/**
 * Releases the free credits an email/password signup could not collect before
 * its mailbox was verified: the signup gift, and the trial credits when
 * onboarding was already finished or skipped. Both grants are idempotent per
 * user and apply their own eligibility rules, so a repeat verification, an
 * already-credited user or an ineligible one is a no-op. Never throws: a
 * failed grant must not break the verification redirect, and the next
 * onboarding finish retries the trial grant.
 */
@Injectable()
export class EmailVerifiedCreditsListener {
  private readonly context = { service: EmailVerifiedCreditsListener.name };

  constructor(
    private readonly prisma: PrismaService,
    private readonly onboardingCreditGrantsService: OnboardingCreditGrantsService,
    private readonly logger: LoggerService,
  ) {}

  @OnEvent(BETTER_AUTH_EMAIL_VERIFIED_EVENT)
  async handleEmailVerified(
    event: IBetterAuthEmailVerifiedEvent,
  ): Promise<void> {
    try {
      // tenant-scope-ignore: resolves the organization a just-verified user owns, before any tenant context exists.
      const organization = await crossOrgUnsafe(
        async () =>
          // tenant-scope-ignore: resolves the organization a just-verified user owns, before any tenant context exists.
          await this.prisma.organization.findFirst({
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              user: { select: { isOnboardingCompleted: true } },
            },
            where: {
              isDeleted: false,
              isProactiveOnboarding: false,
              userId: event.userId,
            },
          }),
      );
      if (!organization) {
        return;
      }
      await this.onboardingCreditGrantsService.grantSignupGift(
        organization.id,
        event.userId,
        { ipAddress: event.ipAddress },
      );
      if (organization.user.isOnboardingCompleted) {
        await this.onboardingCreditGrantsService.grantTrialCreditsBestEffort(
          organization.id,
          event.userId,
          { ipAddress: event.ipAddress },
        );
      }
    } catch (error: unknown) {
      this.logger.warn(
        'Could not release free credits after email verification',
        {
          ...this.context,
          error: error instanceof Error ? error.message : String(error),
          userId: event.userId,
        },
      );
    }
  }
}

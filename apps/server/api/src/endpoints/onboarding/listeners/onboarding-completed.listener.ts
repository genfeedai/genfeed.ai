import {
  type IOnboardingFunnelCompletedEvent,
  ONBOARDING_FUNNEL_COMPLETED_EVENT,
} from '@api/endpoints/onboarding/onboarding.events';
import { ProactiveOnboardingService } from '@api/endpoints/onboarding/proactive-onboarding.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

/**
 * Marks a proactive onboarding lead paid once the user completes the funnel.
 *
 * `PATCH /users/me { isOnboardingCompleted: true }` (UsersController) emits
 * {@link ONBOARDING_FUNNEL_COMPLETED_EVENT} instead of calling into
 * OnboardingService directly. Handling it here keeps the proactive-lead cascade
 * behind OnboardingModule without UsersModule importing OnboardingModule — the
 * back-import that previously closed the UsersModule ↔ OnboardingModule cycle
 * (REST audit #1354).
 */
@Injectable()
export class OnboardingCompletedListener {
  private readonly context = 'OnboardingCompletedListener';

  constructor(
    private readonly proactiveOnboardingService: ProactiveOnboardingService,
    private readonly logger: LoggerService,
  ) {}

  @OnEvent(ONBOARDING_FUNNEL_COMPLETED_EVENT)
  async handleFunnelCompleted(
    event: IOnboardingFunnelCompletedEvent,
  ): Promise<void> {
    const { proactiveLeadId, organizationId } = event;

    if (!proactiveLeadId || !organizationId) {
      return;
    }

    try {
      await this.proactiveOnboardingService.markPaymentMade(
        proactiveLeadId,
        organizationId,
      );
    } catch (error: unknown) {
      // Best-effort: a lead-status mismatch must never surface — the user has
      // already completed the funnel (paid via Stripe) before this fires.
      this.logger.warn(`${this.context} markPaymentMade skipped`, {
        error: error instanceof Error ? error.message : error,
        organizationId,
        proactiveLeadId,
      });
    }
  }
}

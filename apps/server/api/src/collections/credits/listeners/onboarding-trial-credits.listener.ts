import { OnboardingCreditGrantsService } from '@api/collections/credits/services/onboarding-credit-grants.service';
import { ORGANIZATION_ONBOARDING_FINISHED_EVENT } from '@api/collections/organizations/constants/organization-events.constants';
import type { OrganizationOnboardingFinishedEvent } from '@api/collections/organizations/organization-events.types';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

/**
 * Grants the free-trial credits when onboarding is finished or skipped. The
 * classic completion and skip endpoints live in modules that cannot import
 * `CreditsModule` without a cycle, so they emit the event and this listener
 * pays. The grant is idempotent per user and never throws.
 */
@Injectable()
export class OnboardingTrialCreditsListener {
  constructor(
    private readonly onboardingCreditGrantsService: OnboardingCreditGrantsService,
  ) {}

  @OnEvent(ORGANIZATION_ONBOARDING_FINISHED_EVENT)
  async handleOnboardingFinished(
    event: OrganizationOnboardingFinishedEvent,
  ): Promise<void> {
    await this.onboardingCreditGrantsService.grantTrialCreditsBestEffort(
      event.organizationId,
      event.userId,
    );
  }
}

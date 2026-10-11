import { OnboardingTrialCreditsListener } from '@api/collections/credits/listeners/onboarding-trial-credits.listener';
import { OnboardingCreditGrantsService } from '@api/collections/credits/services/onboarding-credit-grants.service';
import { ORGANIZATION_ONBOARDING_FINISHED_EVENT } from '@api/collections/organizations/constants/organization-events.constants';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

describe('OnboardingTrialCreditsListener', () => {
  it.each(['completed', 'skipped'] as const)(
    'grants the trial credits when onboarding is %s',
    async (outcome) => {
      const grants = {
        grantTrialCreditsBestEffort: vi.fn().mockResolvedValue(true),
      };
      const module = await Test.createTestingModule({
        imports: [EventEmitterModule.forRoot()],
        providers: [
          OnboardingTrialCreditsListener,
          {
            provide: OnboardingCreditGrantsService,
            useValue: grants,
          },
        ],
      }).compile();
      await module.init();

      await module
        .get(EventEmitter2)
        .emitAsync(ORGANIZATION_ONBOARDING_FINISHED_EVENT, {
          organizationId: 'org-1',
          outcome,
          userId: 'user-1',
        });

      expect(grants.grantTrialCreditsBestEffort).toHaveBeenCalledWith(
        'org-1',
        'user-1',
      );
      await module.close();
    },
  );
});

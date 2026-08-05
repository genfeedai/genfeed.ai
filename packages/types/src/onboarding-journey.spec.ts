import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_JOURNEY_MISSIONS,
  resolveMissionCtaHref,
} from './onboarding-journey';

describe('resolveMissionCtaHref', () => {
  it.each([
    ['complete_company_info', '/agent/onboarding'],
    ['connect_social_account', '/settings/brands'],
    ['generate_first_image', '/settings/api-keys'],
    ['generate_first_video', '/settings/api-keys'],
    ['publish_first_post', '/agent/onboarding'],
  ] as const)('resolves %s to %s for self-hosted', (missionId, expected) => {
    const definition = ONBOARDING_JOURNEY_MISSIONS.find(
      (mission) => mission.id === missionId,
    );

    expect(definition).toBeDefined();
    if (!definition) {
      throw new Error(`Missing mission definition: ${missionId}`);
    }
    expect(resolveMissionCtaHref(definition, { isSelfHosted: true })).toBe(
      expected,
    );
  });

  it('never routes a self-hosted operator into the classic wizard', () => {
    for (const definition of ONBOARDING_JOURNEY_MISSIONS) {
      expect(
        resolveMissionCtaHref(definition, { isSelfHosted: true }),
      ).not.toMatch(/^\/onboarding\//);
    }
  });

  it('preserves the classic SaaS CTA destinations', () => {
    for (const definition of ONBOARDING_JOURNEY_MISSIONS) {
      expect(resolveMissionCtaHref(definition, { isSelfHosted: false })).toBe(
        definition.ctaHref,
      );
    }
  });
});

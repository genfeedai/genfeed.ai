import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_ANSWER_FIELD_IDS,
  ONBOARDING_ANSWER_REWARD_CREDITS,
  ONBOARDING_ANSWER_TOTAL_CREDITS,
  ONBOARDING_JOURNEY_MISSIONS,
  ONBOARDING_JOURNEY_TOTAL_CREDITS,
  ONBOARDING_SIGNUP_GIFT_CREDITS,
  ONBOARDING_TOTAL_VISIBLE_CREDITS,
  resolveMissionCtaHref,
} from './onboarding-journey';

describe('resolveMissionCtaHref', () => {
  it.each([
    ['complete_company_info', '/onboarding/brand'],
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

  it('never routes a self-hosted operator into the providers wizard', () => {
    for (const definition of ONBOARDING_JOURNEY_MISSIONS) {
      const href = resolveMissionCtaHref(definition, { isSelfHosted: true });
      expect(href).not.toMatch(/^\/onboarding\/providers(?:\/|$)/);
      if (definition.id !== 'complete_company_info') {
        expect(href).not.toMatch(/^\/onboarding\//);
      }
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

describe('onboarding credit economics', () => {
  const rewardFor = (missionId: string): number =>
    ONBOARDING_JOURNEY_MISSIONS.find((mission) => mission.id === missionId)
      ?.rewardCredits ?? 0;

  it('keeps the ungated signup grant small', () => {
    expect(ONBOARDING_SIGNUP_GIFT_CREDITS).toBe(25);
  });

  it('puts most journey credits behind a real social account and a publish', () => {
    const provenRewards =
      rewardFor('connect_social_account') + rewardFor('publish_first_post');

    expect(provenRewards).toBeGreaterThan(
      ONBOARDING_JOURNEY_TOTAL_CREDITS - provenRewards,
    );
  });

  it('pays +5 per onboarding card and keeps all answers below the proven rewards', () => {
    const provenRewards =
      rewardFor('connect_social_account') + rewardFor('publish_first_post');

    expect(ONBOARDING_ANSWER_FIELD_IDS).toEqual([
      'goals',
      'audience',
      'offer',
      'competitors',
      'platforms',
      'tone',
      'cadence',
    ]);
    expect(ONBOARDING_ANSWER_REWARD_CREDITS).toBe(5);
    expect(ONBOARDING_ANSWER_TOTAL_CREDITS).toBe(35);
    expect(
      ONBOARDING_SIGNUP_GIFT_CREDITS + ONBOARDING_ANSWER_TOTAL_CREDITS,
    ).toBeLessThan(provenRewards);
  });

  it('counts the gift, answers and journey in the visible total', () => {
    expect(ONBOARDING_TOTAL_VISIBLE_CREDITS).toBe(235);
  });
});

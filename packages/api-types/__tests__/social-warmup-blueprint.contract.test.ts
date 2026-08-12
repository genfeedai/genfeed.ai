import {
  findSocialWarmupBlueprint,
  getCurrentSocialWarmupBlueprint,
  INSTAGRAM_SOCIAL_WARMUP_BLUEPRINT,
  INSTAGRAM_SOCIAL_WARMUP_BLUEPRINT_ID,
  INSTAGRAM_SOCIAL_WARMUP_BLUEPRINT_VERSION,
  resolveSocialWarmupBlueprint,
  SOCIAL_WARMUP_BLUEPRINT_CATALOG,
  selectCurrentSocialWarmupBlueprint,
  socialWarmupBlueprintSchema,
  socialWarmupStepSchema,
  TIKTOK_SOCIAL_WARMUP_BLUEPRINT,
  TIKTOK_SOCIAL_WARMUP_BLUEPRINT_ID,
  TIKTOK_SOCIAL_WARMUP_BLUEPRINT_VERSION,
  TWITTER_SOCIAL_WARMUP_BLUEPRINT,
  TWITTER_SOCIAL_WARMUP_BLUEPRINT_ID,
  TWITTER_SOCIAL_WARMUP_BLUEPRINT_VERSION,
} from '@api-types/contracts/social-warmup-blueprint.contract';
import { CredentialPlatform } from '@genfeedai/enums';
import { describe, expect, test } from 'vitest';

describe('social warm-up blueprint contract', () => {
  test('publishes the canonical TikTok 5–7 day progression', () => {
    expect(TIKTOK_SOCIAL_WARMUP_BLUEPRINT).toMatchObject({
      id: TIKTOK_SOCIAL_WARMUP_BLUEPRINT_ID,
      lastReviewedOn: '2026-08-11',
      platform: CredentialPlatform.TIKTOK,
      version: TIKTOK_SOCIAL_WARMUP_BLUEPRINT_VERSION,
    });

    expect(
      TIKTOK_SOCIAL_WARMUP_BLUEPRINT.phases.map((phase) => ({
        endDay: phase.endDay,
        id: phase.id,
        startDay: phase.startDay,
      })),
    ).toEqual([
      {
        endDay: 3,
        id: 'native-consumption-and-engagement',
        startDay: 1,
      },
      { endDay: 5, id: 'profile-and-feed-tuning', startDay: 4 },
      { endDay: 7, id: 'gradual-first-uploads', startDay: 6 },
    ]);

    expect(TIKTOK_SOCIAL_WARMUP_BLUEPRINT.graduation).toMatchObject({
      minimumElapsedDays: 5,
      recommendedElapsedDays: 7,
    });
    expect(
      new Set(
        TIKTOK_SOCIAL_WARMUP_BLUEPRINT.phases.flatMap((phase) =>
          phase.steps.flatMap((step) => step.days),
        ),
      ),
    ).toEqual(new Set([1, 2, 3, 4, 5, 6, 7]));
  });

  test('keeps native behavior user-confirmed and authorized data platform-verified', () => {
    const steps = TIKTOK_SOCIAL_WARMUP_BLUEPRINT.phases.flatMap(
      (phase) => phase.steps,
    );
    const byId = new Map(steps.map((step) => [step.id, step]));

    for (const id of [
      'use-native-app-manually',
      'watch-niche-content',
      'like-and-save-selectively',
      'follow-relevant-creators',
      'leave-contextual-comments',
      'check-fyp-relevance',
    ]) {
      expect(byId.get(id)).toMatchObject({
        completion: { type: 'attestation' },
        provenance: 'user_confirmed',
      });
    }

    for (const id of [
      'verify-profile-completeness',
      'snapshot-profile-statistics',
      'snapshot-public-videos',
      'snapshot-creator-capabilities',
      'observe-first-upload',
      'snapshot-owned-post-metrics',
    ]) {
      expect(byId.get(id)).toMatchObject({
        completion: { type: 'signal' },
        provenance: 'platform_verified',
        requirement: 'required_when_available',
      });
    }

    expect(byId.get('observe-genfeed-publish-activity')).toMatchObject({
      completion: { type: 'event' },
      provenance: 'genfeed_observed',
    });
  });

  test('rejects completion types that overstate their provenance', () => {
    const result = socialWarmupStepSchema.safeParse({
      completion: {
        description: 'Private watch history was supposedly fetched.',
        key: 'private-watch-history',
        type: 'signal',
      },
      description: 'An invalid platform-verified native behavior step.',
      days: [1],
      evidenceIds: ['tiktok-api-scopes'],
      id: 'invalid-watch-history',
      provenance: 'user_confirmed',
      requirement: 'required',
      title: 'Invalid watch history',
    });

    expect(result.success).toBe(false);
  });

  test('requires unique ordered phases and resolvable evidence references', () => {
    const invalidBlueprint = structuredClone(TIKTOK_SOCIAL_WARMUP_BLUEPRINT);
    const profilePhase = invalidBlueprint.phases.at(1);
    const profileStep = profilePhase?.steps.at(0);

    if (!profilePhase || !profileStep) {
      throw new Error('TikTok blueprint profile phase fixture is missing.');
    }

    profilePhase.startDay = 3;
    profileStep.evidenceIds = ['missing-evidence'];
    profileStep.days = [6];

    const result = socialWarmupBlueprintSchema.safeParse(invalidBlueprint);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          'Warm-up phases must be ordered and non-overlapping.',
          'Unknown evidence id: missing-evidence',
          'Step day 6 falls outside phase days 3–5.',
        ]),
      );
    }
  });

  test('resolves historical versions exactly while current selection can advance', () => {
    const revisionTwo = socialWarmupBlueprintSchema.parse({
      ...structuredClone(TIKTOK_SOCIAL_WARMUP_BLUEPRINT),
      lastReviewedOn: '2026-09-01',
      version: 2,
    });
    const catalog = [TIKTOK_SOCIAL_WARMUP_BLUEPRINT, revisionTwo];

    expect(
      findSocialWarmupBlueprint(catalog, {
        id: TIKTOK_SOCIAL_WARMUP_BLUEPRINT_ID,
        version: 1,
      }),
    ).toBe(TIKTOK_SOCIAL_WARMUP_BLUEPRINT);
    expect(
      resolveSocialWarmupBlueprint({
        id: TIKTOK_SOCIAL_WARMUP_BLUEPRINT_ID,
        version: 1,
      }),
    ).toBe(TIKTOK_SOCIAL_WARMUP_BLUEPRINT);
    expect(() =>
      resolveSocialWarmupBlueprint({
        id: TIKTOK_SOCIAL_WARMUP_BLUEPRINT_ID,
        version: 2,
      }),
    ).toThrow('Unknown social warm-up blueprint social-warmup.tiktok@2.');
    expect(
      selectCurrentSocialWarmupBlueprint(catalog, CredentialPlatform.TIKTOK)
        ?.version,
    ).toBe(2);
    expect(getCurrentSocialWarmupBlueprint(CredentialPlatform.TIKTOK)).toBe(
      TIKTOK_SOCIAL_WARMUP_BLUEPRINT,
    );
    expect(SOCIAL_WARMUP_BLUEPRINT_CATALOG).toHaveLength(3);
  });

  test('publishes the canonical X 5–7 day warm-up (#2219)', () => {
    expect(TWITTER_SOCIAL_WARMUP_BLUEPRINT).toMatchObject({
      id: TWITTER_SOCIAL_WARMUP_BLUEPRINT_ID,
      lastReviewedOn: '2026-08-12',
      platform: CredentialPlatform.TWITTER,
      version: TWITTER_SOCIAL_WARMUP_BLUEPRINT_VERSION,
    });

    expect(
      TWITTER_SOCIAL_WARMUP_BLUEPRINT.phases.map((phase) => ({
        endDay: phase.endDay,
        id: phase.id,
        startDay: phase.startDay,
      })),
    ).toEqual([
      {
        endDay: 2,
        id: 'profile-and-topic-consumption',
        startDay: 1,
      },
      {
        endDay: 4,
        id: 'reply-first-participation',
        startDay: 3,
      },
      {
        endDay: 7,
        id: 'first-originals-and-cadence',
        startDay: 5,
      },
    ]);

    expect(getCurrentSocialWarmupBlueprint(CredentialPlatform.TWITTER)).toBe(
      TWITTER_SOCIAL_WARMUP_BLUEPRINT,
    );
    expect(
      resolveSocialWarmupBlueprint({
        id: TWITTER_SOCIAL_WARMUP_BLUEPRINT_ID,
        version: TWITTER_SOCIAL_WARMUP_BLUEPRINT_VERSION,
      }),
    ).toBe(TWITTER_SOCIAL_WARMUP_BLUEPRINT);

    const provenances = new Set(
      TWITTER_SOCIAL_WARMUP_BLUEPRINT.phases.flatMap((phase) =>
        phase.steps.map((step) => step.provenance),
      ),
    );
    expect(provenances.has('user_confirmed')).toBe(true);
    expect(provenances.has('platform_verified')).toBe(true);
    expect(provenances.has('genfeed_observed')).toBe(true);
  });

  test('publishes the canonical Instagram 5–7 day warm-up (#2218)', () => {
    expect(INSTAGRAM_SOCIAL_WARMUP_BLUEPRINT).toMatchObject({
      id: INSTAGRAM_SOCIAL_WARMUP_BLUEPRINT_ID,
      platform: CredentialPlatform.INSTAGRAM,
      version: INSTAGRAM_SOCIAL_WARMUP_BLUEPRINT_VERSION,
    });
    expect(getCurrentSocialWarmupBlueprint(CredentialPlatform.INSTAGRAM)).toBe(
      INSTAGRAM_SOCIAL_WARMUP_BLUEPRINT,
    );
    expect(
      INSTAGRAM_SOCIAL_WARMUP_BLUEPRINT.phases.map((phase) => phase.id),
    ).toEqual([
      'profile-and-consumption',
      'thoughtful-engagement',
      'first-publish-and-cadence',
    ]);
  });

  test('keeps generic selection free of TikTok-specific branching', () => {
    expect(
      selectCurrentSocialWarmupBlueprint(
        SOCIAL_WARMUP_BLUEPRINT_CATALOG,
        CredentialPlatform.INSTAGRAM,
      ),
    ).toBe(INSTAGRAM_SOCIAL_WARMUP_BLUEPRINT);
  });
});

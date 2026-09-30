import { describe, expect, test } from 'vitest';
import { CredentialPlatform } from '../../src';
import { getCurrentSocialWarmupBlueprint } from '../../src/api-types/contracts/social-warmup-blueprint.contract';
import {
  evaluateSocialWarmupExpansionGate,
  getSocialWarmupEnrollmentRefusal,
  getSocialWarmupSupport,
  getSocialWarmupSupportClass,
  getSocialWarmupSupportCopy,
  isSocialWarmupEnrollmentAllowed,
  listSocialWarmupPlatformsBySupport,
  SOCIAL_WARMUP_AUTHORIZED_SIGNAL_ADAPTERS,
  SOCIAL_WARMUP_CAPABILITY_MATRIX,
  SOCIAL_WARMUP_CAPABILITY_REVIEWED_ON,
  SOCIAL_WARMUP_NAMED_CANDIDATE_PLATFORMS,
  SOCIAL_WARMUP_OUT_OF_CATALOG_PLATFORMS,
  socialWarmupCapabilitySchema,
} from '../../src/api-types/contracts/social-warmup-capability.contract';

describe('social warm-up capability matrix', () => {
  test('classifies every CredentialPlatform with a 2026-08-14 review date', () => {
    expect(Object.keys(SOCIAL_WARMUP_CAPABILITY_MATRIX).sort()).toEqual(
      Object.values(CredentialPlatform).sort(),
    );

    for (const platform of Object.values(CredentialPlatform)) {
      const entry = SOCIAL_WARMUP_CAPABILITY_MATRIX[platform];
      expect(socialWarmupCapabilitySchema.parse(entry).reviewedOn).toBe(
        SOCIAL_WARMUP_CAPABILITY_REVIEWED_ON,
      );
      expect(entry.platform).toBe(platform);
    }
  });

  test('keeps catalog platforms at full_blueprint and refuses implicit TikTok inheritance', () => {
    expect(listSocialWarmupPlatformsBySupport('full_blueprint').sort()).toEqual(
      [
        CredentialPlatform.INSTAGRAM,
        CredentialPlatform.LINKEDIN,
        CredentialPlatform.TIKTOK,
        CredentialPlatform.TWITTER,
        CredentialPlatform.YOUTUBE,
      ].sort(),
    );

    for (const platform of listSocialWarmupPlatformsBySupport(
      'full_blueprint',
    )) {
      expect(getCurrentSocialWarmupBlueprint(platform)?.platform).toBe(
        platform,
      );
      expect(isSocialWarmupEnrollmentAllowed(platform)).toBe(true);
      expect(getSocialWarmupEnrollmentRefusal(platform)).toBeUndefined();
    }

    expect(
      getCurrentSocialWarmupBlueprint(CredentialPlatform.FACEBOOK),
    ).toBeUndefined();
  });

  test('classifies the seven named remaining socials without inventing plans', () => {
    expect(SOCIAL_WARMUP_NAMED_CANDIDATE_PLATFORMS).toEqual([
      CredentialPlatform.FACEBOOK,
      CredentialPlatform.THREADS,
      CredentialPlatform.PINTEREST,
      CredentialPlatform.REDDIT,
      CredentialPlatform.SNAPCHAT,
      CredentialPlatform.MASTODON,
      CredentialPlatform.FANVUE,
    ]);

    expect(
      SOCIAL_WARMUP_NAMED_CANDIDATE_PLATFORMS.map((platform) => ({
        platform,
        support: SOCIAL_WARMUP_CAPABILITY_MATRIX[platform].support,
      })),
    ).toEqual([
      { platform: CredentialPlatform.FACEBOOK, support: 'readiness_only' },
      { platform: CredentialPlatform.THREADS, support: 'readiness_only' },
      { platform: CredentialPlatform.PINTEREST, support: 'readiness_only' },
      { platform: CredentialPlatform.REDDIT, support: 'readiness_only' },
      { platform: CredentialPlatform.SNAPCHAT, support: 'not_supported' },
      { platform: CredentialPlatform.MASTODON, support: 'readiness_only' },
      { platform: CredentialPlatform.FANVUE, support: 'readiness_only' },
    ]);
  });

  test('keeps WordPress, Shopify, and Google Ads outside social warm-up', () => {
    expect(SOCIAL_WARMUP_OUT_OF_CATALOG_PLATFORMS).toEqual([
      CredentialPlatform.WORDPRESS,
      CredentialPlatform.SHOPIFY,
      CredentialPlatform.GOOGLE_ADS,
    ]);

    for (const platform of SOCIAL_WARMUP_OUT_OF_CATALOG_PLATFORMS) {
      expect(SOCIAL_WARMUP_CAPABILITY_MATRIX[platform].support).toBe(
        'not_supported',
      );
      expect(isSocialWarmupEnrollmentAllowed(platform)).toBe(false);
    }
  });

  test('reports the canonical X Ads OAuth scopes', () => {
    expect(
      SOCIAL_WARMUP_CAPABILITY_MATRIX[CredentialPlatform.X_ADS]
        .connectionScopes,
    ).toEqual(['ads.read', 'ads.write', 'offline.access']);
  });

  test('reports the canonical Fanvue OAuth scopes', () => {
    expect(
      SOCIAL_WARMUP_CAPABILITY_MATRIX[CredentialPlatform.FANVUE]
        .connectionScopes,
    ).toEqual([
      'openid',
      'offline_access',
      'offline',
      'read:self',
      'read:media',
      'write:media',
      'write:post',
    ]);
  });

  test('classifies LinkedIn as full_blueprint with a catalog blueprint', () => {
    expect(getSocialWarmupSupportClass(CredentialPlatform.YOUTUBE)).toBe(
      'full_blueprint',
    );
    expect(getSocialWarmupSupportClass(CredentialPlatform.LINKEDIN)).toBe(
      'full_blueprint',
    );
    expect(
      getCurrentSocialWarmupBlueprint(CredentialPlatform.YOUTUBE)?.platform,
    ).toBe(CredentialPlatform.YOUTUBE);
    expect(
      getCurrentSocialWarmupBlueprint(CredentialPlatform.LINKEDIN)?.platform,
    ).toBe(CredentialPlatform.LINKEDIN);
  });

  test('exports UI copy for readiness-only and unsupported states', () => {
    const facebook = getSocialWarmupSupportCopy(CredentialPlatform.FACEBOOK);
    expect(facebook).toEqual({
      body: SOCIAL_WARMUP_CAPABILITY_MATRIX[CredentialPlatform.FACEBOOK].ui
        .body,
      headline: 'Facebook is connection-only',
      support: 'readiness_only',
    });

    const wordpress = getSocialWarmupSupportCopy(CredentialPlatform.WORDPRESS);
    expect(wordpress.support).toBe('not_supported');
    expect(wordpress.headline).toBe('Warm-up does not apply');

    const snapchat = getSocialWarmupSupportCopy(CredentialPlatform.SNAPCHAT);
    expect(snapchat.support).toBe('not_supported');
    expect(snapchat.body).toMatch(/ads account/i);

    const unknown = getSocialWarmupSupportCopy('not-a-platform');
    expect(unknown).toEqual({
      body: 'This connection is not supported for social-account warm-up.',
      headline: 'Warm-up is not available',
      support: 'not_supported',
    });
  });

  test('builds enroll refusals that do not mention TikTok', () => {
    const facebook = getSocialWarmupEnrollmentRefusal(
      CredentialPlatform.FACEBOOK,
    );
    expect(facebook).toMatchObject({
      platform: CredentialPlatform.FACEBOOK,
      support: 'readiness_only',
    });
    expect(facebook?.message).toMatch(/readiness-only/i);
    expect(facebook?.message.toLowerCase()).not.toContain('tiktok');

    const wordpress = getSocialWarmupEnrollmentRefusal(
      CredentialPlatform.WORDPRESS,
    );
    expect(wordpress).toMatchObject({
      platform: CredentialPlatform.WORDPRESS,
      support: 'not_supported',
    });
    expect(wordpress?.message).toMatch(/not supported/i);

    expect(
      getSocialWarmupEnrollmentRefusal(CredentialPlatform.TIKTOK),
    ).toBeUndefined();
    expect(getSocialWarmupEnrollmentRefusal('FACEBOOK')?.platform).toBe(
      CredentialPlatform.FACEBOOK,
    );
    expect(getSocialWarmupSupport('x')?.platform).toBe(
      CredentialPlatform.TWITTER,
    );
    expect(getSocialWarmupEnrollmentRefusal('mystery-network')).toMatchObject({
      platform: 'unknown',
      support: 'not_supported',
    });
  });

  test('defines the expansion gate as a reviewed blueprint plus signal matrix', () => {
    const enabled = [
      CredentialPlatform.INSTAGRAM,
      CredentialPlatform.LINKEDIN,
      CredentialPlatform.TIKTOK,
      CredentialPlatform.TWITTER,
      CredentialPlatform.YOUTUBE,
    ];

    expect([...SOCIAL_WARMUP_AUTHORIZED_SIGNAL_ADAPTERS].sort()).toEqual(
      enabled.sort(),
    );
    expect(listSocialWarmupPlatformsBySupport('full_blueprint').sort()).toEqual(
      enabled.sort(),
    );

    for (const platform of enabled) {
      const gate = evaluateSocialWarmupExpansionGate(platform);
      expect(gate.isEnabled).toBe(true);
      expect(gate.missing).toEqual([]);
      expect(gate.support).toBe('full_blueprint');
      expect(gate.signalBoundary.nativeOnly.length).toBeGreaterThan(0);
      expect(gate.signalBoundary.policyConstraints.toLowerCase()).toMatch(
        /no automated engagement/,
      );
    }

    const tiktok = evaluateSocialWarmupExpansionGate(CredentialPlatform.TIKTOK);
    expect(tiktok.signalBoundary.authorized.toLowerCase()).toMatch(
      /for you|watch history|saves|comments made/,
    );
    expect(tiktok.signalBoundary.authorized.toLowerCase()).toMatch(
      /not api-visible/,
    );

    const facebook = evaluateSocialWarmupExpansionGate(
      CredentialPlatform.FACEBOOK,
    );
    expect(facebook.isEnabled).toBe(false);
    expect(facebook.missing).toEqual(
      expect.arrayContaining([
        'reviewed_catalog_blueprint',
        'capability_full_blueprint',
        'authorized_signal_adapter',
      ]),
    );
    expect(
      getCurrentSocialWarmupBlueprint(CredentialPlatform.FACEBOOK),
    ).toBeUndefined();
  });

  test('keeps native-only actions user-confirmed and forbids automated engagement', () => {
    for (const platform of [
      CredentialPlatform.TIKTOK,
      CredentialPlatform.TWITTER,
      CredentialPlatform.INSTAGRAM,
      ...SOCIAL_WARMUP_NAMED_CANDIDATE_PLATFORMS,
      CredentialPlatform.YOUTUBE,
      CredentialPlatform.LINKEDIN,
    ]) {
      const entry = SOCIAL_WARMUP_CAPABILITY_MATRIX[platform];
      expect(entry.policyConstraints.toLowerCase()).toMatch(
        /no automated engagement/,
      );
      expect(entry.policyConstraints.toLowerCase()).not.toMatch(
        /automat(e|ed) (likes|comments|follows)/,
      );
    }

    expect(
      SOCIAL_WARMUP_CAPABILITY_MATRIX[CredentialPlatform.FACEBOOK]
        .policyConstraints,
    ).toMatch(/postComment/);
    expect(
      SOCIAL_WARMUP_CAPABILITY_MATRIX[CredentialPlatform.REDDIT]
        .policyConstraints,
    ).toMatch(/postComment/);
  });
});

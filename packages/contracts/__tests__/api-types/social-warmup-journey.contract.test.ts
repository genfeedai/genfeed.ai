import { describe, expect, test } from 'vitest';
import { CredentialPlatform, SocialWarmupSignalStatus } from '../../src';
import { TIKTOK_SOCIAL_WARMUP_BLUEPRINT } from '../../src/api-types/contracts/social-warmup-blueprint.contract';
import {
  buildSocialWarmupRequiredCheckHoldReason,
  evaluateSocialWarmupJourney,
  getSocialWarmupElapsedDays,
  listBlockingSocialWarmupChecks,
  listSocialWarmupJourneyChecks,
  SOCIAL_WARMUP_TELEMETRY_EVENT,
  sanitizeSocialWarmupTelemetry,
} from '../../src/api-types/contracts/social-warmup-journey.contract';

const NOW = new Date('2026-08-14T12:00:00.000Z');

function enrollment(
  overrides: Partial<
    Parameters<typeof evaluateSocialWarmupJourney>[0]['enrollment']
  > = {},
) {
  return {
    completedItemIds: [],
    hasPartialScopes: false,
    isCredentialConnected: true,
    signals: [],
    startedAt: '2026-08-08T10:00:00.000Z',
    state: 'IN_PROGRESS',
    ...overrides,
  };
}

describe('social warm-up journey contract', () => {
  test('lists TikTok steps plus graduation rules', () => {
    const checks = listSocialWarmupJourneyChecks(
      TIKTOK_SOCIAL_WARMUP_BLUEPRINT,
    );
    expect(checks.some((check) => check.id === 'use-native-app-manually')).toBe(
      true,
    );
    expect(
      checks.some((check) => check.id === 'manual-foundation-complete'),
    ).toBe(true);
    expect(checks.some((check) => check.kind === 'graduation')).toBe(true);
  });

  test('holds publishing while required native-app checks are incomplete', () => {
    const blocking = listBlockingSocialWarmupChecks(
      TIKTOK_SOCIAL_WARMUP_BLUEPRINT,
      enrollment(),
    );
    expect(
      blocking.some((check) => check.id === 'use-native-app-manually'),
    ).toBe(true);

    const evaluation = evaluateSocialWarmupJourney({
      blueprint: TIKTOK_SOCIAL_WARMUP_BLUEPRINT,
      enrollment: enrollment(),
      now: NOW,
      platform: CredentialPlatform.TIKTOK,
    });
    expect(evaluation.isGraduated).toBe(false);
    expect(evaluation.holdReason).toMatch(
      /required warm-up checks are incomplete/i,
    );
    expect(evaluation.holdReason).toMatch(
      /does not guarantee reach or safety/i,
    );
    expect(evaluation.holdReason).toMatch(/Use TikTok manually/i);
  });

  test('does not block required_when_available checks that are permission-limited', () => {
    const blocking = listBlockingSocialWarmupChecks(
      TIKTOK_SOCIAL_WARMUP_BLUEPRINT,
      enrollment({
        hasPartialScopes: true,
        reconnect: { reason: 'partial_scopes' },
        signals: [
          {
            key: 'profile-completeness-signal',
            status: SocialWarmupSignalStatus.PERMISSION_LIMITED,
          },
        ],
      }),
    );

    expect(
      blocking.some((check) => check.id === 'verify-profile-completeness'),
    ).toBe(false);
    expect(
      blocking.some((check) => check.provenance === 'user_confirmed'),
    ).toBe(true);
  });

  test('graduates only after required checks, minimum elapsed days, and a live connection', () => {
    const checks = listSocialWarmupJourneyChecks(
      TIKTOK_SOCIAL_WARMUP_BLUEPRINT,
    );
    const complete = enrollment({
      completedItemIds: checks.map((check) => check.id),
      startedAt: '2026-08-08T10:00:00.000Z',
    });

    const ready = evaluateSocialWarmupJourney({
      blueprint: TIKTOK_SOCIAL_WARMUP_BLUEPRINT,
      enrollment: complete,
      now: NOW,
      platform: CredentialPlatform.TIKTOK,
    });
    expect(ready.elapsedDays).toBeGreaterThanOrEqual(5);
    expect(ready.blockingChecks).toEqual([]);
    expect(ready.isReadyToGraduate).toBe(true);
    expect(ready.isGraduated).toBe(true);
    expect(ready.holdReason).toBeUndefined();

    const tooSoon = evaluateSocialWarmupJourney({
      blueprint: TIKTOK_SOCIAL_WARMUP_BLUEPRINT,
      enrollment: {
        ...complete,
        startedAt: '2026-08-13T10:00:00.000Z',
      },
      now: NOW,
    });
    expect(tooSoon.isReadyToGraduate).toBe(false);

    const disconnected = evaluateSocialWarmupJourney({
      blueprint: TIKTOK_SOCIAL_WARMUP_BLUEPRINT,
      enrollment: {
        ...complete,
        isCredentialConnected: false,
        state: 'DISCONNECTED',
      },
      now: NOW,
    });
    expect(disconnected.isGraduated).toBe(false);
  });

  test('counts elapsed days from the enrollment start without using credential createdAt', () => {
    expect(getSocialWarmupElapsedDays('2026-08-08T10:00:00.000Z', NOW)).toBe(7);
    expect(getSocialWarmupElapsedDays('not-a-date', NOW)).toBe(1);
  });

  test('builds an actionable hold reason that is not a reach guarantee', () => {
    const reason = buildSocialWarmupRequiredCheckHoldReason('tiktok', [
      { title: 'Use TikTok manually' },
      { title: 'Watch niche content' },
      { title: 'Like and save selectively' },
      { title: 'Follow relevant creators' },
    ]);
    expect(reason).toMatch(
      /Use TikTok manually; Watch niche content; Like and save selectively/,
    );
    expect(reason).toMatch(/and 1 more required check/);
    expect(reason.toLowerCase()).not.toMatch(
      /guarantees (reach|distribution|safety)/,
    );
  });

  test('strips tokens and secrets from telemetry payloads', () => {
    expect(SOCIAL_WARMUP_TELEMETRY_EVENT.enrolled).toBe(
      'social_warmup.enrolled',
    );
    expect(
      sanitizeSocialWarmupTelemetry({
        accessToken: 'secret-token',
        enrollmentId: 'enrollment-1',
        nested: { refreshToken: 'abc', status: 'AVAILABLE' },
        organizationId: 'org-1',
      }),
    ).toEqual({
      enrollmentId: 'enrollment-1',
      nested: { status: 'AVAILABLE' },
      organizationId: 'org-1',
    });
  });
});

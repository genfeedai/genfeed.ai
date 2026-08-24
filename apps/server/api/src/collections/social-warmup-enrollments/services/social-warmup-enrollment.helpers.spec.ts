import {
  authorizedEvidenceFromWarmupSignals,
  completedItemIdsFromEvents,
  hasPartialSocialWarmupScopes,
  mapTikTokSource,
  mapTikTokStatus,
  resolveSocialWarmupAccountAge,
  safeSignalEvidence,
  socialWarmupEnrollmentStateFromStorage,
  socialWarmupEventRecordFromStorage,
  socialWarmupSignalRecordFromStorage,
} from '@api/collections/social-warmup-enrollments/services/social-warmup-enrollment.helpers';
import {
  SocialWarmupEnrollmentState,
  SocialWarmupEventAction,
  SocialWarmupSignalSource,
  SocialWarmupSignalStatus,
} from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

describe('social-warmup-enrollment helpers', () => {
  it('normalizes Prisma storage strings at the public enum boundary', () => {
    expect(socialWarmupEnrollmentStateFromStorage('IN_PROGRESS')).toBe(
      SocialWarmupEnrollmentState.IN_PROGRESS,
    );
    expect(
      socialWarmupEventRecordFromStorage({
        action: 'COMPLETED',
        itemId: 'native-profile-complete',
        occurredAt: new Date('2026-08-14T00:00:00.000Z'),
      }).action,
    ).toBe(SocialWarmupEventAction.COMPLETED);
    expect(
      socialWarmupSignalRecordFromStorage({
        key: 'native-account-age',
        source: 'GENFEED',
        status: 'AVAILABLE',
      }),
    ).toMatchObject({
      source: SocialWarmupSignalSource.GENFEED,
      status: SocialWarmupSignalStatus.AVAILABLE,
    });
    expect(() => socialWarmupEnrollmentStateFromStorage('UNKNOWN')).toThrow(
      'Unsupported social warm-up enrollment state',
    );
  });

  it('keeps the latest complete/reopen outcome per checklist item', () => {
    expect(
      completedItemIdsFromEvents([
        {
          action: SocialWarmupEventAction.COMPLETED,
          itemId: 'watch-niche-content',
          occurredAt: new Date('2026-08-11T01:00:00.000Z'),
        },
        {
          action: SocialWarmupEventAction.REOPENED,
          itemId: 'watch-niche-content',
          occurredAt: new Date('2026-08-11T02:00:00.000Z'),
        },
        {
          action: SocialWarmupEventAction.COMPLETED,
          itemId: 'post-native-comment',
          occurredAt: new Date('2026-08-11T03:00:00.000Z'),
        },
      ]),
    ).toEqual(['post-native-comment']);
  });

  it('prefers native account age then first-upload createTime and never invents days', () => {
    const now = new Date('2026-08-14T00:00:00.000Z');
    const native = resolveSocialWarmupAccountAge(
      [
        {
          evidence: { createTime: 1_752_000_000 },
          key: 'native-account-age',
          source: SocialWarmupSignalSource.PLATFORM,
          status: SocialWarmupSignalStatus.AVAILABLE,
        },
        {
          evidence: { video: { createTime: 1_754_000_000 } },
          key: 'first-upload-platform-signal',
          source: SocialWarmupSignalSource.PLATFORM,
          status: SocialWarmupSignalStatus.AVAILABLE,
        },
      ],
      now,
    );
    expect(native.accountAgeSource).toBe('native-account-age');
    expect(native.accountAgeStatus).toBe(SocialWarmupSignalStatus.AVAILABLE);
    expect(native.accountAgeDays).toBeGreaterThan(0);

    const firstUpload = resolveSocialWarmupAccountAge(
      [
        {
          evidence: { video: { createTime: 1_754_000_000 } },
          key: 'first-upload-platform-signal',
          source: SocialWarmupSignalSource.PLATFORM,
          status: SocialWarmupSignalStatus.AVAILABLE,
        },
      ],
      now,
    );
    expect(firstUpload.accountAgeSource).toBe('first-upload-platform-signal');

    const firstPublish = resolveSocialWarmupAccountAge(
      [
        {
          evidence: { media: { createTime: 1_754_000_000 } },
          key: 'first-publish-platform-signal',
          source: SocialWarmupSignalSource.PLATFORM,
          status: SocialWarmupSignalStatus.AVAILABLE,
        },
      ],
      now,
    );
    expect(firstPublish.accountAgeSource).toBe('first-publish-platform-signal');

    expect(resolveSocialWarmupAccountAge([])).toEqual({
      accountAgeDays: null,
      accountAgeStatus: SocialWarmupSignalStatus.MISSING,
    });
  });

  it('distinguishes stale, failed, and missing account-age evidence', () => {
    expect(
      resolveSocialWarmupAccountAge([
        {
          evidence: { video: { createTime: 1_754_000_000 } },
          key: 'first-upload-platform-signal',
          source: SocialWarmupSignalSource.PLATFORM,
          status: SocialWarmupSignalStatus.STALE,
        },
      ]).accountAgeStatus,
    ).toBe(SocialWarmupSignalStatus.STALE);

    expect(
      resolveSocialWarmupAccountAge([
        {
          evidence: {},
          key: 'first-upload-platform-signal',
          source: SocialWarmupSignalSource.PLATFORM,
          status: SocialWarmupSignalStatus.FAILED,
        },
      ]).accountAgeStatus,
    ).toBe(SocialWarmupSignalStatus.FAILED);

    expect(resolveSocialWarmupAccountAge([]).accountAgeStatus).toBe(
      SocialWarmupSignalStatus.MISSING,
    );
  });

  it('detects partial TikTok scopes without treating a full snapshot as limited', () => {
    expect(
      hasPartialSocialWarmupScopes({
        tiktokAuthorized: {
          evidence: [{ status: 'permission_limited' }],
          grantedScopes: ['user.info.basic'],
          state: 'partial',
        },
      }),
    ).toBe(true);

    expect(
      hasPartialSocialWarmupScopes({
        tiktokAuthorized: {
          evidence: [{ status: 'available' }],
          grantedScopes: ['user.info.basic', 'user.info.profile', 'video.list'],
          state: 'full',
        },
      }),
    ).toBe(false);

    expect(
      hasPartialSocialWarmupScopes({
        instagramAuthorized: {
          evidence: [{ status: 'permission_limited' }],
          grantedScopes: [],
          state: 'partial',
        },
      }),
    ).toBe(true);
  });

  it('detects partial X scopes without treating a full snapshot as limited', () => {
    expect(
      hasPartialSocialWarmupScopes({
        twitterAuthorized: {
          evidence: [{ status: 'permission_limited' }],
          grantedScopes: ['users.read'],
          state: 'partial',
        },
      }),
    ).toBe(true);

    expect(
      hasPartialSocialWarmupScopes({
        twitterAuthorized: {
          evidence: [{ status: 'available' }],
          grantedScopes: ['users.read', 'tweet.read'],
          state: 'full',
        },
      }),
    ).toBe(false);
  });

  it('reads authorized evidence from TikTok, X, YouTube, or LinkedIn warmup snapshots', () => {
    expect(
      authorizedEvidenceFromWarmupSignals({
        twitterAuthorized: {
          evidence: [
            { key: 'native-account-age', provenance: 'platform_verified' },
          ],
        },
      }),
    ).toEqual([{ key: 'native-account-age', provenance: 'platform_verified' }]);

    expect(
      authorizedEvidenceFromWarmupSignals({
        youtubeAuthorized: {
          evidence: [
            {
              key: 'channel-fields-platform-signal',
              provenance: 'platform_verified',
            },
          ],
        },
      }),
    ).toEqual([
      {
        key: 'channel-fields-platform-signal',
        provenance: 'platform_verified',
      },
    ]);

    expect(
      authorizedEvidenceFromWarmupSignals({
        linkedinAuthorized: {
          evidence: [
            {
              key: 'member-profile-fields-platform-signal',
              provenance: 'platform_verified',
            },
          ],
        },
      }),
    ).toEqual([
      {
        key: 'member-profile-fields-platform-signal',
        provenance: 'platform_verified',
      },
    ]);
  });

  it('detects partial YouTube scopes without treating a full snapshot as limited', () => {
    expect(
      hasPartialSocialWarmupScopes({
        youtubeAuthorized: {
          evidence: [{ status: 'permission_limited' }],
          grantedScopes: ['https://www.googleapis.com/auth/youtube'],
          state: 'partial',
        },
      }),
    ).toBe(true);

    expect(
      hasPartialSocialWarmupScopes({
        youtubeAuthorized: {
          evidence: [{ status: 'available' }],
          grantedScopes: [
            'https://www.googleapis.com/auth/youtube',
            'https://www.googleapis.com/auth/youtube.upload',
          ],
          state: 'full',
        },
      }),
    ).toBe(false);
  });

  it('detects partial LinkedIn scopes without treating a full member snapshot as limited', () => {
    expect(
      hasPartialSocialWarmupScopes({
        linkedinAuthorized: {
          evidence: [{ status: 'permission_limited' }],
          grantedScopes: ['openid', 'profile'],
          state: 'partial',
        },
      }),
    ).toBe(true);

    expect(
      hasPartialSocialWarmupScopes({
        linkedinAuthorized: {
          evidence: [{ status: 'available' }],
          grantedScopes: ['openid', 'profile', 'w_member_social'],
          state: 'full',
        },
      }),
    ).toBe(false);
  });

  it('maps TikTok snapshot labels and strips secret evidence keys', () => {
    expect(mapTikTokStatus('stale')).toBe(SocialWarmupSignalStatus.STALE);
    expect(mapTikTokSource('genfeed_observed')).toBe(
      SocialWarmupSignalSource.GENFEED,
    );
    expect(
      safeSignalEvidence({
        accessToken: 'secret',
        createTime: 1_754_000_000,
        refreshToken: 'also-secret',
      }),
    ).toEqual({ createTime: 1_754_000_000 });
  });
});

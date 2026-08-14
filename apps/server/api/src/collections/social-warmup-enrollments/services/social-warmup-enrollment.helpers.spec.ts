import {
  completedItemIdsFromEvents,
  hasPartialSocialWarmupScopes,
  mapTikTokSource,
  mapTikTokStatus,
  resolveSocialWarmupAccountAge,
  safeSignalEvidence,
} from '@api/collections/social-warmup-enrollments/services/social-warmup-enrollment.helpers';
import {
  SocialWarmupEventAction,
  SocialWarmupSignalSource,
  SocialWarmupSignalStatus,
} from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

describe('social-warmup-enrollment helpers', () => {
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

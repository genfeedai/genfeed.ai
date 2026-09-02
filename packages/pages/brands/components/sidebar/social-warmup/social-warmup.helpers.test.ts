import {
  CredentialPlatform,
  SocialWarmupEnrollmentState,
  SocialWarmupSignalSource,
  SocialWarmupSignalStatus,
} from '@genfeedai/contracts';
import {
  TIKTOK_SOCIAL_WARMUP_BLUEPRINT,
  TIKTOK_SOCIAL_WARMUP_BLUEPRINT_ID,
} from '@genfeedai/contracts/api-types/contracts/social-warmup-blueprint.contract';
import type { ISocialWarmupEnrollment } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import {
  buildSocialWarmupProgramModel,
  canRefreshAuthorizedSignals,
  collectSocialWarmupChecks,
  formatWarmupProvenanceLabel,
  getSocialWarmupCurrentDay,
  isSocialWarmupCheckComplete,
  listTodaySocialWarmupChecks,
  resolveSocialWarmupCheckState,
} from './social-warmup.helpers';

const NOW = new Date('2026-08-14T12:00:00.000Z');

function createEnrollment(
  overrides: Partial<ISocialWarmupEnrollment> = {},
): ISocialWarmupEnrollment {
  return {
    blueprintId: TIKTOK_SOCIAL_WARMUP_BLUEPRINT_ID,
    blueprintVersion: 1,
    brandId: 'brand-1',
    completedItemIds: [],
    createdAt: '2026-08-08T10:00:00.000Z',
    credentialId: 'credential-1',
    currentPhaseId: 'native-consumption-and-engagement',
    enrolledByUserId: 'user-1',
    events: [],
    hasPartialScopes: false,
    id: 'enrollment-1',
    isCredentialConnected: true,
    isDeleted: false,
    organizationId: 'org-1',
    signals: [],
    startedAt: '2026-08-08T10:00:00.000Z',
    state: SocialWarmupEnrollmentState.IN_PROGRESS,
    updatedAt: '2026-08-08T10:00:00.000Z',
    ...overrides,
  };
}

describe('formatWarmupProvenanceLabel', () => {
  it('uses the platform formatter for verified checks', () => {
    expect(
      formatWarmupProvenanceLabel(
        'platform_verified',
        CredentialPlatform.TIKTOK,
      ),
    ).toBe('Verified from TikTok');
    expect(
      formatWarmupProvenanceLabel(
        'platform_verified',
        CredentialPlatform.TWITTER,
      ),
    ).toBe('Verified from X');
    expect(
      formatWarmupProvenanceLabel(
        'platform_verified',
        CredentialPlatform.INSTAGRAM,
      ),
    ).toBe('Verified from Instagram');
  });

  it('keeps Genfeed and user provenance distinct', () => {
    expect(
      formatWarmupProvenanceLabel(
        'genfeed_observed',
        CredentialPlatform.TIKTOK,
      ),
    ).toBe('Observed in Genfeed');
    expect(
      formatWarmupProvenanceLabel('user_confirmed', CredentialPlatform.TIKTOK),
    ).toBe('You confirmed');
  });
});

describe('getSocialWarmupCurrentDay', () => {
  it('counts the start date as day 1 and clamps to the last plan day', () => {
    expect(
      getSocialWarmupCurrentDay(
        TIKTOK_SOCIAL_WARMUP_BLUEPRINT,
        '2026-08-14T09:00:00.000Z',
        NOW,
      ),
    ).toBe(1);
    expect(
      getSocialWarmupCurrentDay(
        TIKTOK_SOCIAL_WARMUP_BLUEPRINT,
        '2026-08-08T10:00:00.000Z',
        NOW,
      ),
    ).toBe(7);
    expect(
      getSocialWarmupCurrentDay(
        TIKTOK_SOCIAL_WARMUP_BLUEPRINT,
        '2026-07-01T10:00:00.000Z',
        NOW,
      ),
    ).toBe(7);
  });
});

describe('collectSocialWarmupChecks', () => {
  it('flattens TikTok days 1–7 plus graduation rules', () => {
    const checks = collectSocialWarmupChecks(TIKTOK_SOCIAL_WARMUP_BLUEPRINT);
    const dayNumbers = new Set(
      checks.flatMap((check) => (check.kind === 'step' ? check.days : [])),
    );

    expect(dayNumbers).toEqual(new Set([1, 2, 3, 4, 5, 6, 7]));
    expect(checks.some((check) => check.id === 'use-native-app-manually')).toBe(
      true,
    );
    expect(
      checks.some((check) => check.id === 'manual-foundation-complete'),
    ).toBe(true);
  });
});

describe('listTodaySocialWarmupChecks', () => {
  it('returns only checks assigned to the current day', () => {
    const today = listTodaySocialWarmupChecks(
      TIKTOK_SOCIAL_WARMUP_BLUEPRINT,
      1,
    );

    expect(today.every((check) => check.days.includes(1))).toBe(true);
    expect(today.some((check) => check.id === 'use-native-app-manually')).toBe(
      true,
    );
    expect(today.some((check) => check.id === 'observe-first-upload')).toBe(
      false,
    );
  });
});

describe('isSocialWarmupCheckComplete', () => {
  const nativeApp = collectSocialWarmupChecks(
    TIKTOK_SOCIAL_WARMUP_BLUEPRINT,
  ).find((check) => check.id === 'use-native-app-manually');
  const firstUpload = collectSocialWarmupChecks(
    TIKTOK_SOCIAL_WARMUP_BLUEPRINT,
  ).find((check) => check.id === 'observe-first-upload');
  const publicVideos = collectSocialWarmupChecks(
    TIKTOK_SOCIAL_WARMUP_BLUEPRINT,
  ).find((check) => check.id === 'snapshot-public-videos');

  if (!nativeApp || !firstUpload || !publicVideos) {
    throw new Error('TikTok fixture checks are missing.');
  }

  it('completes user-confirmed items only from completed item ids', () => {
    expect(isSocialWarmupCheckComplete(nativeApp, createEnrollment())).toBe(
      false,
    );
    expect(
      isSocialWarmupCheckComplete(
        nativeApp,
        createEnrollment({ completedItemIds: ['use-native-app-manually'] }),
      ),
    ).toBe(true);
  });

  it('completes platform checks from available signals and empty snapshots', () => {
    expect(
      isSocialWarmupCheckComplete(
        firstUpload,
        createEnrollment({
          signals: [
            {
              brandId: 'brand-1',
              createdAt: '2026-08-14T11:00:00.000Z',
              enrollmentId: 'enrollment-1',
              evidence: {},
              id: 'signal-1',
              isDeleted: false,
              key: 'first-upload-platform-signal',
              observedAt: '2026-08-14T11:00:00.000Z',
              organizationId: 'org-1',
              source: SocialWarmupSignalSource.PLATFORM,
              status: SocialWarmupSignalStatus.AVAILABLE,
              updatedAt: '2026-08-14T11:00:00.000Z',
            },
          ],
        }),
      ),
    ).toBe(true);
    expect(
      isSocialWarmupCheckComplete(
        firstUpload,
        createEnrollment({
          signals: [
            {
              brandId: 'brand-1',
              createdAt: '2026-08-14T11:00:00.000Z',
              enrollmentId: 'enrollment-1',
              evidence: {},
              id: 'signal-empty',
              isDeleted: false,
              key: 'first-upload-platform-signal',
              observedAt: '2026-08-14T11:00:00.000Z',
              organizationId: 'org-1',
              source: SocialWarmupSignalSource.PLATFORM,
              status: SocialWarmupSignalStatus.EMPTY,
              updatedAt: '2026-08-14T11:00:00.000Z',
            },
          ],
        }),
      ),
    ).toBe(false);
    expect(
      isSocialWarmupCheckComplete(
        publicVideos,
        createEnrollment({
          signals: [
            {
              brandId: 'brand-1',
              createdAt: '2026-08-14T11:00:00.000Z',
              enrollmentId: 'enrollment-1',
              evidence: {},
              id: 'signal-videos',
              isDeleted: false,
              key: 'public-videos-snapshot',
              observedAt: '2026-08-14T11:00:00.000Z',
              organizationId: 'org-1',
              source: SocialWarmupSignalSource.PLATFORM,
              status: SocialWarmupSignalStatus.EMPTY,
              updatedAt: '2026-08-14T11:00:00.000Z',
            },
          ],
        }),
      ),
    ).toBe(true);
  });
});

describe('resolveSocialWarmupCheckState', () => {
  const firstUpload = collectSocialWarmupChecks(
    TIKTOK_SOCIAL_WARMUP_BLUEPRINT,
  ).find((check) => check.id === 'observe-first-upload');

  if (!firstUpload) {
    throw new Error('TikTok first-upload fixture is missing.');
  }

  it('maps refresh, stale, permission, reconnect, empty, and failure states', () => {
    expect(
      resolveSocialWarmupCheckState({
        check: firstUpload,
        enrollment: createEnrollment(),
        isRefreshingSignals: true,
      }),
    ).toBe('loading');
    expect(
      resolveSocialWarmupCheckState({
        check: firstUpload,
        enrollment: createEnrollment({ isCredentialConnected: false }),
      }),
    ).toBe('reconnect');
    expect(
      resolveSocialWarmupCheckState({
        check: firstUpload,
        enrollment: createEnrollment({
          signals: [
            {
              brandId: 'brand-1',
              createdAt: '2026-08-14T11:00:00.000Z',
              enrollmentId: 'enrollment-1',
              evidence: {},
              id: 'signal-stale',
              isDeleted: false,
              key: 'first-upload-platform-signal',
              observedAt: '2026-08-10T11:00:00.000Z',
              organizationId: 'org-1',
              source: SocialWarmupSignalSource.PLATFORM,
              status: SocialWarmupSignalStatus.STALE,
              updatedAt: '2026-08-10T11:00:00.000Z',
            },
          ],
        }),
      }),
    ).toBe('stale');
    expect(
      resolveSocialWarmupCheckState({
        check: firstUpload,
        enrollment: createEnrollment({ hasPartialScopes: true }),
      }),
    ).toBe('permission_limited');
    expect(
      resolveSocialWarmupCheckState({
        check: firstUpload,
        enrollment: createEnrollment({
          signals: [
            {
              brandId: 'brand-1',
              createdAt: '2026-08-14T11:00:00.000Z',
              enrollmentId: 'enrollment-1',
              evidence: {},
              id: 'signal-empty',
              isDeleted: false,
              key: 'first-upload-platform-signal',
              observedAt: '2026-08-14T11:00:00.000Z',
              organizationId: 'org-1',
              source: SocialWarmupSignalSource.PLATFORM,
              status: SocialWarmupSignalStatus.EMPTY,
              updatedAt: '2026-08-14T11:00:00.000Z',
            },
          ],
        }),
      }),
    ).toBe('empty');
    expect(
      resolveSocialWarmupCheckState({
        check: firstUpload,
        enrollment: createEnrollment({
          signals: [
            {
              brandId: 'brand-1',
              createdAt: '2026-08-14T11:00:00.000Z',
              enrollmentId: 'enrollment-1',
              evidence: {},
              id: 'signal-failed',
              isDeleted: false,
              key: 'first-upload-platform-signal',
              observedAt: '2026-08-14T11:00:00.000Z',
              organizationId: 'org-1',
              source: SocialWarmupSignalSource.PLATFORM,
              status: SocialWarmupSignalStatus.FAILED,
              updatedAt: '2026-08-14T11:00:00.000Z',
            },
          ],
        }),
      }),
    ).toBe('failed');
  });
});

describe('buildSocialWarmupProgramModel', () => {
  it('computes progress, next action, last refresh, and unresolved required checks', () => {
    const enrollment = createEnrollment({
      completedItemIds: [
        'use-native-app-manually',
        'watch-niche-content',
        'like-and-save-selectively',
        'follow-relevant-creators',
        'leave-contextual-comments',
        'check-fyp-relevance',
      ],
      currentPhaseId: 'gradual-first-uploads',
      signals: [
        {
          brandId: 'brand-1',
          createdAt: '2026-08-14T11:30:00.000Z',
          enrollmentId: 'enrollment-1',
          evidence: {},
          id: 'signal-refresh',
          isDeleted: false,
          key: 'profile-completeness-signal',
          observedAt: '2026-08-14T11:30:00.000Z',
          organizationId: 'org-1',
          source: SocialWarmupSignalSource.PLATFORM,
          status: SocialWarmupSignalStatus.STALE,
          updatedAt: '2026-08-14T11:30:00.000Z',
        },
      ],
    });

    const model = buildSocialWarmupProgramModel({
      blueprint: TIKTOK_SOCIAL_WARMUP_BLUEPRINT,
      enrollment,
      now: NOW,
      platform: CredentialPlatform.TIKTOK,
    });

    expect(model.currentDay).toBe(7);
    expect(model.currentPhaseTitle).toBe('Gradual first uploads');
    expect(model.progress.completed).toBe(6);
    expect(model.progress.total).toBeGreaterThan(6);
    expect(model.progress.percent).toBeGreaterThan(0);
    expect(model.progress.percent).toBeLessThan(100);
    expect(model.lastRefreshAt).toBe('2026-08-14T11:30:00.000Z');
    expect(model.nextAction?.id).toBe('snapshot-owned-post-metrics');
    expect(
      model.unresolvedChecks.some(
        (check) => check.id === 'continue-post-upload-engagement',
      ),
    ).toBe(true);
    expect(
      model.unresolvedChecks.every((check) => check.requirement !== 'optional'),
    ).toBe(true);
    expect(model.todayChecks.some((check) => check.days.includes(7))).toBe(
      true,
    );
  });
});

describe('canRefreshAuthorizedSignals', () => {
  it('is available for every full-blueprint platform, including YouTube and LinkedIn', () => {
    expect(canRefreshAuthorizedSignals(CredentialPlatform.TIKTOK)).toBe(true);
    expect(canRefreshAuthorizedSignals(CredentialPlatform.INSTAGRAM)).toBe(
      true,
    );
    expect(canRefreshAuthorizedSignals(CredentialPlatform.TWITTER)).toBe(true);
    expect(canRefreshAuthorizedSignals(CredentialPlatform.YOUTUBE)).toBe(true);
    expect(canRefreshAuthorizedSignals(CredentialPlatform.LINKEDIN)).toBe(true);
  });
});

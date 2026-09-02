import {
  CredentialPlatform,
  ReleaseStatus,
  TargetExecutionState,
} from '@genfeedai/enums';
import type {
  AccountHealthSummary,
  IChannelTarget,
  IReleaseGroup,
} from '@genfeedai/interfaces';
import { describe, expect, it } from 'vitest';
import {
  accountLabel,
  buildAccountGridLanes,
  computeGapSlots,
  credentialFromAccount,
  laneKindForPlatform,
  visibleAccounts,
} from './account-grid.helpers';

const NOW = new Date('2026-09-02T12:00:00.000Z');

function buildAccount(
  overrides: Partial<AccountHealthSummary> = {},
): AccountHealthSummary {
  return {
    credentialId: 'credential-ig',
    handle: '@studio',
    holdPublishing: false,
    label: 'Studio Instagram',
    override: { isActive: false },
    platform: CredentialPlatform.INSTAGRAM,
    riskLevel: 'low',
    score: 90,
    signals: {
      connectedDays: 30,
      profileSignals: 3,
      publishedPosts: 10,
      recentFailures: 0,
    },
    state: 'healthy',
    thresholds: {
      maxRecentFailures: 3,
      minConnectedDays: 7,
      minProfileSignals: 1,
      minPublishedPosts: 1,
    },
    ...overrides,
  };
}

function buildTarget(overrides: Partial<IChannelTarget> = {}): IChannelTarget {
  return {
    createdAt: '2026-09-01T00:00:00.000Z',
    credentialId: 'credential-ig',
    executionState: TargetExecutionState.SCHEDULED,
    id: 'target-1',
    isDeleted: false,
    platform: CredentialPlatform.INSTAGRAM,
    releaseId: 'release-1',
    scheduledAt: '2026-09-02T15:00:00.000Z',
    settings: {},
    timezone: 'UTC',
    updatedAt: '2026-09-01T00:00:00.000Z',
    validationIssues: [],
    validationState: 'valid' as IChannelTarget['validationState'],
    visibility: 'public' as IChannelTarget['visibility'],
    ...overrides,
  } as IChannelTarget;
}

function buildRelease(overrides: Partial<IReleaseGroup> = {}): IReleaseGroup {
  return {
    baseContent: 'Caption',
    createdAt: '2026-09-01T00:00:00.000Z',
    id: 'release-1',
    isDeleted: false,
    media: [],
    organizationId: 'org-1',
    ownerId: 'user-1',
    scheduledAt: '2026-09-02T15:00:00.000Z',
    status: ReleaseStatus.SCHEDULED,
    targets: [buildTarget()],
    timezone: 'UTC',
    title: 'Launch',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  } as IReleaseGroup;
}

describe('laneKindForPlatform', () => {
  it('maps Instagram to a 3-column grid and unknown platforms to cards', () => {
    expect(laneKindForPlatform('instagram')).toBe('grid');
    expect(laneKindForPlatform('tiktok')).toBe('portrait');
    expect(laneKindForPlatform('youtube')).toBe('landscape');
    expect(laneKindForPlatform('twitter')).toBe('cards');
    expect(laneKindForPlatform('linkedin')).toBe('cards');
  });
});

describe('accountLabel', () => {
  it('prefers the handle over the operator label', () => {
    expect(accountLabel(buildAccount())).toBe('@studio');
    expect(accountLabel(buildAccount({ handle: undefined }))).toBe(
      'Studio Instagram',
    );
  });
});

describe('credentialFromAccount', () => {
  it('projects the preview identity fields from account health', () => {
    expect(credentialFromAccount(buildAccount())).toEqual({
      externalHandle: '@studio',
      externalName: 'Studio Instagram',
      label: 'Studio Instagram',
      platform: CredentialPlatform.INSTAGRAM,
    });
  });
});

describe('visibleAccounts', () => {
  it('returns every account when no chip is selected', () => {
    const accounts = [
      buildAccount(),
      buildAccount({ credentialId: 'credential-x', handle: '@x' }),
    ];

    expect(visibleAccounts(accounts, [])).toEqual(accounts);
  });

  it('keeps only selected credential ids', () => {
    const accounts = [
      buildAccount(),
      buildAccount({ credentialId: 'credential-x', handle: '@x' }),
    ];

    expect(visibleAccounts(accounts, ['credential-x'])).toEqual([accounts[1]]);
  });
});

describe('computeGapSlots', () => {
  it('returns empty slots in the next four days that are not occupied', () => {
    const gaps = computeGapSlots({
      now: NOW,
      occupiedInstants: [Date.parse('2026-09-02T15:00:00.000Z')],
      postingTimes: [
        { hour: 9, minute: 0 },
        { hour: 15, minute: 0 },
      ],
      timezone: 'UTC',
    });

    expect(gaps[0]).toBe('2026-09-03T09:00:00.000Z');
    expect(gaps).toHaveLength(3);
    expect(gaps).not.toContain('2026-09-02T15:00:00.000Z');
  });

  it('returns no gaps when posting times are missing', () => {
    expect(
      computeGapSlots({
        now: NOW,
        occupiedInstants: [],
        postingTimes: [],
        timezone: 'UTC',
      }),
    ).toEqual([]);
  });
});

describe('buildAccountGridLanes', () => {
  it('groups targets by credential and puts unpublished items before gaps', () => {
    const xAccount = buildAccount({
      credentialId: 'credential-x',
      handle: '@desk',
      label: 'Desk X',
      platform: CredentialPlatform.TWITTER,
    });
    const lanes = buildAccountGridLanes({
      accounts: [buildAccount(), xAccount],
      now: NOW,
      postingTimesByCredential: {
        'credential-ig': [{ hour: 18, minute: 0 }],
      },
      releases: [
        buildRelease(),
        buildRelease({
          id: 'release-2',
          targets: [
            buildTarget({
              credentialId: 'credential-x',
              executionState: TargetExecutionState.PUBLISHED,
              id: 'target-x',
              platform: CredentialPlatform.TWITTER,
              publishedAt: '2026-09-01T10:00:00.000Z',
              releaseId: 'release-2',
              scheduledAt: null,
            }),
          ],
          title: 'Shipped tweet',
        }),
      ],
      selectedCredentialIds: [],
      timezone: 'UTC',
    });

    expect(lanes).toHaveLength(2);
    const instagram = lanes.find(
      (lane) => lane.account.credentialId === 'credential-ig',
    );
    const twitter = lanes.find(
      (lane) => lane.account.credentialId === 'credential-x',
    );

    expect(instagram?.kind).toBe('grid');
    expect(instagram?.queuedCount).toBe(1);
    expect(instagram?.items[0]?.kind).toBe('target');
    expect(instagram?.items[0]?.release?.id).toBe('release-1');
    expect(instagram?.items.some((item) => item.kind === 'gap')).toBe(true);

    expect(twitter?.kind).toBe('cards');
    expect(twitter?.queuedCount).toBe(0);
    expect(twitter?.items[0]?.release?.id).toBe('release-2');
  });

  it('hides unselected accounts and surfaces reconnecting accounts first', () => {
    const expired = buildAccount({
      credentialId: 'credential-expired',
      handle: '@old',
      reconnect: {
        credentialId: 'credential-expired',
        isAvailable: true,
        reason: 'disconnected',
      },
      riskLevel: 'high',
    });
    const lanes = buildAccountGridLanes({
      accounts: [buildAccount(), expired],
      now: NOW,
      postingTimesByCredential: {},
      releases: [],
      selectedCredentialIds: ['credential-ig', 'credential-expired'],
      timezone: 'UTC',
    });

    expect(lanes.map((lane) => lane.account.credentialId)).toEqual([
      'credential-expired',
      'credential-ig',
    ]);
  });
});

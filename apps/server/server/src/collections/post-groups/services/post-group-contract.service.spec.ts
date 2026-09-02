import {
  CredentialPlatform,
  PostStatus,
  PostVisibility,
  ReleaseStatus,
  ReleaseTargetSource,
  TargetAnalyticsCapability,
  TargetAnalyticsCollectionState,
  TargetAnalyticsFreshness,
  TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/enums';
import { BadRequestException } from '@nestjs/common';
import type {
  SchedulerPostAnalytics,
  SchedulerPostGroup,
  SchedulerPostTarget,
} from '@server/collections/post-groups/services/post-group.types';
import { PostGroupContractService } from '@server/collections/post-groups/services/post-group-contract.service';

describe('PostGroupContractService', () => {
  const service = new PostGroupContractService();
  const now = new Date('2026-07-19T12:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('toPostStatus', () => {
    it('maps every release status onto a valid legacy PostStatus member', () => {
      const legacyStatuses = Object.values(PostStatus) as string[];
      for (const status of Object.values(ReleaseStatus)) {
        expect(legacyStatuses).toContain(service.toPostStatus(status));
      }
    });

    it('keeps paused and cancelled targets out of the publish sweep vocabulary', () => {
      expect(service.toPostStatus(ReleaseStatus.PAUSED)).toBe(PostStatus.DRAFT);
      expect(service.toPostStatus(ReleaseStatus.CANCELLED)).toBe(
        PostStatus.DRAFT,
      );
      expect(service.toPostStatus(ReleaseStatus.PUBLISHING)).toBe(
        PostStatus.PROCESSING,
      );
      expect(service.toPostStatus(ReleaseStatus.PARTIALLY_PUBLISHED)).toBe(
        PostStatus.SCHEDULED,
      );
    });

    it('preserves already-valid non-release PostStatus values', () => {
      expect(service.toPostStatus(PostStatus.PRIVATE)).toBe(PostStatus.PRIVATE);
      expect(service.toPostStatus(PostStatus.UNLISTED)).toBe(
        PostStatus.UNLISTED,
      );
      expect(service.toPostStatus(PostStatus.PENDING)).toBe(
        PostStatus.PROCESSING,
      );
      expect(service.toPostStatus('not-a-real-status')).toBe(
        PostStatus.SCHEDULED,
      );
    });
  });

  it('parses the shared create contract and lets the header own idempotency', () => {
    const input = service.parseCreateInput(
      {
        baseContent: 'Launch note',
        idempotencyKey: 'body-key',
        targets: [
          {
            credentialId: 'credential-1',
            platform: CredentialPlatform.TWITTER,
          },
        ],
        timezone: 'UTC',
        title: 'Launch',
      },
      ' header-key ',
    );

    expect(input.idempotencyKey).toBe('header-key');
    expect(service.resolveCreateStatus(input)).toBe(ReleaseStatus.DRAFT);
  });

  it('maps durable rows into the canonical release contract', () => {
    const group = makeGroup();
    const target = makeTarget();

    expect(service.toReleaseGroup(group, [target])).toEqual(
      expect.objectContaining({
        attachments: [],
        firstTagColor: null,
        id: 'group-1',
        media: [{ assetId: 'asset-1', kind: 'image' }],
        status: ReleaseStatus.SCHEDULED,
        targetSummary: {
          scheduled: 1,
          total: 1,
        },
        targets: [
          expect.objectContaining({
            analytics: {
              collection: {
                capability: TargetAnalyticsCapability.SUPPORTED,
                error: null,
                freshness: TargetAnalyticsFreshness.UNAVAILABLE,
                lastCollectedAt: null,
                requestedAt: null,
                state: TargetAnalyticsCollectionState.UNAVAILABLE,
              },
              snapshot: null,
              state: 'unavailable',
            },
            credentialId: 'credential-1',
            executionState: TargetExecutionState.SCHEDULED,
            id: 'target-1',
            releaseId: 'group-1',
            settings: { replyPolicy: 'everyone' },
          }),
        ],
      }),
    );
  });

  it('projects the first tag color from the first target post', () => {
    const release = service.toReleaseGroup(makeGroup(), [
      makeTarget({
        tags: [
          {
            backgroundColor: '#ef4444',
            id: 'tag-launch',
            isDeleted: false,
            label: 'Launch',
            textColor: '#ffffff',
          },
          {
            backgroundColor: '#22c55e',
            id: 'tag-evergreen',
            isDeleted: false,
            label: 'Evergreen',
            textColor: '#ffffff',
          },
        ],
      }),
      makeTarget({
        id: 'target-2',
        tags: [
          {
            backgroundColor: '#3b82f6',
            id: 'tag-other',
            isDeleted: false,
            label: 'Other',
            textColor: '#ffffff',
          },
        ],
      }),
    ]);

    expect(release.firstTagColor).toBe('#ef4444');
  });

  it('leaves firstTagColor empty when the first target is untagged', () => {
    const release = service.toReleaseGroup(makeGroup(), [
      makeTarget(),
      makeTarget({
        id: 'target-2',
        tags: [
          {
            backgroundColor: '#ef4444',
            id: 'tag-launch',
            isDeleted: false,
            label: 'Launch',
            textColor: '#ffffff',
          },
        ],
      }),
    ]);

    expect(release.firstTagColor).toBeNull();
  });

  it('projects release status from targets instead of the persisted group value', () => {
    const release = service.toReleaseGroup(
      makeGroup({ status: ReleaseStatus.PUBLISHED }),
      [
        makeTarget({
          targetExecutionState: TargetExecutionState.FAILED,
        }),
      ],
    );

    expect(release.status).toBe(ReleaseStatus.FAILED);
  });

  it('maps only an exact target analytics snapshot into the release contract', () => {
    const group = makeGroup();
    const target = makeTarget();
    const analytics = makeAnalytics();

    const release = service.toReleaseGroup(
      group,
      [target],
      new Map([[target.id, analytics]]),
    );

    expect(release.targets?.[0]?.analytics).toEqual({
      collection: {
        capability: TargetAnalyticsCapability.SUPPORTED,
        error: null,
        freshness: TargetAnalyticsFreshness.FRESH,
        lastCollectedAt: '2026-07-21T12:30:00.000Z',
        requestedAt: null,
        state: TargetAnalyticsCollectionState.READY,
      },
      snapshot: {
        comments: 8,
        engagementRate: 0.14,
        likes: 55,
        saves: 3,
        shares: 5,
        snapshotDate: '2026-07-21T00:00:00.000Z',
        updatedAt: '2026-07-21T12:30:00.000Z',
        views: 1000,
      },
      state: 'ready',
    });
    expect(release.analyticsComparison).toEqual(
      expect.objectContaining({
        metricDefinitions: [
          'views',
          'likes',
          'comments',
          'shares',
          'saves',
          'engagementRate',
        ],
        releaseId: 'group-1',
        state: 'ready',
        targets: [
          expect.objectContaining({
            metrics: expect.objectContaining({ views: 1000 }),
            snapshotIdentity: {
              snapshotDate: '2026-07-21T00:00:00.000Z',
              updatedAt: '2026-07-21T12:30:00.000Z',
            },
            targetId: 'target-1',
          }),
        ],
      }),
    );
  });

  it.each([
    ['organization', { organizationId: 'org-2' }],
    ['brand', { brandId: 'brand-2' }],
    ['platform', { platform: CredentialPlatform.LINKEDIN }],
    ['target', { postId: 'target-2' }],
  ])(
    'rejects an analytics row from a different %s scope',
    (_scope, overrides) => {
      const group = makeGroup();
      const target = makeTarget();
      const analytics = makeAnalytics(overrides);

      const release = service.toReleaseGroup(
        group,
        [target],
        new Map([[target.id, analytics]]),
      );

      expect(release.targets?.[0]?.analytics).toEqual({
        collection: {
          capability: TargetAnalyticsCapability.SUPPORTED,
          error: null,
          freshness: TargetAnalyticsFreshness.UNAVAILABLE,
          lastCollectedAt: null,
          requestedAt: null,
          state: TargetAnalyticsCollectionState.UNAVAILABLE,
        },
        snapshot: null,
        state: 'unavailable',
      });
    },
  );

  it('preserves the last-good snapshot while surfacing a retryable failure', () => {
    vi.setSystemTime(new Date('2026-07-21T14:00:00.000Z'));
    const group = makeGroup();
    const target = makeTarget({
      analyticsCollectedAt: new Date('2026-07-21T12:30:00.000Z'),
      analyticsCollectionError: {
        code: 'analytics.rate_limited',
        failedAt: '2026-07-21T13:45:00.000Z',
        isRetryable: true,
        message: 'Twitter analytics is temporarily rate limited.',
      },
      analyticsCollectionRequestedAt: new Date('2026-07-21T13:40:00.000Z'),
      analyticsCollectionState: TargetAnalyticsCollectionState.FAILED,
    });

    const release = service.toReleaseGroup(
      group,
      [target],
      new Map([[target.id, makeAnalytics()]]),
    );

    expect(release.targets?.[0]?.analytics).toEqual(
      expect.objectContaining({
        collection: {
          capability: TargetAnalyticsCapability.SUPPORTED,
          error: {
            code: 'analytics.rate_limited',
            failedAt: '2026-07-21T13:45:00.000Z',
            isRetryable: true,
            message: 'Twitter analytics is temporarily rate limited.',
          },
          freshness: TargetAnalyticsFreshness.STALE,
          lastCollectedAt: '2026-07-21T12:30:00.000Z',
          requestedAt: '2026-07-21T13:40:00.000Z',
          state: TargetAnalyticsCollectionState.FAILED,
        },
        state: 'ready',
      }),
    );
  });

  it('reports provider capability gaps without collection errors', () => {
    const group = makeGroup();
    const target = makeTarget({
      platform: CredentialPlatform.DISCORD,
    });

    const release = service.toReleaseGroup(group, [target]);

    expect(release.targets?.[0]?.analytics.collection).toEqual({
      capability: TargetAnalyticsCapability.UNSUPPORTED,
      error: null,
      freshness: TargetAnalyticsFreshness.UNAVAILABLE,
      lastCollectedAt: null,
      requestedAt: null,
      state: TargetAnalyticsCollectionState.UNAVAILABLE,
    });
  });

  it('preserves validation and strict schedule error categories', () => {
    expect(() => service.parseFutureScheduleDate('not-a-date')).toThrow(
      BadRequestException,
    );
    expect(() =>
      service.parseFutureScheduleDate('2026-07-19T11:59:58.000Z'),
    ).toThrow('must be now or in the future');
    expect(
      service.parseFutureScheduleDate(new Date().toISOString()).getTime(),
    ).toBeGreaterThan(Date.now() - 2000);
    expect(() => service.parseCredentialPlatform('unsupported')).toThrow(
      'not supported',
    );
  });

  it('allows a past calendar-move timestamp while still requiring ISO-8601', () => {
    expect(
      service.parseScheduleDate('2026-07-01T09:00:00.000Z').toISOString(),
    ).toBe('2026-07-01T09:00:00.000Z');
    expect(() => service.parseScheduleDate('Tuesday')).toThrow(
      BadRequestException,
    );
  });

  it('clones a live release into a scheduled create payload without recurrence', () => {
    const input = service.buildRepublishCreateInput(
      makeGroup({
        recurrence: { frequency: 'weekly', interval: 1 },
        status: ReleaseStatus.PUBLISHED,
      }),
      [
        makeTarget({
          description: 'X-specific caption',
          targetExecutionState: TargetExecutionState.PUBLISHED,
        }),
        makeTarget({
          credentialId: 'credential-2',
          id: 'target-2',
          targetExecutionState: TargetExecutionState.CANCELLED,
        }),
      ],
      '2026-07-21T09:00:00.000Z',
    );

    expect(input).toEqual(
      expect.objectContaining({
        baseContent: 'Launch note',
        brandId: 'brand-1',
        scheduledDate: '2026-07-21T09:00:00.000Z',
        status: ReleaseStatus.SCHEDULED,
        title: 'Launch',
      }),
    );
    expect(input.recurrence).toBeUndefined();
    expect(input.targets).toEqual([
      expect.objectContaining({
        caption: 'X-specific caption',
        credentialId: 'credential-1',
        platform: CredentialPlatform.TWITTER,
        scheduledDate: '2026-07-21T09:00:00.000Z',
      }),
    ]);
  });

  it.each([
    {
      expected: ReleaseTargetSource.MANUAL,
      name: 'a target with no provenance',
      overrides: {},
    },
    {
      expected: ReleaseTargetSource.AGENT,
      name: 'a target carrying only agent provenance',
      overrides: { agentThreadId: 'thread-1' },
    },
    {
      expected: ReleaseTargetSource.AGENT,
      name: 'a target whose only provenance is a context source',
      overrides: { agentContextSource: 'brand-voice' },
    },
    {
      expected: ReleaseTargetSource.WORKFLOW,
      name: 'a target executed by a workflow despite agent provenance',
      overrides: {
        agentThreadId: 'thread-1',
        workflowExecutionId: 'execution-1',
      },
    },
  ])('derives $expected for $name', ({ expected, overrides }) => {
    const release = service.toReleaseGroup(makeGroup(), [
      makeTarget(overrides),
    ]);

    expect(release.targets?.[0]?.source).toBe(expected);
  });

  it('matches only the provenance fields supplied by the caller', () => {
    const target = makeTarget({
      agentContextSource: 'explicit',
      agentContextVersion: 4,
      agentThreadId: 'thread-1',
    });

    expect(
      service.matchesScheduleProvenance(target, {
        agentContextSource: 'explicit',
        agentThreadId: 'thread-1',
      }),
    ).toBe(true);
    expect(
      service.matchesScheduleProvenance(target, {
        agentContextVersion: 3,
      }),
    ).toBe(false);
  });

  it('uses a per-target caption override for channel validation', () => {
    const shared = service.validateTarget(
      { baseContent: 'x'.repeat(300), media: [] },
      {
        credentialId: 'credential-twitter',
        platform: CredentialPlatform.TWITTER,
        visibility: PostVisibility.PUBLIC,
      },
      'publish_now',
    );
    const overridden = service.validateTarget(
      { baseContent: 'x'.repeat(300), media: [] },
      {
        caption: 'Short X caption',
        credentialId: 'credential-twitter',
        platform: CredentialPlatform.TWITTER,
        visibility: PostVisibility.PUBLIC,
      },
      'publish_now',
    );

    expect(shared.valid).toBe(false);
    expect(shared.errors.some((issue) => issue.field === 'caption')).toBe(true);
    expect(overridden.valid).toBe(true);
    expect(service.readTargetCaption(undefined, 'Shared caption')).toBe(
      'Shared caption',
    );
    expect(service.readTargetCaption('  X override  ', 'Shared caption')).toBe(
      'X override',
    );
  });
});

function makeGroup(
  overrides: Partial<SchedulerPostGroup> = {},
): SchedulerPostGroup {
  return {
    attachments: [],
    baseContent: 'Launch note',
    brandId: 'brand-1',
    campaignId: null,
    createdAt: new Date('2026-07-19T10:00:00.000Z'),
    id: 'group-1',
    idempotencyKey: 'request-1',
    isDeleted: false,
    media: [{ assetId: 'asset-1', kind: 'image' }],
    organizationId: 'org-1',
    ownerId: 'user-1',
    postingSetId: null,
    publishedAt: null,
    rssFeedItemId: null,
    rssSourceId: null,
    recurrence: null,
    scheduledAt: new Date('2026-07-20T10:00:00.000Z'),
    status: ReleaseStatus.SCHEDULED,
    statusTransitions: [],
    timezone: 'UTC',
    title: 'Launch',
    updatedAt: new Date('2026-07-19T10:00:00.000Z'),
    ...overrides,
  };
}

function makeTarget(
  overrides: Partial<SchedulerPostTarget> = {},
): SchedulerPostTarget {
  return {
    agentContextSource: null,
    agentContextVersion: null,
    agentStrategyId: null,
    agentThreadId: null,
    analyticsCollectedAt: null,
    analyticsCollectionAttemptKey: null,
    analyticsCollectionError: null,
    analyticsCollectionRequestedAt: null,
    analyticsCollectionState: TargetAnalyticsCollectionState.UNAVAILABLE,
    brandId: 'brand-1',
    campaignId: null,
    createdAt: new Date('2026-07-19T10:00:00.000Z'),
    credentialId: 'credential-1',
    externalId: null,
    externalShortcode: null,
    groupId: 'group-1',
    id: 'target-1',
    isDeleted: false,
    lastAttemptAt: null,
    order: 0,
    platform: CredentialPlatform.TWITTER,
    publishedAt: null,
    publishApprovalId: null,
    retryCount: 0,
    scheduledDate: new Date('2026-07-20T10:00:00.000Z'),
    status: PostStatus.SCHEDULED,
    targetAttachments: [],
    targetError: null,
    targetExecutionState: TargetExecutionState.SCHEDULED,
    targetIdempotencyKey: 'target-request-1',
    targetReadiness: null,
    targetSettings: { replyPolicy: 'everyone' },
    targetValidationIssues: [],
    targetValidationState: TargetValidationState.VALID,
    timezone: 'UTC',
    updatedAt: new Date('2026-07-19T10:00:00.000Z'),
    url: null,
    visibility: PostVisibility.PUBLIC,
    workflowExecutionId: null,
    ...overrides,
  };
}

function makeAnalytics(
  overrides: Partial<SchedulerPostAnalytics> = {},
): SchedulerPostAnalytics {
  return {
    brandId: 'brand-1',
    date: new Date('2026-07-21T00:00:00.000Z'),
    engagementRate: 0.14,
    id: 'analytics-1',
    organizationId: 'org-1',
    platform: CredentialPlatform.TWITTER,
    postId: 'target-1',
    totalComments: 8,
    totalLikes: 55,
    totalSaves: 3,
    totalShares: 5,
    totalViews: 1000,
    updatedAt: new Date('2026-07-21T12:30:00.000Z'),
    ...overrides,
  };
}

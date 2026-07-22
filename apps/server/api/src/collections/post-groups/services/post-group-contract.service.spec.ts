import type {
  SchedulerPostAnalytics,
  SchedulerPostGroup,
  SchedulerPostTarget,
} from '@api/collections/post-groups/services/post-group.types';
import { PostGroupContractService } from '@api/collections/post-groups/services/post-group-contract.service';
import {
  CredentialPlatform,
  ReleaseStatus,
  TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/enums';
import { BadRequestException } from '@nestjs/common';

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
        id: 'group-1',
        media: [{ assetId: 'asset-1', kind: 'image' }],
        status: ReleaseStatus.SCHEDULED,
        targetSummary: {
          scheduled: 1,
          total: 1,
        },
        targets: [
          expect.objectContaining({
            analytics: { snapshot: null, state: 'unavailable' },
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
  });

  it.each([
    ['organization', { organizationId: 'org-2' }],
    ['brand', { brandId: 'brand-2' }],
    ['platform', { platform: CredentialPlatform.LINKEDIN }],
    ['target', { postId: 'target-2' }],
  ])('rejects an analytics row from a different %s scope', (_scope, overrides) => {
    const group = makeGroup();
    const target = makeTarget();
    const analytics = makeAnalytics(overrides);

    const release = service.toReleaseGroup(
      group,
      [target],
      new Map([[target.id, analytics]]),
    );

    expect(release.targets?.[0]?.analytics).toEqual({
      snapshot: null,
      state: 'unavailable',
    });
  });

  it('preserves validation and strict schedule error categories', () => {
    expect(() => service.parseFutureScheduleDate('not-a-date')).toThrow(
      BadRequestException,
    );
    expect(() =>
      service.parseFutureScheduleDate('2026-07-19T11:59:59.000Z'),
    ).toThrow('must be in the future');
    expect(() => service.parseCredentialPlatform('unsupported')).toThrow(
      'not supported',
    );
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
});

function makeGroup(
  overrides: Partial<SchedulerPostGroup> = {},
): SchedulerPostGroup {
  return {
    attachments: [],
    baseContent: 'Launch note',
    brandId: 'brand-1',
    createdAt: new Date('2026-07-19T10:00:00.000Z'),
    id: 'group-1',
    idempotencyKey: 'request-1',
    isDeleted: false,
    media: [{ assetId: 'asset-1', kind: 'image' }],
    organizationId: 'org-1',
    ownerId: 'user-1',
    publishedAt: null,
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
    agentRunId: null,
    agentStrategyId: null,
    agentThreadId: null,
    brandId: 'brand-1',
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

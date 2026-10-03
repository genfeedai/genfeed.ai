import type { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import {
  recordExternalPublicationAction,
  scheduleCanonicalPostAction,
} from '@api/services/agent-orchestrator/tools/agent-publish-canonical-actions';
import {
  CredentialPlatform,
  PostVisibility,
  ReleaseStatus,
  ReleaseTargetSource,
  TargetAnalyticsCapability,
  TargetAnalyticsCollectionState,
  TargetAnalyticsFreshness,
  TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/contracts';
import type {
  IChannelTarget,
  IReleaseGroup,
  ScheduleCanonicalPostInput,
} from '@genfeedai/contracts/interfaces';
import { ConflictException } from '@nestjs/common';

const input: ScheduleCanonicalPostInput = {
  groupId: 'release-1',
  postId: 'post-1',
  scheduledAt: '2099-01-01T00:00:00.000Z',
  ctx: {
    organizationId: 'org-1',
    userId: 'user-1',
    runId: 'run-1',
    strategyId: 'strategy-1',
    validatedScope: {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
      threadId: 'thread-1',
      contextVersion: 3,
      source: 'explicit',
      isLegacyFallback: false,
      isVersionExplicit: true,
    },
  },
};
const target: IChannelTarget = {
  id: input.postId,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  isDeleted: false,
  releaseId: input.groupId,
  platform: CredentialPlatform.TWITTER,
  credentialId: 'credential-1',
  timezone: 'UTC',
  settings: {},
  visibility: PostVisibility.PUBLIC,
  validationState: TargetValidationState.VALID,
  validationIssues: [],
  executionState: TargetExecutionState.SCHEDULED,
  source: ReleaseTargetSource.AGENT,
  analytics: {
    state: 'unavailable',
    snapshot: null,
    collection: {
      capability: TargetAnalyticsCapability.UNSUPPORTED,
      freshness: TargetAnalyticsFreshness.UNAVAILABLE,
      state: TargetAnalyticsCollectionState.UNAVAILABLE,
      error: null,
      lastCollectedAt: null,
      requestedAt: null,
    },
  },
  retryCount: 0,
  order: 0,
};
const release: IReleaseGroup = {
  id: input.groupId,
  createdAt: target.createdAt,
  updatedAt: target.updatedAt,
  isDeleted: false,
  title: 'Scheduled release',
  baseContent: 'Content',
  media: [],
  timezone: 'UTC',
  ownerId: input.ctx.userId,
  organizationId: input.ctx.organizationId,
  status: ReleaseStatus.SCHEDULED,
  targets: [target],
  analyticsComparison: {
    metricDefinitions: [],
    releaseId: input.groupId,
    state: 'empty',
    targets: [],
  },
};
function fixture(value: IReleaseGroup = release) {
  return {
    scheduleTarget: vi
      .fn<PostGroupsService['scheduleTarget']>()
      .mockResolvedValue(value),
  };
}

describe('scheduleCanonicalPostAction', () => {
  it('calls the approval-backed scheduler with exact target scope and provenance and returns its scheduled action', async () => {
    const scheduledAt = '2099-01-02T00:00:00.000Z';
    const groups = fixture({
      ...release,
      targets: [{ ...target, scheduledAt }],
    });
    expect(await scheduleCanonicalPostAction(groups, input)).toEqual({
      success: true,
      creditsUsed: 1,
      data: {
        id: input.postId,
        releaseId: input.groupId,
        scheduledAt,
        status: TargetExecutionState.SCHEDULED,
      },
      nextActions: [
        {
          ctas: [{ href: '/content/posts', label: 'Open posts' }],
          description:
            'The canonical release target is approval-backed and will enter the normal publish queue when due.',
          id: `scheduled-post-${input.postId}`,
          scheduledAt,
          title: 'Post scheduled',
          type: 'schedule_post_card',
        },
      ],
    });
    expect(groups.scheduleTarget).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      input.groupId,
      input.postId,
      input.scheduledAt,
      {
        agentContextSource: 'explicit',
        agentContextVersion: 3,
        workflowExecutionId: 'run-1',
        agentStrategyId: 'strategy-1',
        agentThreadId: 'thread-1',
      },
    );
  });

  it('uses the requested schedule when the scheduled target omits its date', async () => {
    expect(await scheduleCanonicalPostAction(fixture(), input)).toMatchObject({
      data: { scheduledAt: input.scheduledAt },
      nextActions: [{ scheduledAt: input.scheduledAt }],
    });
  });

  it.each([
    { targets: undefined },
    { targets: [] },
    { targets: [{ ...target, id: 'other-post' }] },
    { targets: [{ ...target, executionState: TargetExecutionState.DRAFT }] },
  ])(
    'rejects an absent or unscheduled exact target: %j',
    async ({ targets }) => {
      await expect(
        scheduleCanonicalPostAction(fixture({ ...release, targets }), input),
      ).rejects.toThrow(ConflictException);
    },
  );

  it('propagates scheduling errors to the existing safe-error boundary', async () => {
    const groups = fixture();
    const error = new Error('scheduler failure');
    groups.scheduleTarget.mockRejectedValue(error);
    await expect(scheduleCanonicalPostAction(groups, input)).rejects.toBe(
      error,
    );
  });
});

describe('recordExternalPublicationAction', () => {
  it('rejects a different authenticated brand before persistence', async () => {
    const posts = { recordExternalPublication: vi.fn() };
    await expect(
      recordExternalPublicationAction(
        posts,
        {
          brandId: 'brand-1',
          platform: 'twitter',
          publicationKind: 'post',
          url: 'https://x.com/alice/status/123',
          description: '',
          publicationDate: '2026-01-01T00:00:00.000Z',
        },
        { organizationId: 'org-1', userId: 'user-1', brandId: 'other' },
        vi.fn(),
      ),
    ).rejects.toThrow(
      'Reported publication must match the authenticated brand context',
    );
    expect(posts.recordExternalPublication).not.toHaveBeenCalled();
  });
});

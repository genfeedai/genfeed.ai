import { TargetExecutionState } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bindScheduledPublishApproval,
  isScheduledPublishDueNow,
  needsScheduledPublishApproval,
} from './post-schedule-approval.util';

describe('post-schedule-approval.util', () => {
  const publishApprovalsService = {
    createForCurrentPost: vi.fn(),
    markQueued: vi.fn(),
  };
  const scheduledPostWorkflowQueue = {
    enqueue: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    publishApprovalsService.createForCurrentPost.mockResolvedValue({
      artifactVersionPinId: 'pin-1',
      id: 'approval-1',
      operationId: 'op-1',
    });
  });

  it('treats scheduled and publishing as publishable', () => {
    expect(needsScheduledPublishApproval(TargetExecutionState.SCHEDULED)).toBe(
      true,
    );
    expect(needsScheduledPublishApproval(TargetExecutionState.PUBLISHING)).toBe(
      true,
    );
    expect(needsScheduledPublishApproval(TargetExecutionState.DRAFT)).toBe(
      false,
    );
  });

  it('treats missing or past dates as due now', () => {
    expect(isScheduledPublishDueNow(undefined)).toBe(true);
    expect(isScheduledPublishDueNow(new Date('2000-01-01T00:00:00.000Z'))).toBe(
      true,
    );
    expect(
      isScheduledPublishDueNow(
        new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      ),
    ).toBe(false);
  });

  it('skips thread children and drafts', async () => {
    await bindScheduledPublishApproval({
      post: {
        id: 'child-1',
        organizationId: 'org-1',
        parentId: 'root-1',
        targetExecutionState: TargetExecutionState.SCHEDULED,
        userId: 'user-1',
      },
      publishApprovalsService,
    });
    await bindScheduledPublishApproval({
      post: {
        id: 'draft-1',
        organizationId: 'org-1',
        targetExecutionState: TargetExecutionState.DRAFT,
        userId: 'user-1',
      },
      publishApprovalsService,
    });
    expect(publishApprovalsService.createForCurrentPost).not.toHaveBeenCalled();
  });

  it('fails closed without an approval service or actor', async () => {
    await expect(
      bindScheduledPublishApproval({
        post: {
          id: 'post-1',
          organizationId: 'org-1',
          targetExecutionState: TargetExecutionState.SCHEDULED,
          userId: 'user-1',
        },
      }),
    ).rejects.toThrow('publish approval service');
    await expect(
      bindScheduledPublishApproval({
        post: {
          id: 'post-1',
          organizationId: 'org-1',
          targetExecutionState: TargetExecutionState.SCHEDULED,
        },
        publishApprovalsService,
      }),
    ).rejects.toThrow('actor user id');
  });

  it('mints a future approval without enqueueing', async () => {
    await bindScheduledPublishApproval({
      post: {
        id: 'post-1',
        organizationId: 'org-1',
        scheduledDate: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        targetExecutionState: TargetExecutionState.SCHEDULED,
        userId: 'user-1',
      },
      scheduledPostWorkflowQueue,
      publishApprovalsService,
    });

    expect(publishApprovalsService.createForCurrentPost).toHaveBeenCalledWith({
      actorUserId: 'user-1',
      mode: 'scheduled',
      organizationId: 'org-1',
      postId: 'post-1',
      provenance: { surface: 'posts-service' },
    });
    expect(scheduledPostWorkflowQueue.enqueue).not.toHaveBeenCalled();
  });

  it('mints and enqueues due-now scheduled posts', async () => {
    await bindScheduledPublishApproval({
      actorUserId: 'actor-1',
      post: {
        id: 'post-1',
        organizationId: 'org-1',
        scheduledDate: new Date().toISOString(),
        targetExecutionState: TargetExecutionState.SCHEDULED,
      },
      scheduledPostWorkflowQueue,
      provenanceSurface: 'persona-publisher',
      publishApprovalsService,
    });

    expect(publishApprovalsService.createForCurrentPost).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'actor-1',
        mode: 'immediate',
        provenance: { surface: 'persona-publisher' },
      }),
    );
    expect(publishApprovalsService.markQueued).not.toHaveBeenCalled();
    expect(scheduledPostWorkflowQueue.enqueue).toHaveBeenCalledWith({
      approvalId: 'approval-1',
      operationId: 'op-1',
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'publish_now',
      userId: 'actor-1',
      versionPinId: 'pin-1',
    });
  });
});

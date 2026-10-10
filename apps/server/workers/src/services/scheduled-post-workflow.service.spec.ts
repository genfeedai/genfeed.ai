import { bindLearningPublicationV1 } from '@api/collections/content-learning/services/learning-artifact-binding.helper';
import {
  SCHEDULED_POST_ACTION_IDS,
  type ScheduledPostWorkflowInput,
} from '@api/collections/posts/services/scheduled-post-workflow-definition';
import type { SystemWorkflowTerminalFailureHandler } from '@api/collections/workflows/system-workflow-runner.service';
import {
  PublishApprovalStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { PostRepeatSchedulerService } from '@workers/services/post-repeat-scheduler.service';
import { ScheduledPostWorkflowService } from '@workers/services/scheduled-post-workflow.service';

vi.mock(
  '@api/collections/content-learning/services/learning-artifact-binding.helper',
  () => ({ bindLearningPublicationV1: vi.fn() }),
);
const bindLearningPublication = vi.mocked(bindLearningPublicationV1);

type RegisteredActionRequest = {
  input: Record<string, unknown>;
  provenance?: { executionId: string };
};

type RegisteredAction = (request: RegisteredActionRequest) => Promise<unknown>;

function createHarness() {
  const registeredActions = new Map<string, RegisteredAction>();
  const activitiesService = {
    record: vi.fn().mockResolvedValue(undefined),
    findOne: vi.fn().mockResolvedValue(null),
  };
  const deliveryService = {
    failTerminalValidation: vi
      .fn()
      .mockResolvedValue({ platform: '', success: false }),
  };
  const discoveryService = {
    findEligiblePost: vi.fn().mockResolvedValue(null),
    findPost: vi.fn().mockResolvedValue({
      brandId: 'brand-1',
      id: 'post-1',
      organizationId: 'org-1',
      userId: 'user-1',
    }),
  };
  const executionGuard = {
    assertAgentPublishingScope: vi.fn().mockResolvedValue(undefined),
    assertPublishVersionPin: vi.fn().mockResolvedValue(undefined),
  };
  const publishApprovalsService = {
    claimForExecution: vi.fn().mockResolvedValue({
      executionStartedAt: '2026-10-03T10:00:00.000Z',
      isAlreadyPublished: false,
    }),
    completeExecution: vi.fn().mockResolvedValue(undefined),
  };
  const prisma = {
    post: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    postPublishFinalization: {
      findUnique: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const repeatScheduler = {
    scheduleNextRepeat: vi.fn().mockResolvedValue(undefined),
  };
  const terminalFailures = new Map<
    string,
    SystemWorkflowTerminalFailureHandler
  >();
  const runner = {
    registerAction: vi.fn((actionId: string, action: RegisteredAction) => {
      registeredActions.set(actionId, action);
    }),
    terminalFailures: {
      register: vi.fn(
        (canonicalId: string, handler: SystemWorkflowTerminalFailureHandler) =>
          terminalFailures.set(canonicalId, handler),
      ),
    },
    registerWorkflow: vi.fn(),
  };
  const logger = { warn: vi.fn(), error: vi.fn() };
  const service = new ScheduledPostWorkflowService(
    activitiesService as never,
    deliveryService as never,
    discoveryService as never,
    executionGuard as never,
    logger as never,
    publishApprovalsService as never,
    prisma as never,
    repeatScheduler as never,
    runner as never,
  );
  service.onModuleInit();

  return {
    activitiesService,
    deliveryService,
    discoveryService,
    logger,
    prisma,
    publishApprovalsService,
    registeredActions,
    repeatScheduler,
    service,
    terminalFailures,
  };
}

async function finalize(
  registeredActions: Map<string, RegisteredAction>,
  executionState: TargetExecutionState,
  deliveryOverrides: Record<string, unknown> = {},
) {
  const action = registeredActions.get(SCHEDULED_POST_ACTION_IDS.FINALIZE);
  if (!action) {
    throw new Error('Scheduled post finalize action was not registered');
  }
  const request: ScheduledPostWorkflowInput = {
    approvalId: 'approval-1',
    operationId: 'operation-1',
    organizationId: 'org-1',
    postId: 'post-1',
    source: 'tiktok_app',
    userId: 'user-1',
    versionPinId: 'pin-1',
  };

  return action({
    input: {
      claim: {
        executionStartedAt: '2026-08-31T10:00:00.000Z',
        isAlreadyPublished: false,
        publishedResult: {},
      },
      delivery: {
        executionState,
        externalId: 'tiktok-upload-1',
        platform: 'tiktok',
        success: true,
        url: '',
        ...deliveryOverrides,
      },
      request,
    },
  });
}

describe('ScheduledPostWorkflowService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not announce or repeat a successful TikTok app handoff that is still publishing', async () => {
    const harness = createHarness();

    await finalize(harness.registeredActions, TargetExecutionState.PUBLISHING);

    expect(
      harness.publishApprovalsService.completeExecution,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalId: 'approval-1',
        isSuccessful: true,
      }),
    );
    expect(harness.activitiesService.record).not.toHaveBeenCalled();
    expect(harness.repeatScheduler.scheduleNextRepeat).not.toHaveBeenCalled();
  });

  it('announces and repeats a successful public publish', async () => {
    const harness = createHarness();

    await finalize(harness.registeredActions, TargetExecutionState.PUBLISHED);

    expect(harness.activitiesService.record).toHaveBeenCalledOnce();
    expect(harness.repeatScheduler.scheduleNextRepeat).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'post-1' }),
      'ScheduledPostWorkflowService.finalize',
      { rethrowFailures: true },
    );
  });

  it('does not announce or repeat a published provider draft', async () => {
    const harness = createHarness();

    await finalize(harness.registeredActions, TargetExecutionState.PUBLISHED, {
      isProviderDraft: true,
    });

    expect(harness.activitiesService.record).not.toHaveBeenCalled();
    expect(harness.repeatScheduler.scheduleNextRepeat).not.toHaveBeenCalled();
  });

  it('completes a persisted finalization stage by stage', async () => {
    const harness = createHarness();
    harness.prisma.postPublishFinalization.findUnique.mockResolvedValue({
      activityCompletedAt: null,
      completedAt: null,
      id: 'finalization-1',
      recurrenceCompletedAt: null,
      result: {
        executionState: TargetExecutionState.PUBLISHED,
        externalId: 'tiktok-post-1',
        isProviderDraft: false,
        platform: 'tiktok',
        success: true,
        url: 'https://tiktok.example/post-1',
      },
      source: 'CronTiktokStatusService.applyStatusTransition',
    });

    await expect(
      harness.service.processPendingPublishedFinalization({
        brandId: 'brand-1',
        id: 'post-1',
        organizationId: 'org-1',
        userId: 'user-1',
      } as never),
    ).resolves.toBe(true);

    expect(harness.activitiesService.record).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'post-published:post-1' }),
    );
    expect(harness.repeatScheduler.scheduleNextRepeat).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'post-1' }),
      'CronTiktokStatusService.applyStatusTransition',
      { rethrowFailures: true },
    );
    expect(
      harness.prisma.postPublishFinalization.updateMany,
    ).toHaveBeenCalledTimes(3);
  });

  it.each([false, true])(
    'reuses the repeat after finalization acknowledgement failed (successor published: %s)',
    async (successorPublished) => {
      const harness = createHarness();
      const post = {
        id: 'post-1',
        organizationId: 'org-1',
        userId: 'user-1',
        brandId: 'brand-1',
        credentialId: 'credential-1',
        platform: 'tiktok',
        isRepeat: true,
        repeatFrequency: 'daily',
        repeatInterval: 1,
        repeatCount: 0,
        maxRepeats: 5,
        scheduledDate: new Date('2026-09-01T10:00:00.000Z'),
        timezone: 'UTC',
      };
      const occurrences: Array<Record<string, unknown>> = [];
      const posts = {
        findOne: vi.fn(
          async (where: Record<string, unknown>) =>
            occurrences.find((row) => {
              const key = where.targetIdempotencyKey;
              return typeof key === 'string'
                ? row.targetIdempotencyKey === key
                : typeof key === 'object' &&
                    key !== null &&
                    'startsWith' in key &&
                    String(row.targetIdempotencyKey).startsWith(
                      String(key.startsWith),
                    );
            }) ?? null,
        ),
        create: vi.fn(async (data: Record<string, unknown>) => {
          const created = { ...data, id: `repeat-${occurrences.length + 1}` };
          occurrences.push(created);
          return created;
        }),
        patch: vi.fn(async (_id: string, data: { repeatCount: number }) => {
          post.repeatCount = data.repeatCount;
        }),
      };
      const scheduler = new PostRepeatSchedulerService(
        { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
        posts as never,
        {
          createForCurrentPost: vi
            .fn()
            .mockResolvedValue({ id: 'repeat-approval' }),
        } as never,
        {} as never,
        { shouldMaterialize: vi.fn().mockResolvedValue(false) } as never,
      );
      harness.repeatScheduler.scheduleNextRepeat.mockImplementation(
        (
          ...args: Parameters<PostRepeatSchedulerService['scheduleNextRepeat']>
        ) => scheduler.scheduleNextRepeat(...args),
      );
      harness.prisma.postPublishFinalization.findUnique.mockResolvedValue({
        activityCompletedAt: new Date(),
        completedAt: null,
        id: 'finalization-1',
        recurrenceCompletedAt: null,
        result: {
          executionState: TargetExecutionState.PUBLISHED,
          success: true,
          platform: 'tiktok',
        },
        source: 'TikTok finalization',
      });
      harness.prisma.postPublishFinalization.updateMany.mockRejectedValueOnce(
        new Error('acknowledgement unavailable'),
      );

      await expect(
        harness.service.processPendingPublishedFinalization({
          ...post,
        } as never),
      ).rejects.toThrow('acknowledgement unavailable');
      expect(post.repeatCount).toBe(1);
      const [occurrence] = occurrences;
      if (!occurrence) {
        throw new Error('The first finalization did not create a repeat.');
      }
      if (successorPublished) {
        occurrence.repeatCount = 2;
        occurrence.targetExecutionState = TargetExecutionState.PUBLISHED;
      }
      await expect(
        harness.service.processPendingPublishedFinalization({
          ...post,
        } as never),
      ).resolves.toBe(true);

      expect(posts.create).toHaveBeenCalledOnce();
      expect(post.repeatCount).toBe(1);
      expect(occurrence).toEqual(
        expect.objectContaining({
          scheduledDate: new Date('2026-09-02T10:00:00.000Z'),
          repeatCount: successorPublished ? 2 : 1,
        }),
      );
    },
  );

  it('records retry metadata without repeating a completed activity stage', async () => {
    const harness = createHarness();
    harness.prisma.postPublishFinalization.findUnique.mockResolvedValue({
      activityCompletedAt: new Date('2026-09-04T12:00:00.000Z'),
      completedAt: null,
      id: 'finalization-1',
      recurrenceCompletedAt: null,
      result: {
        executionState: TargetExecutionState.PUBLISHED,
        externalId: 'tiktok-post-1',
        isProviderDraft: false,
        platform: 'tiktok',
        success: true,
        url: 'https://tiktok.example/post-1',
      },
      source: 'CronTiktokStatusService.applyStatusTransition',
    });
    harness.repeatScheduler.scheduleNextRepeat.mockRejectedValueOnce(
      new Error('repeat unavailable'),
    );

    await expect(
      harness.service.processPendingPublishedFinalization({
        id: 'post-1',
        organizationId: 'org-1',
      } as never),
    ).rejects.toThrow('repeat unavailable');

    expect(harness.activitiesService.record).not.toHaveBeenCalled();
    expect(
      harness.prisma.postPublishFinalization.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ attempts: { increment: 1 } }),
      }),
    );
  });
});

describe('learning publication binding after approval completion', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });
  it('binds after the approval completes as published', async () => {
    const harness = createHarness();
    await finalize(harness.registeredActions, TargetExecutionState.PUBLISHED);
    expect(bindLearningPublication).toHaveBeenCalledExactlyOnceWith(
      harness.prisma,
      'org-1',
      'post-1',
    );
    expect(bindLearningPublication.mock.invocationCallOrder[0]).toBeGreaterThan(
      harness.publishApprovalsService.completeExecution.mock
        .invocationCallOrder[0],
    );
  });
  it('does not bind a failed delivery', async () => {
    const harness = createHarness();
    await finalize(harness.registeredActions, TargetExecutionState.FAILED, {
      success: false,
      error: 'provider failed',
    });
    expect(bindLearningPublication).not.toHaveBeenCalled();
  });
  it('keeps finalizing when learning binding rejects', async () => {
    const harness = createHarness();
    bindLearningPublication.mockRejectedValueOnce(new Error('learning down'));
    await finalize(harness.registeredActions, TargetExecutionState.PUBLISHED);
    expect(harness.logger.warn).toHaveBeenCalledWith(
      'Learning publication binding skipped',
      expect.objectContaining({ postId: 'post-1' }),
    );
    expect(harness.activitiesService.record).toHaveBeenCalledOnce();
  });
});

describe('immutable outbox selection', () => {
  it('treats an already-completed outbox as present without legacy side effects', async () => {
    const h = createHarness();
    h.prisma.postPublishFinalization.findUnique.mockResolvedValue({
      id: 'final-1',
      completedAt: new Date(),
    });
    await finalize(h.registeredActions, TargetExecutionState.PUBLISHED);
    expect(h.publishApprovalsService.completeExecution).toHaveBeenCalledOnce();
    expect(h.prisma.postPublishFinalization.findUnique).toHaveBeenCalledWith({
      where: {
        organizationId_postId: { organizationId: 'org-1', postId: 'post-1' },
      },
      select: { id: true },
    });
    expect(h.activitiesService.record).not.toHaveBeenCalled();
    expect(h.repeatScheduler.scheduleNextRepeat).not.toHaveBeenCalled();
  });
});

describe('failure compensation', () => {
  const request: ScheduledPostWorkflowInput = {
    approvalId: 'approval-1',
    operationId: 'operation-1',
    organizationId: 'org-1',
    postId: 'post-1',
    source: 'scheduled_sweep',
    userId: 'user-1',
    versionPinId: 'pin-1',
  };

  function fail(registeredActions: Map<string, RegisteredAction>) {
    const action = registeredActions.get(SCHEDULED_POST_ACTION_IDS.FAIL);
    if (!action) {
      throw new Error('Scheduled post fail action was not registered');
    }
    return action({ input: { request } });
  }

  function eligiblePost(approval: { id: string; status: string }) {
    return {
      id: 'post-1',
      organizationId: 'org-1',
      publishApproval: approval,
      targetExecutionState: TargetExecutionState.PUBLISHING,
    };
  }

  it('fails the post when the failed run still owns its approval', async () => {
    const h = createHarness();
    const post = eligiblePost({
      id: 'approval-1',
      status: PublishApprovalStatus.EXECUTING,
    });
    h.discoveryService.findEligiblePost.mockResolvedValue(post);

    await fail(h.registeredActions);

    expect(h.deliveryService.failTerminalValidation).toHaveBeenCalledWith(
      post,
      expect.any(Error),
    );
  });

  it('fails the owned post from the last resort when the failure graph also failed (#6655)', async () => {
    const h = createHarness();
    const post = eligiblePost({
      id: 'approval-1',
      status: PublishApprovalStatus.EXECUTING,
    });
    h.discoveryService.findEligiblePost.mockResolvedValue(post);

    await h.terminalFailures.get('scheduled-post.publish')?.({
      inputValues: { request },
      organizationId: 'org-1',
      workflowError: 'Action contract input validation failed',
    });

    expect(h.deliveryService.failTerminalValidation).toHaveBeenCalledWith(
      post,
      new Error('Action contract input validation failed'),
    );
    await expect(
      h.terminalFailures.get('scheduled-post.publish')?.({
        inputValues: { request },
        organizationId: 'org-2',
        workflowError: 'failed',
      }),
    ).rejects.toThrow('does not belong to its tenant');
  });

  it('leaves the post alone when Publish Now superseded the failed run', async () => {
    const h = createHarness();
    h.discoveryService.findEligiblePost.mockResolvedValue(
      eligiblePost({
        id: 'approval-2',
        status: PublishApprovalStatus.PUBLISHED,
      }),
    );

    const result = await fail(h.registeredActions);

    expect(result).toEqual({ reason: 'not_eligible', skipped: true });
    expect(h.deliveryService.failTerminalValidation).not.toHaveBeenCalled();
  });

  it('leaves the post alone when its approval already published', async () => {
    const h = createHarness();
    h.discoveryService.findEligiblePost.mockResolvedValue(
      eligiblePost({
        id: 'approval-1',
        status: PublishApprovalStatus.PUBLISHED,
      }),
    );

    const result = await fail(h.registeredActions);

    expect(result).toEqual({ reason: 'not_eligible', skipped: true });
    expect(h.deliveryService.failTerminalValidation).not.toHaveBeenCalled();
  });
});

describe('claim', () => {
  const request: ScheduledPostWorkflowInput = {
    approvalId: 'approval-1',
    operationId: 'operation-1',
    organizationId: 'org-1',
    postId: 'post-1',
    source: 'publish_now',
    userId: 'user-1',
    versionPinId: 'pin-1',
  };

  function claim(registeredActions: Map<string, RegisteredAction>) {
    const action = registeredActions.get(SCHEDULED_POST_ACTION_IDS.CLAIM);
    if (!action) {
      throw new Error('Scheduled post claim action was not registered');
    }
    return action({
      input: { request },
      provenance: { executionId: 'execution-7' },
    });
  }

  function claimablePost(h: ReturnType<typeof createHarness>) {
    h.discoveryService.findEligiblePost.mockResolvedValue({
      id: 'post-1',
      organizationId: 'org-1',
      publishApproval: {
        id: 'approval-1',
        status: PublishApprovalStatus.QUEUED,
      },
    });
  }

  it('links the post to the claiming execution so delivery can persist PUBLISHED', async () => {
    const h = createHarness();
    claimablePost(h);

    await claim(h.registeredActions);

    expect(h.prisma.post.updateMany).toHaveBeenCalledWith({
      data: { workflowExecutionId: 'execution-7' },
      where: { id: 'post-1', isDeleted: false, organizationId: 'org-1' },
    });
  });

  it('does not relink a post whose approval already published', async () => {
    const h = createHarness();
    claimablePost(h);
    h.publishApprovalsService.claimForExecution.mockResolvedValue({
      executionStartedAt: null,
      isAlreadyPublished: true,
    });

    await claim(h.registeredActions);

    expect(h.prisma.post.updateMany).not.toHaveBeenCalled();
  });
});

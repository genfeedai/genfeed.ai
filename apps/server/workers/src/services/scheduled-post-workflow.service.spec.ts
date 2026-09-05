import {
  SCHEDULED_POST_ACTION_IDS,
  type ScheduledPostWorkflowInput,
} from '@api/collections/posts/services/scheduled-post-workflow-definition';
import { TargetExecutionState } from '@genfeedai/contracts';
import { PostRepeatSchedulerService } from '@workers/services/post-repeat-scheduler.service';
import { ScheduledPostWorkflowService } from '@workers/services/scheduled-post-workflow.service';

type RegisteredActionRequest = {
  input: Record<string, unknown>;
};

type RegisteredAction = (request: RegisteredActionRequest) => Promise<unknown>;

function createHarness() {
  const registeredActions = new Map<string, RegisteredAction>();
  const activitiesService = {
    create: vi.fn().mockResolvedValue(undefined),
    findOne: vi.fn().mockResolvedValue(null),
  };
  const discoveryService = {
    findPost: vi.fn().mockResolvedValue({
      brandId: 'brand-1',
      id: 'post-1',
      organizationId: 'org-1',
      userId: 'user-1',
    }),
  };
  const publishApprovalsService = {
    completeExecution: vi.fn().mockResolvedValue(undefined),
  };
  const prisma = {
    postPublishFinalization: {
      findUnique: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const repeatScheduler = {
    scheduleNextRepeat: vi.fn().mockResolvedValue(undefined),
  };
  const runner = {
    registerAction: vi.fn((actionId: string, action: RegisteredAction) => {
      registeredActions.set(actionId, action);
    }),
    registerWorkflow: vi.fn(),
  };
  const service = new ScheduledPostWorkflowService(
    activitiesService as never,
    {} as never,
    discoveryService as never,
    {} as never,
    {} as never,
    publishApprovalsService as never,
    prisma as never,
    repeatScheduler as never,
    runner as never,
  );
  service.onModuleInit();

  return {
    activitiesService,
    prisma,
    publishApprovalsService,
    registeredActions,
    repeatScheduler,
    service,
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
    expect(harness.activitiesService.create).not.toHaveBeenCalled();
    expect(harness.repeatScheduler.scheduleNextRepeat).not.toHaveBeenCalled();
  });

  it('announces and repeats a successful public publish', async () => {
    const harness = createHarness();

    await finalize(harness.registeredActions, TargetExecutionState.PUBLISHED);

    expect(harness.activitiesService.create).toHaveBeenCalledOnce();
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

    expect(harness.activitiesService.create).not.toHaveBeenCalled();
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

    expect(harness.activitiesService.create).toHaveBeenCalledWith(
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

    expect(harness.activitiesService.create).not.toHaveBeenCalled();
    expect(
      harness.prisma.postPublishFinalization.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ attempts: { increment: 1 } }),
      }),
    );
  });
});

import {
  PostCategory,
  PostFrequency,
  ReleaseStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { ReleaseRecurrenceMaterializerService } from '@workers/services/release-recurrence-materializer.service';

describe('ReleaseRecurrenceMaterializerService', () => {
  const sourceGroup = {
    attachments: [{ body: 'First comment', kind: 'comment' }],
    baseContent: 'Evergreen release',
    brandId: 'brand-1',
    id: 'release-1',
    media: [{ assetId: 'asset-1' }],
    organizationId: 'org-1',
    ownerId: 'user-1',
    recurrence: {
      frequency: PostFrequency.DAILY,
      interval: 1,
      maxRepeats: 2,
    },
    scheduledAt: new Date('2026-07-20T09:00:00.000Z'),
    status: ReleaseStatus.PUBLISHED,
    timezone: 'UTC',
    title: 'Evergreen release',
  };
  const sourceTarget = {
    agentContextSource: 'explicit',
    agentContextVersion: 2,
    workflowExecutionId: 'agent-run-1',
    agentStrategyId: 'strategy-1',
    agentThreadId: 'thread-1',
    brandId: 'brand-1',
    category: PostCategory.TEXT,
    children: [
      {
        agentContextSource: 'explicit',
        agentContextVersion: 2,
        workflowExecutionId: 'agent-run-1',
        agentStrategyId: 'strategy-1',
        agentThreadId: 'thread-1',
        brandId: 'brand-1',
        category: PostCategory.TEXT,
        credentialId: 'credential-1',
        description: 'First comment',
        id: 'child-1',
        ingredients: [{ id: 'asset-2' }],
        label: 'Comment',
        order: 0,
        organizationId: 'org-1',
        originalPostId: null,
        platform: 'twitter',
        scheduledDate: new Date('2026-07-20T09:20:00.000Z'),
        source: 'agent',
        sourceActionId: 'action-1',
        sourceWorkflowId: 'workflow-source',
        sourceWorkflowName: 'Source workflow',
        timezone: 'UTC',
        userId: 'user-1',
      },
    ],
    credentialId: 'credential-1',
    description: 'Evergreen release',
    id: 'target-1',
    ingredients: [{ id: 'asset-1' }],
    label: 'Evergreen release',
    order: 0,
    organizationId: 'org-1',
    originalPostId: null,
    platform: 'twitter',
    scheduledDate: new Date('2026-07-20T09:15:00.000Z'),
    source: 'agent',
    sourceActionId: 'action-1',
    sourceWorkflowId: 'workflow-source',
    sourceWorkflowName: 'Source workflow',
    targetAttachments: [],
    targetExecutionState: TargetExecutionState.PUBLISHED,
    targetReadiness: { state: 'ready' },
    targetSettings: { audience: 'public' },
    targetValidationIssues: [],
    targetValidationState: 'valid',
    timezone: 'UTC',
    userId: 'user-1',
  };

  function createHarness(overrides?: {
    approvalError?: Error;
    recurrence?: Record<string, unknown>;
    transactionFailures?: unknown[];
  }) {
    const postGroup = {
      create: vi.fn().mockResolvedValue({ id: 'release-2' }),
      findFirst: vi
        .fn()
        .mockResolvedValueOnce({
          ...sourceGroup,
          recurrence: overrides?.recurrence ?? sourceGroup.recurrence,
        })
        .mockResolvedValueOnce(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const post = {
      create: vi
        .fn()
        .mockResolvedValueOnce({ id: 'target-2' })
        .mockResolvedValueOnce({ id: 'child-2' }),
      findMany: vi.fn().mockResolvedValue([sourceTarget]),
    };
    const transaction = vi.fn(async (callback) =>
      callback({ post, postGroup }),
    );
    for (const failure of overrides?.transactionFailures ?? []) {
      transaction.mockRejectedValueOnce(failure);
    }
    const prisma = {
      $transaction: transaction,
      post: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { targetExecutionState: TargetExecutionState.PUBLISHED },
          ]),
      },
      postGroup: {
        findFirst: vi.fn(),
      },
    };
    const logger = {
      warn: vi.fn(),
    };
    const publishApprovalsService = {
      createForCurrentPost: overrides?.approvalError
        ? vi.fn().mockRejectedValue(overrides.approvalError)
        : vi.fn().mockResolvedValue({ id: 'approval-1' }),
    };
    const service = new ReleaseRecurrenceMaterializerService(
      prisma as never,
      logger as never,
      publishApprovalsService as never,
    );

    return {
      logger,
      post,
      postGroup,
      prisma,
      publishApprovalsService,
      service,
    };
  }

  it('materializes one deterministic occurrence with target and attachment lineage', async () => {
    const { post, postGroup, prisma, publishApprovalsService, service } =
      createHarness();

    const result = await service.materializeNext({
      groupId: 'release-1',
      organizationId: 'org-1',
      workflowExecutionId: 'execution-2',
    });

    expect(result).toEqual({
      occurrenceId: 'release-2',
      status: 'created',
    });
    expect(postGroup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attachments: sourceGroup.attachments,
        brandId: 'brand-1',
        idempotencyKey: 'system:evergreen-release:release-1:1',
        media: sourceGroup.media,
        organizationId: 'org-1',
        ownerId: 'user-1',
        recurrence: expect.objectContaining({
          parentReleaseId: 'release-1',
          repeatCount: 1,
        }),
        scheduledAt: new Date('2026-07-21T09:00:00.000Z'),
        status: ReleaseStatus.SCHEDULED,
        timezone: 'UTC',
      }),
    });
    expect(post.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          groupId: 'release-2',
          originalPostId: 'target-1',
          organizationId: 'org-1',
          scheduledDate: new Date('2026-07-21T09:15:00.000Z'),
          targetSettings: sourceTarget.targetSettings,
          targetIdempotencyKey: 'system:evergreen-target:release-1:1:target-1',
          workflowExecutionId: 'execution-2',
        }),
      }),
    );
    expect(post.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          groupId: 'release-2',
          originalPostId: 'child-1',
          organizationId: 'org-1',
          parentId: 'target-2',
          scheduledDate: new Date('2026-07-21T09:20:00.000Z'),
        }),
      }),
    );
    expect(publishApprovalsService.createForCurrentPost).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'user-1',
        organizationId: 'org-1',
        postId: 'target-2',
        transaction: expect.any(Object),
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('reuses a deterministic occurrence on worker redelivery', async () => {
    const { post, postGroup, publishApprovalsService, service } =
      createHarness();
    postGroup.findFirst
      .mockReset()
      .mockResolvedValueOnce(sourceGroup)
      .mockResolvedValueOnce({ id: 'release-existing' });

    const result = await service.materializeNext({
      groupId: 'release-1',
      organizationId: 'org-1',
      workflowExecutionId: 'execution-retry',
    });

    expect(result).toEqual({
      occurrenceId: 'release-existing',
      status: 'reused',
    });
    expect(postGroup.create).not.toHaveBeenCalled();
    expect(post.create).not.toHaveBeenCalled();
    expect(publishApprovalsService.createForCurrentPost).not.toHaveBeenCalled();
  });

  it('records exhaustion without creating another occurrence', async () => {
    const { post, postGroup, service } = createHarness({
      recurrence: {
        frequency: PostFrequency.DAILY,
        interval: 1,
        maxRepeats: 1,
        parentReleaseId: 'release-1',
        repeatCount: 1,
      },
    });

    const result = await service.materializeNext({
      groupId: 'release-current',
      organizationId: 'org-1',
      workflowExecutionId: 'execution-3',
    });

    expect(result).toEqual({ status: 'exhausted' });
    expect(postGroup.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          recurrence: expect.objectContaining({
            isExhausted: true,
            nextRunAt: null,
            repeatCount: 1,
          }),
        },
        where: expect.objectContaining({
          organizationId: 'org-1',
        }),
      }),
    );
    expect(postGroup.create).not.toHaveBeenCalled();
    expect(post.create).not.toHaveBeenCalled();
  });

  it('records exhaustion when the recurrence end date has passed', async () => {
    const { post, postGroup, service } = createHarness({
      recurrence: {
        endDate: '2026-07-20T09:00:00.000Z',
        frequency: PostFrequency.DAILY,
        interval: 1,
      },
    });

    await expect(
      service.materializeNext({
        groupId: 'release-1',
        organizationId: 'org-1',
        workflowExecutionId: 'execution-end-date',
      }),
    ).resolves.toEqual({ status: 'exhausted' });
    expect(postGroup.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          recurrence: expect.objectContaining({
            isExhausted: true,
            nextRunAt: null,
          }),
        },
      }),
    );
    expect(postGroup.create).not.toHaveBeenCalled();
    expect(post.create).not.toHaveBeenCalled();
  });

  it('retries serializable conflicts before materializing', async () => {
    const { logger, prisma, service } = createHarness({
      transactionFailures: [{ code: 'P2034' }],
    });

    await service.materializeNext({
      groupId: 'release-1',
      organizationId: 'org-1',
      workflowExecutionId: 'execution-4',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('retrying concurrent expansion'),
      expect.objectContaining({ attempt: 1, groupId: 'release-1' }),
    );
  });

  it('keeps occurrence, target, child, and approval creation in one transaction', async () => {
    const { service } = createHarness({
      approvalError: new Error('approval persistence failed'),
    });

    await expect(
      service.materializeNext({
        groupId: 'release-1',
        organizationId: 'org-1',
        workflowExecutionId: 'execution-5',
      }),
    ).rejects.toThrow('approval persistence failed');
  });

  it('does not materialize when the recurrence is paused after preflight', async () => {
    const { post, postGroup, prisma, publishApprovalsService, service } =
      createHarness({
        recurrence: { ...sourceGroup.recurrence, isPaused: true },
      });
    prisma.postGroup.findFirst.mockResolvedValue({
      recurrence: sourceGroup.recurrence,
    });

    await expect(
      service.shouldMaterialize({
        groupId: 'release-1',
        organizationId: 'org-1',
      }),
    ).resolves.toBe(true);
    await expect(
      service.materializeNext({
        groupId: 'release-1',
        organizationId: 'org-1',
        workflowExecutionId: 'execution-paused-after-preflight',
      }),
    ).resolves.toEqual({ status: 'not_applicable' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(postGroup.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'release-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(post.findMany).toHaveBeenCalledTimes(1);
    expect(postGroup.create).not.toHaveBeenCalled();
    expect(post.create).not.toHaveBeenCalled();
    expect(postGroup.updateMany).not.toHaveBeenCalled();
    expect(publishApprovalsService.createForCurrentPost).not.toHaveBeenCalled();
  });

  it('checks terminal recurrence state with tenant and soft-delete guards', async () => {
    const { prisma, service } = createHarness();
    prisma.postGroup.findFirst.mockResolvedValue({
      recurrence: sourceGroup.recurrence,
    });

    await expect(
      service.shouldMaterialize({
        groupId: 'release-1',
        organizationId: 'org-1',
      }),
    ).resolves.toBe(true);
    expect(prisma.postGroup.findFirst).toHaveBeenCalledWith({
      select: { recurrence: true },
      where: {
        id: 'release-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });

    prisma.postGroup.findFirst.mockResolvedValue({
      recurrence: { ...sourceGroup.recurrence, isExhausted: true },
    });
    await expect(
      service.shouldMaterialize({
        groupId: 'release-1',
        organizationId: 'org-1',
      }),
    ).resolves.toBe(false);

    prisma.postGroup.findFirst.mockResolvedValue({
      recurrence: { ...sourceGroup.recurrence, isPaused: true },
    });
    await expect(
      service.shouldMaterialize({
        groupId: 'release-1',
        organizationId: 'org-1',
      }),
    ).resolves.toBe(false);

    prisma.postGroup.findFirst.mockResolvedValue(null);
    await expect(
      service.shouldMaterialize({
        groupId: 'release-missing',
        organizationId: 'org-1',
      }),
    ).resolves.toBe(false);
  });
});

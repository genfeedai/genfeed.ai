import { ActivitiesService } from '@server/collections/activities/services/activities.service';
import { PostsService } from '@server/collections/posts/services/posts.service';
import {
  ActivityKey,
  CredentialPlatform,
  PostStatus,
  TargetExecutionState,
} from '@genfeedai/enums';
import {
  AgentArtifactReferenceService,
  AgentScopeContextService,
  PostPublishQueueService,
  PublishApprovalsService,
} from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronPostsService } from '@workers/crons/posts/cron.posts.service';
import { PostRepeatSchedulerService } from '@workers/services/post-repeat-scheduler.service';
import { ScheduledPostDeliveryService } from '@workers/services/scheduled-post-delivery.service';
import { ScheduledPostExecutionGuardService } from '@workers/services/scheduled-post-execution-guard.service';
import { ScheduledPostQueueService } from '@workers/services/scheduled-post-queue.service';

const APPROVAL_JOB_IDENTITY = {
  approvalId: 'approval-1',
  operationId: 'operation-1',
  versionPinId: 'pin-1',
} as const;

const SUCCESSFUL_DELIVERY = {
  executionState: TargetExecutionState.PUBLISHED,
  externalId: 'tweet-1',
  platform: CredentialPlatform.TWITTER,
  success: true,
  url: 'https://x.com/example/status/tweet-1',
} as const;

describe('CronPostsService', () => {
  let service: CronPostsService;
  let activitiesService: { create: ReturnType<typeof vi.fn> };
  let postsService: vi.Mocked<PostsService>;
  let postPublishQueueService: { enqueue: ReturnType<typeof vi.fn> };
  let loggerService: vi.Mocked<LoggerService>;
  let agentScopeContextService: {
    assertConsequentialBoundary: ReturnType<typeof vi.fn>;
    assertResourceBrand: ReturnType<typeof vi.fn>;
  };
  let agentArtifactReferenceService: {
    assertVersionPinCurrent: ReturnType<typeof vi.fn>;
  };
  let publishApprovalsService: {
    claimForExecution: ReturnType<typeof vi.fn>;
    completeExecution: ReturnType<typeof vi.fn>;
    markEnqueueFailed: ReturnType<typeof vi.fn>;
    markQueued: ReturnType<typeof vi.fn>;
  };
  let postRepeatSchedulerService: {
    materializeRecurrence: ReturnType<typeof vi.fn>;
    scheduleNextRepeat: ReturnType<typeof vi.fn>;
  };
  let scheduledPostDeliveryService: {
    failTerminalValidation: ReturnType<typeof vi.fn>;
    publishSinglePost: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    activitiesService = {
      create: vi.fn().mockResolvedValue(undefined),
    };
    postPublishQueueService = {
      enqueue: vi.fn().mockResolvedValue('post-1'),
    };
    agentScopeContextService = {
      assertConsequentialBoundary: vi.fn().mockResolvedValue(undefined),
      assertResourceBrand: vi.fn(),
    };
    agentArtifactReferenceService = {
      assertVersionPinCurrent: vi.fn().mockResolvedValue({
        reference: {
          brandId: 'brand-1',
          kind: 'post',
          organizationId: 'org-1',
          recordId: 'post-1',
          serializer: 'post',
        },
      }),
    };
    publishApprovalsService = {
      claimForExecution: vi.fn().mockResolvedValue({
        executionStartedAt: '2026-07-07T09:56:00.000Z',
        isAlreadyPublished: false,
      }),
      completeExecution: vi.fn().mockResolvedValue(undefined),
      markEnqueueFailed: vi.fn().mockResolvedValue(undefined),
      markQueued: vi.fn().mockResolvedValue(undefined),
    };
    postRepeatSchedulerService = {
      materializeRecurrence: vi.fn().mockResolvedValue(undefined),
      scheduleNextRepeat: vi.fn().mockResolvedValue(undefined),
    };
    scheduledPostDeliveryService = {
      failTerminalValidation: vi.fn(async (_post: unknown, error: unknown) => ({
        error:
          error instanceof Error ? error.message : 'Publish validation failed',
        executionState: TargetExecutionState.FAILED,
        externalId: null,
        platform: '',
        success: false,
        url: '',
      })),
      publishSinglePost: vi.fn().mockResolvedValue({ ...SUCCESSFUL_DELIVERY }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronPostsService,
        ScheduledPostExecutionGuardService,
        ScheduledPostQueueService,
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: ActivitiesService,
          useValue: activitiesService,
        },
        {
          provide: AgentArtifactReferenceService,
          useValue: agentArtifactReferenceService,
        },
        {
          provide: AgentScopeContextService,
          useValue: agentScopeContextService,
        },
        {
          provide: PostsService,
          useValue: {
            create: vi.fn(),
            findAll: vi.fn().mockResolvedValue({ docs: [] }),
            patch: vi.fn(),
          },
        },
        {
          provide: PostPublishQueueService,
          useValue: postPublishQueueService,
        },
        {
          provide: PublishApprovalsService,
          useValue: publishApprovalsService,
        },
        {
          provide: PostRepeatSchedulerService,
          useValue: postRepeatSchedulerService,
        },
        {
          provide: ScheduledPostDeliveryService,
          useValue: scheduledPostDeliveryService,
        },
      ],
    }).compile();

    service = module.get<CronPostsService>(CronPostsService);
    postsService = module.get(PostsService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('publishScheduledPosts should no-op when no posts are due', async () => {
    await service.publishScheduledPosts();

    expect(postsService.findAll).toHaveBeenCalled();
    expect(loggerService.log).toHaveBeenCalledWith(
      expect.stringContaining('no posts to process'),
    );
    expect(postPublishQueueService.enqueue).not.toHaveBeenCalled();
  });

  it('publishScheduledPosts queues due posts instead of publishing inline', async () => {
    const post = {
      brand: 'brand-1',
      children: [],
      credential: 'cred-1',
      id: 'post-1',
      ingredients: [],
      organization: 'org-1',
      platform: CredentialPlatform.TWITTER,
      scheduledDate: new Date('2026-07-07T09:55:00.000Z'),
      status: PostStatus.SCHEDULED,
      user: 'user-1',
    };
    postsService.findAll.mockResolvedValueOnce({
      docs: [post],
      total: 1,
    } as never);

    await service.publishScheduledPosts();

    expect(postPublishQueueService.enqueue).toHaveBeenCalledWith({
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
    });
    expect(
      scheduledPostDeliveryService.publishSinglePost,
    ).not.toHaveBeenCalled();
  });

  it('fails closed before provider execution when a queued job has no explicit approval identity', async () => {
    postsService.findAll.mockResolvedValueOnce({
      docs: [
        {
          brandId: 'brand-1',
          credentialId: 'cred-1',
          id: 'post-1',
          organizationId: 'org-1',
          status: PostStatus.SCHEDULED,
        },
      ],
      total: 1,
    } as never);

    const result = await service.processQueuedPost({
      enqueuedAt: '2026-07-07T10:00:00.000Z',
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
    });

    expect(result).toEqual(
      expect.objectContaining({
        error: expect.stringContaining('version-bound approval identity'),
        success: false,
      }),
    );
    expect(publishApprovalsService.claimForExecution).not.toHaveBeenCalled();
    expect(
      scheduledPostDeliveryService.publishSinglePost,
    ).not.toHaveBeenCalled();
    expect(
      scheduledPostDeliveryService.failTerminalValidation,
    ).toHaveBeenCalled();
  });

  it('queues the durable review version pin with a scheduled post', async () => {
    postsService.findAll.mockResolvedValueOnce({
      docs: [
        {
          brand: 'brand-1',
          id: 'post-1',
          organization: 'org-1',
          reviewVersionPinId: 'pin-1',
        },
      ],
      total: 1,
    } as never);

    await service.publishScheduledPosts();

    expect(postPublishQueueService.enqueue).toHaveBeenCalledWith({
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
      versionPinId: 'pin-1',
    });
  });

  it('carries the canonical schedule approval identity into the worker queue contract', async () => {
    postsService.findAll.mockResolvedValueOnce({
      docs: [
        {
          brandId: 'brand-1',
          id: 'post-1',
          organizationId: 'org-1',
          publishApproval: {
            artifactVersionPinId: 'pin-1',
            id: 'approval-1',
            operationId: 'operation-1',
          },
        },
      ],
      total: 1,
    } as never);

    await service.publishScheduledPosts();

    expect(publishApprovalsService.markQueued).toHaveBeenCalledWith(
      'approval-1',
      'org-1',
    );
    expect(postPublishQueueService.enqueue).toHaveBeenCalledWith({
      approvalId: 'approval-1',
      operationId: 'operation-1',
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
      versionPinId: 'pin-1',
    });
  });

  it('validates a queued pin against the same canonical Post before publishing', async () => {
    const post = {
      brandId: 'brand-1',
      children: [],
      credentialId: 'cred-1',
      id: 'post-1',
      ingredients: [],
      organizationId: 'org-1',
      reviewVersionPinId: 'pin-1',
      scheduledDate: new Date('2026-07-07T09:55:00.000Z'),
      status: PostStatus.SCHEDULED,
      userId: 'user-1',
    };
    postsService.findAll.mockResolvedValueOnce({
      docs: [post],
      total: 1,
    } as never);

    await service.processQueuedPost({
      ...APPROVAL_JOB_IDENTITY,
      enqueuedAt: '2026-07-07T10:00:00.000Z',
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
      versionPinId: 'pin-1',
    });

    expect(
      agentArtifactReferenceService.assertVersionPinCurrent,
    ).toHaveBeenCalledWith({
      pinId: 'pin-1',
      readContext: {
        brandId: 'brand-1',
        organizationId: 'org-1',
      },
    });
    expect(
      agentArtifactReferenceService.assertVersionPinCurrent.mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      scheduledPostDeliveryService.publishSinglePost.mock
        .invocationCallOrder[0] ?? 0,
    );
  });

  it('fails closed on a stale version pin before PROCESSING or provider side effects', async () => {
    const post = {
      brandId: 'brand-1',
      children: [],
      credentialId: 'cred-1',
      id: 'post-1',
      ingredients: [],
      organizationId: 'org-1',
      reviewVersionPinId: 'pin-1',
      scheduledDate: new Date('2026-07-07T09:55:00.000Z'),
      status: PostStatus.SCHEDULED,
      userId: 'user-1',
    };
    postsService.findAll.mockResolvedValueOnce({
      docs: [post],
      total: 1,
    } as never);
    agentArtifactReferenceService.assertVersionPinCurrent.mockRejectedValue(
      new Error('Canonical Post digest no longer matches pin.'),
    );

    const result = await service.processQueuedPost({
      ...APPROVAL_JOB_IDENTITY,
      enqueuedAt: '2026-07-07T10:00:00.000Z',
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
      versionPinId: 'pin-1',
    });

    expect(result).toEqual(
      expect.objectContaining({
        error: 'Canonical Post digest no longer matches pin.',
        success: false,
      }),
    );
    expect(
      scheduledPostDeliveryService.publishSinglePost,
    ).not.toHaveBeenCalled();
    expect(
      scheduledPostDeliveryService.failTerminalValidation,
    ).toHaveBeenCalledWith(
      post,
      expect.objectContaining({
        message: 'Canonical Post digest no longer matches pin.',
      }),
    );
    expect(publishApprovalsService.completeExecution).toHaveBeenCalledWith({
      approvalId: 'approval-1',
      error: 'Canonical Post digest no longer matches pin.',
      executionStartedAt: '2026-07-07T09:56:00.000Z',
      isSuccessful: false,
      operationId: 'operation-1',
      organizationId: 'org-1',
      versionPinId: 'pin-1',
    });
  });

  it('rejects a queued pin when the durable Post pin was removed', async () => {
    const post = {
      brandId: 'brand-1',
      children: [],
      credentialId: 'cred-1',
      id: 'post-1',
      ingredients: [],
      organizationId: 'org-1',
      scheduledDate: new Date('2026-07-07T09:55:00.000Z'),
      status: PostStatus.SCHEDULED,
      userId: 'user-1',
    };
    postsService.findAll.mockResolvedValueOnce({
      docs: [post],
      total: 1,
    } as never);

    const result = await service.processQueuedPost({
      ...APPROVAL_JOB_IDENTITY,
      enqueuedAt: '2026-07-07T10:00:00.000Z',
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
      versionPinId: 'pin-1',
    });

    expect(result).toEqual(
      expect.objectContaining({
        error: expect.stringContaining('has no durable review pin'),
        success: false,
      }),
    );
    expect(
      agentArtifactReferenceService.assertVersionPinCurrent,
    ).not.toHaveBeenCalled();
    expect(
      scheduledPostDeliveryService.publishSinglePost,
    ).not.toHaveBeenCalled();
  });

  it('claims the bound approval immediately before provider execution', async () => {
    const post = {
      brandId: 'brand-1',
      children: [],
      credentialId: 'cred-1',
      id: 'post-1',
      ingredients: [],
      organizationId: 'org-1',
      publishApprovalId: 'approval-1',
      reviewVersionPinId: 'pin-1',
      scheduledDate: new Date('2026-07-07T09:55:00.000Z'),
      status: PostStatus.SCHEDULED,
      userId: 'user-1',
    };
    postsService.findAll.mockResolvedValueOnce({
      docs: [post],
      total: 1,
    } as never);

    await service.processQueuedPost({
      ...APPROVAL_JOB_IDENTITY,
      approvalId: 'approval-1',
      enqueuedAt: '2026-07-07T10:00:00.000Z',
      operationId: 'operation-1',
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
      versionPinId: 'pin-1',
    });

    expect(publishApprovalsService.claimForExecution).toHaveBeenCalledWith({
      approvalId: 'approval-1',
      operationId: 'operation-1',
      organizationId: 'org-1',
      postId: 'post-1',
      versionPinId: 'pin-1',
    });
    expect(
      publishApprovalsService.claimForExecution.mock.invocationCallOrder[0],
    ).toBeLessThan(
      scheduledPostDeliveryService.publishSinglePost.mock
        .invocationCallOrder[0] ?? 0,
    );
  });

  it('blocks provider execution when approval revalidation fails', async () => {
    postsService.findAll.mockResolvedValueOnce({
      docs: [
        {
          brandId: 'brand-1',
          children: [],
          credentialId: 'cred-1',
          id: 'post-1',
          ingredients: [],
          organizationId: 'org-1',
          publishApprovalId: 'approval-1',
          reviewVersionPinId: 'pin-1',
          scheduledDate: new Date('2026-07-07T09:55:00.000Z'),
          status: PostStatus.SCHEDULED,
          userId: 'user-1',
        },
      ],
      total: 1,
    } as never);
    publishApprovalsService.claimForExecution.mockRejectedValue(
      new Error('Publish approval scope no longer matches.'),
    );

    const result = await service.processQueuedPost({
      ...APPROVAL_JOB_IDENTITY,
      approvalId: 'approval-1',
      enqueuedAt: '2026-07-07T10:00:00.000Z',
      operationId: 'operation-1',
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
      versionPinId: 'pin-1',
    });

    expect(result).toEqual(
      expect.objectContaining({
        error: 'Publish approval scope no longer matches.',
        success: false,
      }),
    );
    expect(
      scheduledPostDeliveryService.publishSinglePost,
    ).not.toHaveBeenCalled();
  });

  it('marks stale durable agent scope as a terminal publish failure', async () => {
    const post = {
      agentContextSource: 'explicit',
      agentContextVersion: 2,
      agentThreadId: 'thread-1',
      brand: 'brand-1',
      children: [],
      credential: 'cred-1',
      id: 'post-1',
      ingredients: [],
      organization: 'org-1',
      platform: CredentialPlatform.TWITTER,
      scheduledDate: new Date('2026-07-07T09:55:00.000Z'),
      status: PostStatus.SCHEDULED,
      user: 'user-1',
    };
    postsService.findAll.mockResolvedValueOnce({
      docs: [post],
      total: 1,
    } as never);
    agentScopeContextService.assertConsequentialBoundary.mockRejectedValue(
      new Error('Agent context is stale.'),
    );

    const result = await service.processQueuedPost({
      ...APPROVAL_JOB_IDENTITY,
      enqueuedAt: '2026-07-07T10:00:00.000Z',
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
    });

    expect(result).toEqual(
      expect.objectContaining({
        error: 'Agent context is stale.',
        executionState: TargetExecutionState.FAILED,
        success: false,
      }),
    );
    expect(
      scheduledPostDeliveryService.publishSinglePost,
    ).not.toHaveBeenCalled();
    expect(
      scheduledPostDeliveryService.failTerminalValidation,
    ).toHaveBeenCalledWith(
      post,
      expect.objectContaining({ message: 'Agent context is stale.' }),
    );
  });

  it('delegates provider delivery after a successful execution claim', async () => {
    const post = {
      brandId: 'brand-1',
      children: [],
      credentialId: 'cred-1',
      id: 'post-1',
      ingredients: [],
      organizationId: 'org-1',
      reviewVersionPinId: 'pin-1',
      scheduledDate: new Date('2026-07-07T09:55:00.000Z'),
      status: PostStatus.SCHEDULED,
      userId: 'user-1',
    };
    postsService.findAll.mockResolvedValueOnce({
      docs: [post],
      total: 1,
    } as never);

    const result = await service.processQueuedPost({
      ...APPROVAL_JOB_IDENTITY,
      enqueuedAt: '2026-07-07T09:55:00.000Z',
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
    });

    expect(scheduledPostDeliveryService.publishSinglePost).toHaveBeenCalledWith(
      post,
      'scheduled_sweep',
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(publishApprovalsService.completeExecution).toHaveBeenCalledWith({
      approvalId: 'approval-1',
      executionStartedAt: '2026-07-07T09:56:00.000Z',
      isSuccessful: true,
      operationId: 'operation-1',
      organizationId: 'org-1',
      versionPinId: 'pin-1',
    });
    expect(activitiesService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        key: ActivityKey.POST_PUBLISHED,
      }),
    );
  });

  it('delegates recurring-post scheduling after a successful publish', async () => {
    const post = {
      brand: 'brand-1',
      children: [],
      credential: 'cred-1',
      id: 'post-1',
      ingredients: [],
      isRepeat: true,
      organization: 'org-1',
      platform: CredentialPlatform.TWITTER,
      repeatFrequency: 'daily',
      reviewVersionPinId: 'pin-1',
      scheduledDate: new Date('2026-07-07T09:55:00.000Z'),
      status: PostStatus.SCHEDULED,
      user: 'user-1',
    };
    postsService.findAll.mockResolvedValueOnce({
      docs: [post],
      total: 1,
    } as never);

    await service.processQueuedPost({
      ...APPROVAL_JOB_IDENTITY,
      enqueuedAt: '2026-07-07T09:55:00.000Z',
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
    });

    expect(postRepeatSchedulerService.scheduleNextRepeat).toHaveBeenCalledWith(
      post,
      expect.stringContaining('CronPostsService'),
    );
  });

  it('does not record a published activity or next repeat for a provider draft', async () => {
    scheduledPostDeliveryService.publishSinglePost.mockResolvedValueOnce({
      ...SUCCESSFUL_DELIVERY,
      isProviderDraft: true,
    });
    const post = {
      brandId: 'brand-1',
      children: [],
      credentialId: 'cred-1',
      id: 'post-1',
      organizationId: 'org-1',
      reviewVersionPinId: 'pin-1',
      scheduledDate: new Date('2026-07-07T09:55:00.000Z'),
      status: PostStatus.SCHEDULED,
      userId: 'user-1',
    };
    postsService.findAll.mockResolvedValueOnce({
      docs: [post],
      total: 1,
    } as never);

    await service.processQueuedPost({
      ...APPROVAL_JOB_IDENTITY,
      enqueuedAt: '2026-07-07T09:55:00.000Z',
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'publish_now',
    });

    expect(activitiesService.create).not.toHaveBeenCalled();
    expect(
      postRepeatSchedulerService.scheduleNextRepeat,
    ).not.toHaveBeenCalled();
  });

  it('rechecks grouped recurrence materialization after an already-published delivery', async () => {
    publishApprovalsService.claimForExecution.mockResolvedValueOnce({
      isAlreadyPublished: true,
    });
    const post = {
      groupId: 'release-1',
      id: 'post-1',
      organizationId: 'org-1',
      platform: CredentialPlatform.TWITTER,
      userId: 'user-1',
    };
    postsService.findAll.mockResolvedValueOnce({
      docs: [post],
      total: 1,
    } as never);

    const result = await service.processQueuedPost({
      ...APPROVAL_JOB_IDENTITY,
      enqueuedAt: '2026-07-07T09:55:00.000Z',
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
    });

    expect(result).toEqual(
      expect.objectContaining({
        executionState: TargetExecutionState.PUBLISHED,
        success: true,
      }),
    );
    expect(
      postRepeatSchedulerService.materializeRecurrence,
    ).toHaveBeenCalledWith(post);
    expect(
      scheduledPostDeliveryService.publishSinglePost,
    ).not.toHaveBeenCalled();
  });

  it('skips queued publish jobs that are no longer eligible', async () => {
    postsService.findAll.mockResolvedValueOnce({
      docs: [],
      total: 0,
    } as never);

    const result = await service.processQueuedPost({
      ...APPROVAL_JOB_IDENTITY,
      enqueuedAt: '2026-07-07T09:55:00.000Z',
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
    });

    expect(result).toEqual({ reason: 'not_eligible', skipped: true });
    expect(
      scheduledPostDeliveryService.publishSinglePost,
    ).not.toHaveBeenCalled();
  });
});

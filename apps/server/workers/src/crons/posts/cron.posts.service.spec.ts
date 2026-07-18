import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { SystemWorkflowProvenanceService } from '@api/collections/workflows/services/system-workflow-provenance.service';
import { PublisherFactoryService } from '@api/services/integrations/publishers/publisher-factory.service';
import { QuotaService } from '@api/services/quota/quota.service';
import { PublishEventWebhookService } from '@api/services/webhook-client/webhook-client.module';
import {
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
import { SchedulerPublishStateService } from '@workers/services/scheduler-publish-state.service';

const APPROVAL_JOB_IDENTITY = {
  approvalId: 'approval-1',
  operationId: 'operation-1',
  versionPinId: 'pin-1',
} as const;

describe('CronPostsService', () => {
  let service: CronPostsService;
  let activitiesService: { create: ReturnType<typeof vi.fn> };
  let credentialsService: { findOne: ReturnType<typeof vi.fn> };
  let postsService: vi.Mocked<PostsService>;
  let publisherFactory: { getPublisher: ReturnType<typeof vi.fn> };
  let postPublishQueueService: { enqueue: ReturnType<typeof vi.fn> };
  let publishEventWebhookService: {
    emitLegacyPostFailed: ReturnType<typeof vi.fn>;
    emitLegacyPostPublished: ReturnType<typeof vi.fn>;
  };
  let quotaService: { checkQuota: ReturnType<typeof vi.fn> };
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
    markQueued: ReturnType<typeof vi.fn>;
  };
  let schedulerPublishStateService: {
    transitionPost: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    activitiesService = {
      create: vi.fn().mockResolvedValue(undefined),
    };
    credentialsService = {
      findOne: vi.fn(),
    };
    publisherFactory = {
      getPublisher: vi.fn(),
    };
    postPublishQueueService = {
      enqueue: vi.fn().mockResolvedValue('post-1'),
    };
    publishEventWebhookService = {
      emitLegacyPostFailed: vi.fn().mockResolvedValue(undefined),
      emitLegacyPostPublished: vi.fn().mockResolvedValue(undefined),
    };
    quotaService = {
      checkQuota: vi.fn(),
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
      markQueued: vi.fn().mockResolvedValue(undefined),
    };
    schedulerPublishStateService = {
      transitionPost: vi.fn().mockResolvedValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronPostsService,
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
          provide: CredentialsService,
          useValue: credentialsService,
        },
        {
          provide: OrganizationsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue({ id: 'org-1' }),
          },
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
          provide: QuotaService,
          useValue: quotaService,
        },
        {
          provide: PublisherFactoryService,
          useValue: publisherFactory,
        },
        {
          provide: SystemWorkflowProvenanceService,
          useValue: {
            runAction: vi.fn(
              async (
                _input: unknown,
                action: (provenance: {
                  executionId: string;
                  workflowId: string;
                  workflowLabel: string;
                }) => Promise<unknown>,
              ) => {
                const provenance = {
                  executionId: 'execution-1',
                  workflowId: 'workflow-1',
                  workflowLabel: 'Scheduled Post Publishing',
                };
                return { provenance, result: await action(provenance) };
              },
            ),
          },
        },
        {
          provide: PublishEventWebhookService,
          useValue: publishEventWebhookService,
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
          provide: SchedulerPublishStateService,
          useValue: schedulerPublishStateService,
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
    expect(publisherFactory.getPublisher).not.toHaveBeenCalled();
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
    expect(publisherFactory.getPublisher).not.toHaveBeenCalled();
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
    credentialsService.findOne.mockResolvedValue(null);

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
    ).toBeLessThan(postsService.patch.mock.invocationCallOrder[0] ?? 0);
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
    expect(postsService.patch).not.toHaveBeenCalledWith(
      'post-1',
      expect.objectContaining({ status: PostStatus.PROCESSING }),
    );
    expect(credentialsService.findOne).not.toHaveBeenCalled();
    expect(publisherFactory.getPublisher).not.toHaveBeenCalled();
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
    expect(credentialsService.findOne).not.toHaveBeenCalled();
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
    credentialsService.findOne.mockResolvedValue(null);

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
    ).toBeLessThan(credentialsService.findOne.mock.invocationCallOrder[0] ?? 0);
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
    expect(credentialsService.findOne).not.toHaveBeenCalled();
    expect(publisherFactory.getPublisher).not.toHaveBeenCalled();
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
        status: PostStatus.FAILED,
        success: false,
      }),
    );
    expect(publisherFactory.getPublisher).not.toHaveBeenCalled();
    expect(postsService.patch).toHaveBeenCalledWith(
      'post-1',
      expect.objectContaining({
        lastAttemptAt: expect.any(Date),
        status: PostStatus.FAILED,
        targetExecutionState: 'failed',
        targetError: expect.objectContaining({
          code: 'publish_validation_failed',
          isRetryable: false,
          message: 'Agent context is stale.',
        }),
      }),
    );
    expect(
      publishEventWebhookService.emitLegacyPostFailed,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: 'Agent context is stale.',
        post,
      }),
    );
  });

  it('emits publish webhooks after a queued scheduled post publishes', async () => {
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
    credentialsService.findOne.mockResolvedValue({
      id: 'cred-1',
      platform: CredentialPlatform.TWITTER,
    });
    quotaService.checkQuota.mockResolvedValue({
      allowed: true,
      currentCount: 0,
      dailyLimit: 10,
    });
    publisherFactory.getPublisher.mockReturnValue({
      publish: vi.fn().mockResolvedValue({
        externalId: 'tweet-1',
        externalShortcode: 'tweet-short',
        platform: CredentialPlatform.TWITTER,
        status: PostStatus.PUBLIC,
        success: true,
        url: 'https://x.com/example/status/tweet-1',
      }),
      supportsThreads: false,
    });

    await service.processQueuedPost({
      ...APPROVAL_JOB_IDENTITY,
      enqueuedAt: '2026-07-07T09:55:00.000Z',
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
    });

    expect(
      publishEventWebhookService.emitLegacyPostPublished,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        externalProviderId: 'tweet-1',
        externalShortcode: 'tweet-short',
        platform: CredentialPlatform.TWITTER,
        post,
        url: 'https://x.com/example/status/tweet-1',
      }),
    );
    expect(publishApprovalsService.completeExecution).toHaveBeenCalledWith({
      approvalId: 'approval-1',
      executionStartedAt: '2026-07-07T09:56:00.000Z',
      isSuccessful: true,
      operationId: 'operation-1',
      organizationId: 'org-1',
      versionPinId: 'pin-1',
    });
  });

  it('persists a grouped provider success even when the provider omits its id', async () => {
    schedulerPublishStateService.transitionPost.mockResolvedValue(true);
    const post = {
      brandId: 'brand-1',
      children: [],
      credentialId: 'cred-1',
      groupId: 'group-1',
      id: 'post-1',
      ingredients: [],
      organizationId: 'org-1',
      platform: CredentialPlatform.TWITTER,
      scheduledDate: new Date('2026-07-07T09:55:00.000Z'),
      status: PostStatus.SCHEDULED,
      userId: 'user-1',
    };
    postsService.findAll.mockResolvedValueOnce({
      docs: [post],
      total: 1,
    } as never);
    credentialsService.findOne.mockResolvedValue({
      id: 'cred-1',
      platform: CredentialPlatform.TWITTER,
    });
    quotaService.checkQuota.mockResolvedValue({
      allowed: true,
      currentCount: 0,
      dailyLimit: 10,
    });
    publisherFactory.getPublisher.mockReturnValue({
      publish: vi.fn().mockResolvedValue({
        externalId: null,
        platform: CredentialPlatform.TWITTER,
        status: PostStatus.PUBLIC,
        success: true,
        url: '',
      }),
      supportsThreads: false,
    });

    await service.processQueuedPost({
      ...APPROVAL_JOB_IDENTITY,
      enqueuedAt: '2026-07-07T09:55:00.000Z',
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
    });

    expect(schedulerPublishStateService.transitionPost).toHaveBeenNthCalledWith(
      2,
      post,
      expect.objectContaining({
        executionState: TargetExecutionState.PUBLISHED,
        externalId: null,
        status: PostStatus.PUBLIC,
        workflowExecutionId: 'execution-1',
      }),
      undefined,
      {
        expectedWorkflowExecutionId: 'execution-1',
        priorExecutionStates: [TargetExecutionState.PUBLISHING],
      },
    );
    expect(loggerService.warn).toHaveBeenCalledWith(
      expect.stringContaining('provider returned no external id'),
      expect.objectContaining({ postId: 'post-1' }),
    );
  });

  it('records a retryable grouped provider failure as scheduled with structured error state', async () => {
    schedulerPublishStateService.transitionPost.mockResolvedValue(true);
    const post = {
      brandId: 'brand-1',
      children: [],
      credentialId: 'cred-1',
      groupId: 'group-1',
      id: 'post-1',
      ingredients: [],
      organizationId: 'org-1',
      platform: CredentialPlatform.TWITTER,
      retryCount: 0,
      scheduledDate: new Date('2026-07-07T09:55:00.000Z'),
      status: PostStatus.SCHEDULED,
      userId: 'user-1',
    };
    postsService.findAll.mockResolvedValueOnce({
      docs: [post],
      total: 1,
    } as never);
    credentialsService.findOne.mockResolvedValue({
      id: 'cred-1',
      platform: CredentialPlatform.TWITTER,
    });
    quotaService.checkQuota.mockResolvedValue({
      allowed: true,
      currentCount: 0,
      dailyLimit: 10,
    });
    publisherFactory.getPublisher.mockReturnValue({
      publish: vi.fn().mockResolvedValue({
        error: '429 rate limit',
        externalId: null,
        platform: CredentialPlatform.TWITTER,
        status: PostStatus.FAILED,
        success: false,
        url: '',
      }),
      supportsThreads: false,
    });

    const result = await service.processQueuedPost({
      ...APPROVAL_JOB_IDENTITY,
      enqueuedAt: '2026-07-07T09:55:00.000Z',
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
    });

    expect(result).toEqual(
      expect.objectContaining({ status: PostStatus.SCHEDULED, success: false }),
    );
    expect(schedulerPublishStateService.transitionPost).toHaveBeenNthCalledWith(
      2,
      post,
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'rate_limited',
          isRetryable: true,
        }),
        executionState: TargetExecutionState.SCHEDULED,
        retryCount: 1,
        status: PostStatus.SCHEDULED,
        workflowExecutionId: 'execution-1',
      }),
      '429 rate limit',
      {
        expectedWorkflowExecutionId: 'execution-1',
        priorExecutionStates: [TargetExecutionState.PUBLISHING],
      },
    );
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
    expect(publisherFactory.getPublisher).not.toHaveBeenCalled();
  });

  it('emits failure webhooks only after retries are exhausted', async () => {
    const post = {
      brand: 'brand-1',
      children: [],
      credential: 'cred-1',
      id: 'post-1',
      ingredients: [],
      organization: 'org-1',
      platform: CredentialPlatform.TWITTER,
      retryCount: 3,
      scheduledDate: new Date('2026-07-07T09:55:00.000Z'),
      status: PostStatus.SCHEDULED,
      user: 'user-1',
    };
    postsService.findAll.mockResolvedValueOnce({
      docs: [post],
      total: 1,
    } as never);
    credentialsService.findOne.mockResolvedValue({
      id: 'cred-1',
      platform: CredentialPlatform.TWITTER,
    });
    quotaService.checkQuota.mockResolvedValue({
      allowed: true,
      currentCount: 0,
      dailyLimit: 10,
    });
    publisherFactory.getPublisher.mockReturnValue({
      publish: vi.fn().mockResolvedValue({
        error: 'Provider validation failed',
        externalId: null,
        platform: CredentialPlatform.TWITTER,
        status: PostStatus.FAILED,
        success: false,
        url: '',
      }),
      supportsThreads: false,
    });

    await service.processQueuedPost({
      ...APPROVAL_JOB_IDENTITY,
      enqueuedAt: '2026-07-07T09:55:00.000Z',
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
    });

    expect(
      publishEventWebhookService.emitLegacyPostFailed,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: 'Provider validation failed',
        platform: CredentialPlatform.TWITTER,
        post,
      }),
    );
  });

  it('resolves credential via scalar FKs when relation aliases are undefined (regression #1622)', async () => {
    // Shaped the way findDueScheduledPosts actually returns rows: scalar FKs
    // are populated (Post model requires them), but the top-level relation
    // aliases (credential/organization/brand/user) are NOT included by the
    // findDueScheduledPosts query — only children.credential is included.
    // Pre-fix, publishSinglePost read post.credential/post.organization/etc
    // (the aliases) which are undefined here, so credentialsService.findOne
    // would be called with `{ _id: undefined }` and resolve to null.
    const post = {
      brandId: 'brand-scalar-1',
      children: [],
      credentialId: 'cred-scalar-1',
      id: 'post-1',
      ingredients: [],
      organizationId: 'org-scalar-1',
      platform: CredentialPlatform.GHOST,
      scheduledDate: new Date('2026-07-07T09:55:00.000Z'),
      status: PostStatus.SCHEDULED,
      userId: 'user-scalar-1',
      // Intentionally no `credential`, `organization`, `brand`, or `user`
      // alias fields set — mirrors the real findDueScheduledPosts payload.
    };

    postsService.findAll.mockResolvedValueOnce({
      docs: [post],
      total: 1,
    } as never);

    const ghostCredential = {
      id: 'cred-scalar-1',
      platform: CredentialPlatform.GHOST,
    };
    credentialsService.findOne.mockImplementation((query: { _id?: unknown }) =>
      query?._id === 'cred-scalar-1'
        ? Promise.resolve(ghostCredential)
        : Promise.resolve(null),
    );

    quotaService.checkQuota.mockResolvedValue({
      allowed: true,
      currentCount: 0,
      dailyLimit: 10,
    });
    publisherFactory.getPublisher.mockReturnValue({
      publish: vi.fn().mockResolvedValue({
        externalId: 'ghost-post-1',
        externalShortcode: null,
        platform: CredentialPlatform.GHOST,
        status: PostStatus.PUBLIC,
        success: true,
        url: 'https://example.ghost.io/ghost-post-1',
      }),
      supportsThreads: false,
    });

    const result = await service.processQueuedPost({
      ...APPROVAL_JOB_IDENTITY,
      enqueuedAt: '2026-07-07T09:55:00.000Z',
      organizationId: 'org-scalar-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
    });

    // The fix: credentialsService.findOne must be called with the scalar
    // credentialId, not the undefined `credential` alias.
    expect(credentialsService.findOne).toHaveBeenCalledWith({
      _id: 'cred-scalar-1',
    });

    // Post must NOT be marked FAILED with "Credential not found" — it
    // should proceed all the way through to a successful publish.
    expect(postsService.patch).not.toHaveBeenCalledWith(
      'post-1',
      expect.objectContaining({ status: PostStatus.FAILED }),
    );
    expect(
      publishEventWebhookService.emitLegacyPostFailed,
    ).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ success: true, externalId: 'ghost-post-1' }),
    );
  });
});

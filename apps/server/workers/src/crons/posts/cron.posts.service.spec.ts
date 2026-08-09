import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CredentialPublishingReadinessService } from '@api/collections/credentials/services/credential-publishing-readiness.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { SystemWorkflowProvenanceService } from '@api/collections/workflows/services/system-workflow-provenance.service';
import { BeehiivProviderError } from '@api/services/integrations/beehiiv/errors/beehiiv-provider.error';
import { WORKFLOW_APPROVED_SCHEDULE_SETTING } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { PublisherFactoryService } from '@api/services/integrations/publishers/publisher-factory.service';
import { QuotaService } from '@api/services/quota/quota.service';
import { PublishEventWebhookService } from '@api/services/webhook-client/webhook-client.module';
import {
  CredentialPlatform,
  PostStatus,
  TargetExecutionState,
} from '@genfeedai/enums';
import type { IPublishingProviderReadiness } from '@genfeedai/interfaces';
import {
  AgentArtifactReferenceService,
  AgentScopeContextService,
  PostPublishQueueService,
  PublishApprovalsService,
} from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronPostsService } from '@workers/crons/posts/cron.posts.service';
import { PostRepeatSchedulerService } from '@workers/services/post-repeat-scheduler.service';
import { ScheduledPostExecutionGuardService } from '@workers/services/scheduled-post-execution-guard.service';
import { ScheduledPostQueueService } from '@workers/services/scheduled-post-queue.service';
import { SchedulerPublishStateService } from '@workers/services/scheduler-publish-state.service';

const APPROVAL_JOB_IDENTITY = {
  approvalId: 'approval-1',
  operationId: 'operation-1',
  versionPinId: 'pin-1',
} as const;

/**
 * The consumer's default verdict. `quotaStatus` is deliberately `unknown`:
 * `resolveForCredentials` does not measure quota, which keeps the readiness
 * gate disjoint from the worker's own `quota_exceeded` branch.
 */
const PUBLISH_CAPABLE_READINESS: IPublishingProviderReadiness = {
  appReviewStatus: 'pass',
  callbackUrlStatus: 'pass',
  canSchedule: true,
  diagnostics: [],
  isRetryable: false,
  permissionScopeStatus: 'pass',
  providerKey: CredentialPlatform.TWITTER,
  quotaStatus: 'unknown',
  state: 'publish_capable',
  tokenFreshness: 'pass',
};

const BLOCKED_READINESS: IPublishingProviderReadiness = {
  ...PUBLISH_CAPABLE_READINESS,
  canSchedule: false,
  diagnostics: [
    {
      classification: 'expired_credential',
      code: 'credential_access_token_missing',
      isRetryable: false,
      message: 'The provider account has no usable access credential.',
      severity: 'error',
    },
  ],
  requiredAction: 'Reconnect the provider account before publishing.',
  state: 'blocked',
  tokenFreshness: 'fail',
};

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
    markEnqueueFailed: ReturnType<typeof vi.fn>;
    markQueued: ReturnType<typeof vi.fn>;
  };
  let schedulerPublishStateService: {
    transitionPost: ReturnType<typeof vi.fn>;
  };
  let postRepeatSchedulerService: {
    materializeRecurrence: ReturnType<typeof vi.fn>;
    scheduleNextRepeat: ReturnType<typeof vi.fn>;
  };
  let publishingReadinessService: {
    resolveForCredentials: ReturnType<typeof vi.fn>;
  };
  let prismaService: { credential: { findMany: ReturnType<typeof vi.fn> } };

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
      markEnqueueFailed: vi.fn().mockResolvedValue(undefined),
      markQueued: vi.fn().mockResolvedValue(undefined),
    };
    schedulerPublishStateService = {
      transitionPost: vi.fn().mockResolvedValue(true),
    };
    postRepeatSchedulerService = {
      materializeRecurrence: vi.fn().mockResolvedValue(undefined),
      scheduleNextRepeat: vi.fn().mockResolvedValue(undefined),
    };
    prismaService = { credential: { findMany: vi.fn() } };
    publishingReadinessService = {
      resolveForCredentials: vi.fn(
        async (
          _client: unknown,
          _organizationId: string,
          credentialIds: readonly string[],
        ) =>
          new Map(
            credentialIds.map((credentialId) => [
              credentialId,
              { ...PUBLISH_CAPABLE_READINESS, credentialId },
            ]),
          ),
      ),
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
          provide: CredentialsService,
          useValue: credentialsService,
        },
        {
          provide: CredentialPublishingReadinessService,
          useValue: publishingReadinessService,
        },
        {
          provide: PrismaService,
          useValue: prismaService,
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
        {
          provide: PostRepeatSchedulerService,
          useValue: postRepeatSchedulerService,
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
    ).toBeLessThan(
      schedulerPublishStateService.transitionPost.mock.invocationCallOrder[0] ??
        0,
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
    expect(schedulerPublishStateService.transitionPost).toHaveBeenCalledWith(
      post,
      expect.objectContaining({
        lastAttemptAt: expect.any(Date),
        status: PostStatus.FAILED,
        executionState: 'failed',
        error: expect.objectContaining({
          code: 'publish_validation_failed',
          isRetryable: false,
          message: 'Agent context is stale.',
        }),
      }),
      'Agent context is stale.',
      undefined,
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
    schedulerPublishStateService.transitionPost.mockResolvedValue(true);
    const post = {
      brand: 'brand-1',
      children: [],
      credential: 'cred-1',
      id: 'post-1',
      ingredients: [],
      organization: 'org-1',
      platform: CredentialPlatform.BEEHIIV,
      reviewVersionPinId: 'pin-1',
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
      platform: CredentialPlatform.BEEHIIV,
    });
    quotaService.checkQuota.mockResolvedValue({
      allowed: true,
      currentCount: 0,
      dailyLimit: 10,
    });
    const publish = vi.fn().mockResolvedValue({
      externalId: 'beehiiv-post-1',
      platform: CredentialPlatform.BEEHIIV,
      status: PostStatus.PUBLIC,
      success: true,
      url: 'https://app.beehiiv.com/posts/beehiiv-post-1/preview',
    });
    publisherFactory.getPublisher.mockReturnValue({
      publish,
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
        externalProviderId: 'beehiiv-post-1',
        platform: CredentialPlatform.BEEHIIV,
        post,
        url: 'https://app.beehiiv.com/posts/beehiiv-post-1/preview',
      }),
    );
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          [WORKFLOW_APPROVED_SCHEDULE_SETTING]:
            post.scheduledDate.toISOString(),
        }),
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

  it('omits the legacy eligibility timestamp for publish-now provider execution', async () => {
    schedulerPublishStateService.transitionPost.mockResolvedValue(true);
    const post = {
      brandId: 'brand-1',
      children: [],
      credentialId: 'cred-1',
      id: 'post-1',
      ingredients: [],
      organizationId: 'org-1',
      platform: CredentialPlatform.BEEHIIV,
      reviewVersionPinId: 'pin-1',
      scheduledDate: new Date('2026-07-07T09:55:00.000Z'),
      status: PostStatus.SCHEDULED,
      targetSettings: { providerStatus: 'draft' },
      userId: 'user-1',
    };
    postsService.findAll.mockResolvedValueOnce({
      docs: [post],
      total: 1,
    } as never);
    credentialsService.findOne.mockResolvedValue({
      id: 'cred-1',
      platform: CredentialPlatform.BEEHIIV,
    });
    quotaService.checkQuota.mockResolvedValue({
      allowed: true,
      currentCount: 0,
      dailyLimit: 10,
    });
    const publish = vi.fn().mockResolvedValue({
      externalId: 'beehiiv-post-1',
      platform: CredentialPlatform.BEEHIIV,
      status: PostStatus.DRAFT,
      success: true,
      url: 'https://app.beehiiv.com/posts/beehiiv-post-1/preview',
    });
    publisherFactory.getPublisher.mockReturnValue({
      publish,
      supportsThreads: false,
    });

    await service.processQueuedPost({
      ...APPROVAL_JOB_IDENTITY,
      enqueuedAt: '2026-07-07T09:55:00.000Z',
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'publish_now',
    });

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.not.objectContaining({
          [WORKFLOW_APPROVED_SCHEDULE_SETTING]: expect.any(String),
        }),
      }),
    );
    expect(schedulerPublishStateService.transitionPost).toHaveBeenNthCalledWith(
      2,
      post,
      expect.objectContaining({
        executionState: TargetExecutionState.PUBLISHED,
        externalId: 'beehiiv-post-1',
        status: PostStatus.DRAFT,
      }),
      undefined,
      expect.any(Object),
    );
    expect(
      publishEventWebhookService.emitLegacyPostPublished,
    ).not.toHaveBeenCalled();
    expect(activitiesService.create).not.toHaveBeenCalled();
  });

  it('delegates recurring-post scheduling after a successful publish', async () => {
    schedulerPublishStateService.transitionPost.mockResolvedValue(true);
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

    expect(postRepeatSchedulerService.scheduleNextRepeat).toHaveBeenCalledWith(
      post,
      expect.stringContaining('CronPostsService'),
    );
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
      expect.objectContaining({ success: true, status: PostStatus.PUBLIC }),
    );
    expect(
      postRepeatSchedulerService.materializeRecurrence,
    ).toHaveBeenCalledWith(post);
    expect(publisherFactory.getPublisher).not.toHaveBeenCalled();
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
      reviewVersionPinId: 'pin-1',
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
      reviewVersionPinId: 'pin-1',
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

  it('records a publisher validation failure as terminally failed without retry', async () => {
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
      reviewVersionPinId: 'pin-1',
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
    // The message deliberately contains "5000", which the message-pattern
    // retry classifier would misread as an HTTP 500 — the publisher-supplied
    // errorCode must win and keep the failure terminal.
    const validationError =
      'YouTube caption is 5001 characters; the limit is 5000 characters.';
    publisherFactory.getPublisher.mockReturnValue({
      publish: vi.fn().mockResolvedValue({
        error: validationError,
        errorCode: 'caption_too_long',
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
      expect.objectContaining({ status: PostStatus.FAILED, success: false }),
    );
    expect(schedulerPublishStateService.transitionPost).toHaveBeenNthCalledWith(
      2,
      post,
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'caption_too_long',
          isRetryable: false,
        }),
        executionState: TargetExecutionState.FAILED,
        status: PostStatus.FAILED,
        workflowExecutionId: 'execution-1',
      }),
      validationError,
      {
        expectedWorkflowExecutionId: 'execution-1',
        priorExecutionStates: [TargetExecutionState.PUBLISHING],
      },
    );
  });

  it('records Beehiiv authorization rejection without a transient retry', async () => {
    schedulerPublishStateService.transitionPost.mockResolvedValue(true);
    const post = {
      brandId: 'brand-1',
      children: [],
      credentialId: 'cred-1',
      groupId: 'group-1',
      id: 'post-1',
      ingredients: [],
      organizationId: 'org-1',
      platform: CredentialPlatform.BEEHIIV,
      reviewVersionPinId: 'pin-1',
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
      platform: CredentialPlatform.BEEHIIV,
    });
    quotaService.checkQuota.mockResolvedValue({
      allowed: true,
      currentCount: 0,
      dailyLimit: 10,
    });
    publisherFactory.getPublisher.mockReturnValue({
      publish: vi
        .fn()
        .mockRejectedValue(
          new BeehiivProviderError(
            'authorization_failed',
            'Beehiiv rejected the connected credential.',
            { isRetryable: false, statusCode: 401 },
          ),
        ),
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
        error: expect.objectContaining({
          code: 'authorization_failed',
          isRetryable: false,
        }),
        executionState: TargetExecutionState.FAILED,
        status: PostStatus.FAILED,
      }),
      'Beehiiv rejected the connected credential.',
      expect.any(Object),
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
    schedulerPublishStateService.transitionPost.mockResolvedValue(true);
    const post = {
      brand: 'brand-1',
      children: [],
      credential: 'cred-1',
      id: 'post-1',
      ingredients: [],
      organization: 'org-1',
      platform: CredentialPlatform.TWITTER,
      reviewVersionPinId: 'pin-1',
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

  /**
   * Readiness is a snapshot, and a queued job can sit for the entire scheduling
   * horizon before it runs — a token expires, an account is disconnected, a
   * provider app loses its configuration. The enqueue-side gate cannot see any
   * of that, so the consumer re-derives the same verdict before it hands
   * anything to a provider. Same derivation as the scheduler
   * (`resolveForCredentials`), so the two ends of the queue never disagree.
   */
  it('fails a queued publish whose channel stopped being publishable after it was scheduled', async () => {
    schedulerPublishStateService.transitionPost.mockResolvedValue(true);
    const post = {
      brandId: 'brand-1',
      children: [],
      credentialId: 'cred-1',
      id: 'post-1',
      ingredients: [],
      organizationId: 'org-1',
      platform: CredentialPlatform.TWITTER,
      reviewVersionPinId: 'pin-1',
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
    publishingReadinessService.resolveForCredentials.mockResolvedValue(
      new Map([['cred-1', BLOCKED_READINESS]]),
    );

    const result = await service.processQueuedPost({
      ...APPROVAL_JOB_IDENTITY,
      enqueuedAt: '2026-07-07T09:55:00.000Z',
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
    });

    // Nothing reaches the provider, and the quota branch never runs — the two
    // gates stay disjoint so a blocked channel is not misreported as quota.
    expect(publisherFactory.getPublisher).not.toHaveBeenCalled();
    expect(quotaService.checkQuota).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        error: 'The provider account has no usable access credential.',
        platform: CredentialPlatform.TWITTER,
        status: PostStatus.FAILED,
        success: false,
      }),
    );
    expect(schedulerPublishStateService.transitionPost).toHaveBeenNthCalledWith(
      2,
      post,
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'credential_access_token_missing',
          isRetryable: false,
          message: 'The provider account has no usable access credential.',
        }),
        executionState: TargetExecutionState.FAILED,
        status: PostStatus.FAILED,
      }),
      'The provider account has no usable access credential.',
      // Hard failures carry no transition guard.
      undefined,
    );
    expect(
      publishEventWebhookService.emitLegacyPostFailed,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: 'The provider account has no usable access credential.',
        platform: CredentialPlatform.TWITTER,
        post,
      }),
    );
  });

  it('resolves consume-time readiness tenant-scoped for the post own credential', async () => {
    schedulerPublishStateService.transitionPost.mockResolvedValue(true);
    postsService.findAll.mockResolvedValueOnce({
      docs: [
        {
          brandId: 'brand-1',
          children: [],
          credentialId: 'cred-1',
          id: 'post-1',
          ingredients: [],
          organizationId: 'org-1',
          platform: CredentialPlatform.TWITTER,
          reviewVersionPinId: 'pin-1',
          retryCount: 0,
          scheduledDate: new Date('2026-07-07T09:55:00.000Z'),
          status: PostStatus.SCHEDULED,
          userId: 'user-1',
        },
      ],
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
        platform: CredentialPlatform.TWITTER,
        status: PostStatus.PUBLIC,
        success: true,
        url: 'https://x.com/example/status/tweet-1',
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

    expect(
      publishingReadinessService.resolveForCredentials,
    ).toHaveBeenCalledWith(prismaService, 'org-1', ['cred-1']);
    expect(result).toEqual(expect.objectContaining({ success: true }));
  });

  it('fails closed when consume-time readiness cannot be resolved at all', async () => {
    schedulerPublishStateService.transitionPost.mockResolvedValue(true);
    postsService.findAll.mockResolvedValueOnce({
      docs: [
        {
          brandId: 'brand-1',
          children: [],
          credentialId: 'cred-1',
          id: 'post-1',
          ingredients: [],
          organizationId: 'org-1',
          platform: CredentialPlatform.TWITTER,
          reviewVersionPinId: 'pin-1',
          retryCount: 0,
          scheduledDate: new Date('2026-07-07T09:55:00.000Z'),
          status: PostStatus.SCHEDULED,
          userId: 'user-1',
        },
      ],
      total: 1,
    } as never);
    credentialsService.findOne.mockResolvedValue({
      id: 'cred-1',
      platform: CredentialPlatform.TWITTER,
    });
    // A soft-deleted or cross-tenant credential yields no row, so the map has
    // no entry for it. Absence is a block, never a pass.
    publishingReadinessService.resolveForCredentials.mockResolvedValue(
      new Map(),
    );

    const result = await service.processQueuedPost({
      ...APPROVAL_JOB_IDENTITY,
      enqueuedAt: '2026-07-07T09:55:00.000Z',
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
    });

    expect(publisherFactory.getPublisher).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        error: 'Channel is not ready to publish',
        success: false,
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
      reviewVersionPinId: 'pin-1',
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

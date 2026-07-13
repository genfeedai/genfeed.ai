import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { SystemWorkflowProvenanceService } from '@api/collections/workflows/services/system-workflow-provenance.service';
import { PublisherFactoryService } from '@api/services/integrations/publishers/publisher-factory.service';
import { QuotaService } from '@api/services/quota/quota.service';
import { PublishEventWebhookService } from '@api/services/webhook-client/webhook-client.module';
import { CredentialPlatform, PostStatus } from '@genfeedai/enums';
import {
  AgentScopeContextService,
  PostPublishQueueService,
} from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronPostsService } from '@workers/crons/posts/cron.posts.service';

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

  it('rejects stale durable agent scope before publishing side effects', async () => {
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

    await expect(
      service.processQueuedPost({
        enqueuedAt: '2026-07-07T10:00:00.000Z',
        organizationId: 'org-1',
        postId: 'post-1',
        source: 'scheduled_sweep',
      }),
    ).rejects.toThrow('Agent context is stale.');

    expect(publisherFactory.getPublisher).not.toHaveBeenCalled();
    expect(postsService.patch).not.toHaveBeenCalled();
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
  });

  it('skips queued publish jobs that are no longer eligible', async () => {
    postsService.findAll.mockResolvedValueOnce({
      docs: [],
      total: 0,
    } as never);

    const result = await service.processQueuedPost({
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

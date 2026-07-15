import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import {
  SYSTEM_WORKFLOW_ACTION_IDS,
  SystemWorkflowProvenanceService,
} from '@api/collections/workflows/services/system-workflow-provenance.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { PublishEventWebhookService } from '@api/services/webhook-client/webhook-client.module';
import { PostStatus, TargetExecutionState } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronTiktokStatusService } from '@workers/crons/tiktok/cron.tiktok-status.service';
import { SchedulerPublishStateService } from '@workers/services/scheduler-publish-state.service';

describe('CronTiktokStatusService', () => {
  let service: CronTiktokStatusService;
  let postsService: {
    findAll: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let tiktokService: {
    getPublishStatus: ReturnType<typeof vi.fn>;
    refreshToken: ReturnType<typeof vi.fn>;
  };
  let publishEventWebhookService: {
    emitLegacyPostFailed: ReturnType<typeof vi.fn>;
    emitLegacyPostPublished: ReturnType<typeof vi.fn>;
  };
  let provenanceService: { runAction: ReturnType<typeof vi.fn> };
  let schedulerPublishStateService: {
    transitionPost: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    postsService = {
      findAll: vi.fn().mockResolvedValue({ docs: [] }),
      patch: vi.fn(),
    };
    tiktokService = {
      getPublishStatus: vi.fn(),
      refreshToken: vi.fn(),
    };
    publishEventWebhookService = {
      emitLegacyPostFailed: vi.fn().mockResolvedValue(undefined),
      emitLegacyPostPublished: vi.fn().mockResolvedValue(undefined),
    };
    provenanceService = {
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
            workflowLabel: 'TikTok Status Reconciliation',
          };
          return {
            provenance,
            result: await action(provenance),
          };
        },
      ),
    };
    schedulerPublishStateService = {
      transitionPost: vi.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronTiktokStatusService,
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: PostsService,
          useValue: postsService,
        },
        {
          provide: TiktokService,
          useValue: tiktokService,
        },
        {
          provide: CredentialsService,
          useValue: {
            patch: vi.fn(),
          },
        },
        {
          provide: SystemWorkflowProvenanceService,
          useValue: provenanceService,
        },
        {
          provide: PublishEventWebhookService,
          useValue: publishEventWebhookService,
        },
        {
          provide: SchedulerPublishStateService,
          useValue: schedulerPublishStateService,
        },
      ],
    }).compile();

    service = module.get<CronTiktokStatusService>(CronTiktokStatusService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('records verified publications through the system workflow provenance service', async () => {
    const post = {
      _id: 'post-1',
      brand: 'brand-1',
      credential: {
        _id: 'credential-1',
        accessToken: 'encrypted-token',
        externalHandle: 'creator',
        id: 'credential-1',
        isConnected: true,
      },
      externalId: 'publish-1',
      id: 'post-1',
      organization: 'org-1',
      updatedAt: new Date().toISOString(),
      user: 'user-1',
    };
    postsService.findAll.mockResolvedValue({ docs: [post] });
    // Empty access token bypasses EncryptionUtil.decrypt (no key needed in tests)
    tiktokService.refreshToken.mockResolvedValue({ accessToken: '' });
    tiktokService.getPublishStatus.mockResolvedValue({
      publicly_available_post_id: ['tiktok-post-1'],
      status: 'PUBLISH_COMPLETE',
    });

    await service.checkPendingTiktokPosts();

    expect(provenanceService.runAction).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.TIKTOK_STATUS_RECONCILIATION,
        organizationId: 'org-1',
      }),
      expect.any(Function),
    );
    expect(schedulerPublishStateService.transitionPost).toHaveBeenCalledWith(
      post,
      expect.objectContaining({
        externalId: 'tiktok-post-1',
        status: PostStatus.PUBLIC,
      }),
      expect.stringContaining('moderation completed'),
      expect.any(Object),
    );
    expect(
      publishEventWebhookService.emitLegacyPostPublished,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        externalProviderId: 'tiktok-post-1',
        platform: 'tiktok',
        post,
        url: 'https://www.tiktok.com/@creator/video/tiktok-post-1',
      }),
    );
  });

  it('marks timed-out pending posts failed inside a provenance execution', async () => {
    const post = {
      _id: 'post-2',
      brand: 'brand-1',
      credential: {
        _id: 'credential-1',
        accessToken: 'encrypted-token',
        id: 'credential-1',
        isConnected: true,
      },
      externalId: 'publish-2',
      id: 'post-2',
      organization: 'org-1',
      // Became PENDING 48h ago - beyond the 24h max age
      updatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      user: 'user-1',
    };
    postsService.findAll.mockResolvedValue({ docs: [post] });

    await service.checkPendingTiktokPosts();

    expect(provenanceService.runAction).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.TIKTOK_STATUS_RECONCILIATION,
      }),
      expect.any(Function),
    );
    expect(schedulerPublishStateService.transitionPost).toHaveBeenCalledWith(
      post,
      expect.objectContaining({ status: PostStatus.FAILED }),
      'TikTok moderation timeout - exceeded 24 hours',
      expect.any(Object),
    );
    expect(
      publishEventWebhookService.emitLegacyPostFailed,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: 'TikTok moderation timeout - exceeded 24 hours',
        platform: 'tiktok',
        post,
      }),
    );
    expect(tiktokService.getPublishStatus).not.toHaveBeenCalled();
  });

  it('suppresses the failed webhook when the canonical transition is stale', async () => {
    const post = {
      _id: 'post-stale-failure',
      brand: 'brand-1',
      credential: {
        _id: 'credential-1',
        accessToken: 'encrypted-token',
        id: 'credential-1',
        isConnected: true,
      },
      externalId: 'publish-stale-failure',
      id: 'post-stale-failure',
      organization: 'org-1',
      updatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      user: 'user-1',
    };
    postsService.findAll.mockResolvedValue({ docs: [post] });
    schedulerPublishStateService.transitionPost.mockResolvedValue(false);

    await service.checkPendingTiktokPosts();

    expect(schedulerPublishStateService.transitionPost).toHaveBeenCalled();
    expect(
      publishEventWebhookService.emitLegacyPostFailed,
    ).not.toHaveBeenCalled();
  });

  it('continues the sweep when provenance recording fails', async () => {
    const post = {
      _id: 'post-3',
      brand: 'brand-1',
      credential: {
        _id: 'credential-1',
        accessToken: 'encrypted-token',
        id: 'credential-1',
        isConnected: true,
      },
      externalId: 'publish-3',
      id: 'post-3',
      organization: 'org-1',
      updatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      user: 'user-1',
    };
    postsService.findAll.mockResolvedValue({ docs: [post] });
    provenanceService.runAction.mockRejectedValue(
      new Error('provenance unavailable'),
    );

    await expect(service.checkPendingTiktokPosts()).resolves.toBeUndefined();
  });

  it('rolls a grouped TikTok completion into canonical target state', async () => {
    const post = {
      brand: 'brand-1',
      credential: {
        accessToken: 'encrypted-token',
        externalHandle: 'creator',
        id: 'credential-1',
        isConnected: true,
      },
      externalId: 'publish-4',
      groupId: 'group-1',
      id: 'post-4',
      organization: 'org-1',
      updatedAt: new Date().toISOString(),
      user: 'user-1',
    };
    postsService.findAll.mockResolvedValue({ docs: [post] });
    tiktokService.refreshToken.mockResolvedValue({ accessToken: '' });
    tiktokService.getPublishStatus.mockResolvedValue({
      publicly_available_post_id: ['tiktok-post-4'],
      status: 'PUBLISH_COMPLETE',
    });
    schedulerPublishStateService.transitionPost.mockResolvedValue(true);

    await service.checkPendingTiktokPosts();

    expect(schedulerPublishStateService.transitionPost).toHaveBeenCalledWith(
      post,
      expect.objectContaining({
        externalId: 'tiktok-post-4',
        status: PostStatus.PUBLIC,
        workflowExecutionId: 'execution-1',
      }),
      expect.stringContaining('moderation completed'),
      {
        expectedWorkflowExecutionId: 'execution-1',
        priorExecutionStates: [TargetExecutionState.PUBLISHING],
      },
    );
    expect(postsService.patch).not.toHaveBeenCalled();
  });

  it('suppresses the published webhook when the canonical transition is stale', async () => {
    const post = {
      brand: 'brand-1',
      credential: {
        accessToken: 'encrypted-token',
        externalHandle: 'creator',
        id: 'credential-1',
        isConnected: true,
      },
      externalId: 'publish-stale-success',
      groupId: 'group-1',
      id: 'post-stale-success',
      organization: 'org-1',
      updatedAt: new Date().toISOString(),
      user: 'user-1',
    };
    postsService.findAll.mockResolvedValue({ docs: [post] });
    tiktokService.refreshToken.mockResolvedValue({ accessToken: '' });
    tiktokService.getPublishStatus.mockResolvedValue({
      publicly_available_post_id: ['tiktok-stale-success'],
      status: 'PUBLISH_COMPLETE',
    });
    schedulerPublishStateService.transitionPost.mockResolvedValue(false);

    await service.checkPendingTiktokPosts();

    expect(schedulerPublishStateService.transitionPost).toHaveBeenCalled();
    expect(
      publishEventWebhookService.emitLegacyPostPublished,
    ).not.toHaveBeenCalled();
  });
});

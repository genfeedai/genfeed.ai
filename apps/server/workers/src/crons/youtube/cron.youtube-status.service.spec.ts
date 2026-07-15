import { PostsService } from '@api/collections/posts/services/posts.service';
import {
  SYSTEM_WORKFLOW_ACTION_IDS,
  SystemWorkflowProvenanceService,
} from '@api/collections/workflows/services/system-workflow-provenance.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { PublishEventWebhookService } from '@api/services/webhook-client/webhook-client.module';
import { PostStatus, TargetExecutionState } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronYoutubeStatusService } from '@workers/crons/youtube/cron.youtube-status.service';
import { SchedulerPublishStateService } from '@workers/services/scheduler-publish-state.service';

describe('CronYoutubeStatusService', () => {
  let service: CronYoutubeStatusService;
  let postsService: {
    findAll: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let youtubeService: { getVideoStatus: ReturnType<typeof vi.fn> };
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
    youtubeService = {
      getVideoStatus: vi.fn(),
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
            workflowLabel: 'YouTube Status Reconciliation',
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
        CronYoutubeStatusService,
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
          provide: YoutubeService,
          useValue: youtubeService,
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

    service = module.get<CronYoutubeStatusService>(CronYoutubeStatusService);
  });

  it('rolls a grouped public video into canonical target state', async () => {
    const post = {
      brand: 'brand-1',
      credential: 'credential-1',
      externalId: 'video-4',
      groupId: 'group-1',
      id: 'post-4',
      organization: 'org-1',
      status: PostStatus.PRIVATE,
      user: 'user-1',
    };
    postsService.findAll.mockResolvedValue({ docs: [post] });
    youtubeService.getVideoStatus.mockResolvedValue({
      privacyStatus: 'public',
    });
    schedulerPublishStateService.transitionPost.mockResolvedValue(true);

    await service.checkScheduledYoutubeVideos();

    expect(schedulerPublishStateService.transitionPost).toHaveBeenCalledWith(
      post,
      expect.objectContaining({
        status: PostStatus.PUBLIC,
        url: 'https://www.youtube.com/watch?v=video-4',
        workflowExecutionId: 'execution-1',
      }),
      'YouTube reports public',
      {
        expectedWorkflowExecutionId: 'execution-1',
        priorExecutionStates: [TargetExecutionState.PUBLISHING],
      },
    );
    expect(postsService.patch).not.toHaveBeenCalled();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('syncs status changes through the system workflow provenance service', async () => {
    const post = {
      _id: 'post-1',
      brand: 'brand-1',
      credential: 'credential-1',
      externalId: 'video-1',
      id: 'post-1',
      organization: 'org-1',
      status: PostStatus.PRIVATE,
      user: 'user-1',
    };
    postsService.findAll.mockResolvedValue({ docs: [post] });
    youtubeService.getVideoStatus.mockResolvedValue({
      privacyStatus: 'public',
    });

    await service.checkScheduledYoutubeVideos();

    expect(provenanceService.runAction).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.YOUTUBE_STATUS_RECONCILIATION,
        organizationId: 'org-1',
      }),
      expect.any(Function),
    );
    expect(schedulerPublishStateService.transitionPost).toHaveBeenCalledWith(
      post,
      expect.objectContaining({ status: PostStatus.PUBLIC }),
      'YouTube reports public',
      expect.any(Object),
    );
    expect(
      publishEventWebhookService.emitLegacyPostPublished,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        externalProviderId: 'video-1',
        platform: 'youtube',
        post,
        url: 'https://www.youtube.com/watch?v=video-1',
      }),
    );
  });

  it('suppresses the published webhook when the canonical transition is stale', async () => {
    const post = {
      _id: 'post-stale',
      brand: 'brand-1',
      credential: 'credential-1',
      externalId: 'video-stale',
      groupId: 'group-1',
      id: 'post-stale',
      organization: 'org-1',
      status: PostStatus.PRIVATE,
      user: 'user-1',
    };
    postsService.findAll.mockResolvedValue({ docs: [post] });
    youtubeService.getVideoStatus.mockResolvedValue({
      privacyStatus: 'public',
    });
    schedulerPublishStateService.transitionPost.mockResolvedValue(false);

    await service.checkScheduledYoutubeVideos();

    expect(schedulerPublishStateService.transitionPost).toHaveBeenCalled();
    expect(
      publishEventWebhookService.emitLegacyPostPublished,
    ).not.toHaveBeenCalled();
  });

  it('does not record an execution when the status is unchanged', async () => {
    const post = {
      _id: 'post-2',
      brand: 'brand-1',
      credential: 'credential-1',
      externalId: 'video-2',
      id: 'post-2',
      organization: 'org-1',
      status: PostStatus.PRIVATE,
      user: 'user-1',
    };
    postsService.findAll.mockResolvedValue({ docs: [post] });
    youtubeService.getVideoStatus.mockResolvedValue({
      privacyStatus: 'private',
    });

    await service.checkScheduledYoutubeVideos();

    expect(provenanceService.runAction).not.toHaveBeenCalled();
    expect(postsService.patch).not.toHaveBeenCalled();
  });

  it('soft-deletes posts for videos removed from YouTube inside a provenance execution', async () => {
    const post = {
      _id: 'post-3',
      brand: 'brand-1',
      credential: 'credential-1',
      externalId: 'video-3',
      id: 'post-3',
      organization: 'org-1',
      status: PostStatus.PRIVATE,
      user: 'user-1',
    };
    postsService.findAll.mockResolvedValue({ docs: [post] });
    youtubeService.getVideoStatus.mockRejectedValue(
      new Error('Video not found'),
    );

    await service.checkScheduledYoutubeVideos();

    expect(provenanceService.runAction).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.YOUTUBE_STATUS_RECONCILIATION,
      }),
      expect.any(Function),
    );
    expect(postsService.patch).toHaveBeenCalledWith('post-3', {
      isDeleted: true,
    });
  });
});

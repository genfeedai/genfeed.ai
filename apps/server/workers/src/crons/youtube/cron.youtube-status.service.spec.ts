import { PostsService } from '@api/collections/posts/services/posts.service';
import {
  SYSTEM_WORKFLOW_ACTION_IDS,
  SystemWorkflowProvenanceService,
} from '@api/collections/workflows/services/system-workflow-provenance.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronYoutubeStatusService } from '@workers/crons/youtube/cron.youtube-status.service';

describe('CronYoutubeStatusService', () => {
  let service: CronYoutubeStatusService;
  let postsService: {
    findAll: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let youtubeService: { getVideoStatus: ReturnType<typeof vi.fn> };
  let provenanceService: { runAction: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    postsService = {
      findAll: vi.fn().mockResolvedValue({ docs: [] }),
      patch: vi.fn(),
    };
    youtubeService = {
      getVideoStatus: vi.fn(),
    };
    provenanceService = {
      runAction: vi.fn(
        async (_input: unknown, action: () => Promise<unknown>) => ({
          provenance: {
            executionId: 'execution-1',
            workflowId: 'workflow-1',
            workflowLabel: 'YouTube Status Reconciliation',
          },
          result: await action(),
        }),
      ),
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
      ],
    }).compile();

    service = module.get<CronYoutubeStatusService>(CronYoutubeStatusService);
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
    expect(postsService.patch).toHaveBeenCalledWith(
      'post-1',
      expect.objectContaining({ status: PostStatus.PUBLIC }),
    );
  });

  it('does not record an execution when the status is unchanged', async () => {
    const post = {
      _id: 'post-2',
      brand: 'brand-1',
      credential: 'credential-1',
      externalId: 'video-2',
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

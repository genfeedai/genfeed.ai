import { PostsService } from '@api/collections/posts/services/posts.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronYoutubeStatusService } from '@workers/crons/youtube/cron.youtube-status.service';

describe('CronYoutubeStatusService', () => {
  let service: CronYoutubeStatusService;

  beforeEach(async () => {
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
          useValue: {
            findAll: vi.fn().mockResolvedValue({ docs: [] }),
            patch: vi.fn(),
          },
        },
        {
          provide: YoutubeService,
          useValue: {
            getVideoStatus: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CronYoutubeStatusService>(CronYoutubeStatusService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

import { PostsService } from '@api/collections/posts/services/posts.service';
import { QueueService } from '@api/queues/core/queue.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronAnalyticsSocialService } from '@workers/crons/analytics/cron.analytics-social.service';

describe('CronAnalyticsSocialService', () => {
  let service: CronAnalyticsSocialService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronAnalyticsSocialService,
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
          },
        },
        {
          provide: QueueService,
          useValue: {
            add: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CronAnalyticsSocialService>(
      CronAnalyticsSocialService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

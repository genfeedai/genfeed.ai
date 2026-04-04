import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronTiktokStatusService } from '@workers/crons/tiktok/cron.tiktok-status.service';

describe('CronTiktokStatusService', () => {
  let service: CronTiktokStatusService;

  beforeEach(async () => {
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
          useValue: {
            findAll: vi.fn().mockResolvedValue({ docs: [] }),
            patch: vi.fn(),
          },
        },
        {
          provide: TiktokService,
          useValue: {
            getPublishStatus: vi.fn(),
            refreshToken: vi.fn(),
          },
        },
        {
          provide: CredentialsService,
          useValue: {
            patch: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CronTiktokStatusService>(CronTiktokStatusService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

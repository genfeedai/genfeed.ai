import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { PublisherFactoryService } from '@api/services/integrations/publishers/publisher-factory.service';
import { QuotaService } from '@api/services/quota/quota.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronPostsService } from '@workers/crons/posts/cron.posts.service';

describe('CronPostsService', () => {
  let service: CronPostsService;
  let postsService: vi.Mocked<PostsService>;
  let loggerService: vi.Mocked<LoggerService>;

  beforeEach(async () => {
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
          useValue: {
            create: vi.fn(),
          },
        },
        {
          provide: CredentialsService,
          useValue: {
            findOne: vi.fn(),
          },
        },
        {
          provide: OrganizationsService,
          useValue: {
            findOne: vi.fn(),
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
          useValue: {
            checkQuota: vi.fn(),
          },
        },
        {
          provide: PublisherFactoryService,
          useValue: {
            getPublisher: vi.fn(),
          },
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
  });
});

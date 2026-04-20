import { CacheService } from '@api/services/cache/services/cache.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronWorkflowsService } from '@workers/crons/workflows/cron.workflows.service';
import { GenerateArticleTask } from '@workers/crons/workflows/task-types/generate-article.task';
import { GenerateImageTask } from '@workers/crons/workflows/task-types/generate-image.task';
import { GenerateMusicTask } from '@workers/crons/workflows/task-types/generate-music.task';
import { GenerateVideoTask } from '@workers/crons/workflows/task-types/generate-video.task';

describe('CronWorkflowsService', () => {
  let service: CronWorkflowsService;
  let prismaService: {
    workflow: {
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let cacheService: vi.Mocked<CacheService>;
  let loggerService: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    prismaService = {
      workflow: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronWorkflowsService,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
        {
          provide: GenerateImageTask,
          useValue: {
            execute: vi.fn(),
            validateConfig: vi.fn().mockReturnValue({ valid: true }),
          },
        },
        {
          provide: GenerateVideoTask,
          useValue: {
            execute: vi.fn(),
            validateConfig: vi.fn().mockReturnValue({ valid: true }),
          },
        },
        {
          provide: GenerateMusicTask,
          useValue: {
            execute: vi.fn(),
            validateConfig: vi.fn().mockReturnValue({ valid: true }),
          },
        },
        {
          provide: GenerateArticleTask,
          useValue: {
            execute: vi.fn(),
            validateConfig: vi.fn().mockReturnValue({ valid: true }),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            sendNotification: vi.fn(),
          },
        },
        {
          provide: CacheService,
          useValue: {
            acquireLock: vi.fn().mockResolvedValue(true),
            releaseLock: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CronWorkflowsService>(CronWorkflowsService);
    cacheService = module.get(CacheService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should skip cycle when lock is not acquired', async () => {
    cacheService.acquireLock.mockResolvedValueOnce(false);

    await service.checkScheduledWorkflows();

    expect(loggerService.debug).toHaveBeenCalledWith(
      expect.stringContaining('lock held'),
      'CronWorkflowsService',
    );
  });

  it('should query due workflows when lock is acquired', async () => {
    await service.checkScheduledWorkflows();

    expect(prismaService.workflow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false,
        }),
      }),
    );
    expect(cacheService.releaseLock).toHaveBeenCalled();
  });
});

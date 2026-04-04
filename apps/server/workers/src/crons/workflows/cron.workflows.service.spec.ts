import {
  Workflow,
  type WorkflowDocument,
} from '@api/collections/workflows/schemas/workflow.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { CacheService } from '@api/services/cache/services/cache.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { CronWorkflowsService } from '@workers/crons/workflows/cron.workflows.service';
import { GenerateArticleTask } from '@workers/crons/workflows/task-types/generate-article.task';
import { GenerateImageTask } from '@workers/crons/workflows/task-types/generate-image.task';
import { GenerateMusicTask } from '@workers/crons/workflows/task-types/generate-music.task';
import { GenerateVideoTask } from '@workers/crons/workflows/task-types/generate-video.task';

describe('CronWorkflowsService', () => {
  let service: CronWorkflowsService;
  let workflowModel: {
    find: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    updateOne: ReturnType<typeof vi.fn>;
  };
  let cacheService: vi.Mocked<CacheService>;
  let loggerService: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    const exec = vi.fn().mockResolvedValue([] as WorkflowDocument[]);
    const limit = vi.fn().mockReturnValue({ exec });
    const find = vi.fn().mockReturnValue({ limit });

    workflowModel = {
      find,
      findById: vi.fn(),
      updateOne: vi.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronWorkflowsService,
        {
          provide: getModelToken(Workflow.name, DB_CONNECTIONS.CLOUD),
          useValue: workflowModel,
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

    expect(workflowModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        isDeleted: false,
      }),
    );
    expect(cacheService.releaseLock).toHaveBeenCalled();
  });
});

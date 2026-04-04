import { ModelsService } from '@api/collections/models/services/models.service';
import {
  RepurposingJob,
  type RepurposingJobDocument,
} from '@api/collections/schedules/schemas/repurposing-job.schema';
import {
  Schedule,
  type ScheduleDocument,
} from '@api/collections/schedules/schemas/schedule.schema';
import { SchedulesService } from '@api/collections/schedules/services/schedules.service';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Model } from 'mongoose';

// Mock OpenAI
vi.mock('openai', () => {
  return {
    __esModule: true,
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
    })),
  };
});

describe('SchedulesService', () => {
  let service: SchedulesService;
  let scheduleModel: ReturnType<typeof createMockModel>;
  let repurposingJobModel: ReturnType<typeof createMockModel>;
  let configService: { get: ReturnType<typeof vi.fn>; isProduction?: boolean };
  let loggerService: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const mockConfigService = {
    get: vi.fn().mockReturnValue('test-api-key'),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockScheduleModel = {
    countDocuments: vi.fn(),
    create: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    findByIdAndDelete: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findOne: vi.fn(),
  };

  const mockRepurposingJobModel = {
    countDocuments: vi.fn(),
    create: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    findByIdAndDelete: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findOne: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulesService,
        {
          provide: getModelToken(Schedule.name, DB_CONNECTIONS.CLOUD),
          useValue: mockScheduleModel,
        },
        {
          provide: getModelToken(RepurposingJob.name, DB_CONNECTIONS.CLOUD),
          useValue: mockRepurposingJobModel,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: ModelsService,
          useValue: {
            getOneByKey: vi.fn().mockResolvedValue(null),
          },
        },
        {
          provide: ReplicateService,
          useValue: {
            runTraining: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SchedulesService>(SchedulesService);
    scheduleModel = module.get<Model<ScheduleDocument>>(
      getModelToken(Schedule.name, DB_CONNECTIONS.CLOUD),
    );
    repurposingJobModel = module.get<Model<RepurposingJobDocument>>(
      getModelToken(RepurposingJob.name, DB_CONNECTIONS.CLOUD),
    );
    configService = module.get<ConfigService>(ConfigService);
    loggerService = module.get<LoggerService>(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

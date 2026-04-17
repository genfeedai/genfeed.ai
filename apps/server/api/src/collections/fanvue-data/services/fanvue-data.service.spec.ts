import { FanvueDataService } from '@api/collections/fanvue-data/services/fanvue-data.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  type FanvueContent,
  type FanvueEarnings,
  type FanvueSchedule,
  type FanvueSubscriber,
  type FanvueSyncLog,
} from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('FanvueDataService', () => {
  let service: FanvueDataService;

  interface MockModel {
    create: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  }

  let subscriberModel: MockModel;
  let contentModel: MockModel;
  let earningsModel: MockModel;
  let scheduleModel: MockModel;
  let syncLogModel: MockModel;
  let loggerService: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const createMockModel = (): MockModel => ({
    create: vi.fn(),
    deleteMany: vi.fn(),
    find: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue([]) }),
    findOne: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) }),
    updateMany: vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    }),
  });

  beforeEach(async () => {
    subscriberModel = createMockModel();
    contentModel = createMockModel();
    earningsModel = createMockModel();
    scheduleModel = createMockModel();
    syncLogModel = createMockModel();
    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FanvueDataService,
        { provide: PrismaService, useValue: subscriberModel },
        {
          provide: LoggerService,
          useValue: loggerService,
        },
      ],
    }).compile();

    service = module.get<FanvueDataService>(FanvueDataService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have subscriber model injected', () => {
    expect(service._subscriberModel).toBeDefined();
    expect(service._subscriberModel).toBe(subscriberModel);
  });

  it('should have content model injected', () => {
    expect(service._contentModel).toBeDefined();
    expect(service._contentModel).toBe(contentModel);
  });

  it('should have earnings model injected', () => {
    expect(service._earningsModel).toBeDefined();
    expect(service._earningsModel).toBe(earningsModel);
  });

  it('should have schedule model injected', () => {
    expect(service._scheduleModel).toBeDefined();
    expect(service._scheduleModel).toBe(scheduleModel);
  });

  it('should have sync log model injected', () => {
    expect(service._syncLogModel).toBeDefined();
    expect(service._syncLogModel).toBe(syncLogModel);
  });

  it('should have logger injected', () => {
    expect(service._logger).toBeDefined();
    expect(service._logger).toBe(loggerService);
  });

  it('should expose all five models for external consumers', () => {
    const models = [
      service._subscriberModel,
      service._contentModel,
      service._earningsModel,
      service._scheduleModel,
      service._syncLogModel,
    ];
    for (const model of models) {
      expect(model).toBeDefined();
      expect(model.find).toBeDefined();
      expect(model.findOne).toBeDefined();
      expect(model.create).toBeDefined();
    }
  });

  it('should be injectable as a NestJS provider', async () => {
    // Verify the service can be independently compiled
    const freshModule = await Test.createTestingModule({
      providers: [
        FanvueDataService,
        { provide: PrismaService, useValue: createMockModel() },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    const freshService = freshModule.get<FanvueDataService>(FanvueDataService);
    expect(freshService).toBeInstanceOf(FanvueDataService);
  });
});

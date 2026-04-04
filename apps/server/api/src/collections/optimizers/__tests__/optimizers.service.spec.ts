import { ModelsService } from '@api/collections/models/services/models.service';
import { ContentScore } from '@api/collections/optimizers/schemas/content-score.schema';
import { Optimization } from '@api/collections/optimizers/schemas/optimization.schema';
import { OptimizersService } from '@api/collections/optimizers/services/optimizers.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

describe('OptimizersService', () => {
  let service: OptimizersService;

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockReplicateService = {
    generateTextCompletionSync: vi.fn().mockResolvedValue('{}'),
  };

  const mockContentScoreModel = vi.fn().mockImplementation((dto) => ({
    ...dto,
    _id: { toString: () => 'mock-id' },
    save: vi.fn().mockResolvedValue({ ...dto, toObject: () => dto }),
    toObject: vi.fn().mockReturnValue(dto),
  }));
  Object.assign(mockContentScoreModel, {
    collection: { name: 'contentscores' },
    find: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue([]),
    limit: vi.fn().mockReturnThis(),
    modelName: 'ContentScore',
    sort: vi.fn().mockReturnThis(),
  });

  const mockOptimizationModel = vi.fn().mockImplementation((dto) => ({
    ...dto,
    _id: { toString: () => 'mock-id' },
    save: vi.fn().mockResolvedValue({ ...dto }),
  }));
  Object.assign(mockOptimizationModel, {
    collection: { name: 'optimizations' },
    find: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue([]),
    limit: vi.fn().mockReturnThis(),
    modelName: 'Optimization',
    sort: vi.fn().mockReturnThis(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OptimizersService,
        {
          provide: getModelToken(ContentScore.name, DB_CONNECTIONS.CLOUD),
          useValue: mockContentScoreModel,
        },
        {
          provide: getModelToken(Optimization.name, DB_CONNECTIONS.CLOUD),
          useValue: mockOptimizationModel,
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
        {
          provide: ModelsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(null),
          },
        },
        {
          provide: ReplicateService,
          useValue: mockReplicateService,
        },
      ],
    }).compile();

    service = module.get<OptimizersService>(OptimizersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have analyzeContent method', () => {
    expect(service.analyzeContent).toBeDefined();
  });

  it('should have optimizeContent method', () => {
    expect(service.optimizeContent).toBeDefined();
  });

  it('should have suggestHashtags method', () => {
    expect(service.suggestHashtags).toBeDefined();
  });

  it('should have generateVariants method', () => {
    expect(service.generateVariants).toBeDefined();
  });

  it('should have getBestPostingTimes method', () => {
    expect(service.getBestPostingTimes).toBeDefined();
  });

  it('should have getOptimizationHistory method', () => {
    expect(service.getOptimizationHistory).toBeDefined();
  });
});

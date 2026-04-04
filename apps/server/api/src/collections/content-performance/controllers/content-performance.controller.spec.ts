import { ContentPerformanceController } from '@api/collections/content-performance/controllers/content-performance.controller';
import { AttributionService } from '@api/collections/content-performance/services/attribution.service';
import { ContentPerformanceService } from '@api/collections/content-performance/services/content-performance.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('ContentPerformanceController', () => {
  let controller: ContentPerformanceController;
  let _service: vi.Mocked<ContentPerformanceService>;
  let _attributionService: vi.Mocked<AttributionService>;

  const mockService = {
    aggregateByGenerationId: vi.fn(),
    bulkManualImport: vi.fn(),
    createPerformance: vi.fn(),
    findOne: vi.fn(),
    getTopPerformers: vi.fn(),
    patch: vi.fn(),
    queryPerformance: vi.fn(),
  };

  const mockAttributionService = {
    getAttributionByGenerationId: vi.fn(),
    rankGenerationStrategies: vi.fn(),
  };

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    setContext: vi.fn(),
    verbose: vi.fn(),
    warn: vi.fn(),
  };

  const mockReq = {} as import('express').Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContentPerformanceController],
      providers: [
        { provide: ContentPerformanceService, useValue: mockService },
        { provide: AttributionService, useValue: mockAttributionService },
        { provide: LoggerService, useValue: mockLogger },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ContentPerformanceController>(
      ContentPerformanceController,
    );
    _service = module.get(ContentPerformanceService);
    _attributionService = module.get(AttributionService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call createPerformance', async () => {
      mockService.createPerformance.mockResolvedValue({ _id: 'test' });

      const mockUser = {
        publicMetadata: {
          brand: 'brand1',
          organization: 'org1',
          user: 'user1',
        },
      } as any;

      const dto = {
        brand: '507f1f77bcf86cd799439011',
        contentType: 'caption',
        measuredAt: '2026-01-01T00:00:00Z',
        platform: 'instagram',
      } as any;

      await controller.create(mockReq, dto, mockUser);
      expect(mockService.createPerformance).toHaveBeenCalled();
    });
  });

  describe('getTopPerformers', () => {
    it('should call getTopPerformers with defaults', async () => {
      mockService.getTopPerformers.mockResolvedValue([]);

      const mockUser = {
        publicMetadata: { organization: 'org1', user: 'user1' },
      } as any;

      await controller.getTopPerformers(
        mockReq,
        undefined as any,
        undefined as any,
        mockUser,
      );
      expect(mockService.getTopPerformers).toHaveBeenCalled();
    });
  });
});

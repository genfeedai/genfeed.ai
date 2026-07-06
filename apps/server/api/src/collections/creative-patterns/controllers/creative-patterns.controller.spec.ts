import { CreativePatternsController } from '@api/collections/creative-patterns/controllers/creative-patterns.controller';
import { CreativePatternsService } from '@api/collections/creative-patterns/creative-patterns.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('CreativePatternsController', () => {
  let controller: CreativePatternsController;

  const mockPatterns = [
    { _id: 'pattern1', patternType: 'hook', platform: 'twitter' },
    { _id: 'pattern2', patternType: 'cta', platform: 'instagram' },
  ];

  const mockCreativePatternsService = {
    findAll: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CreativePatternsController],
      providers: [
        {
          provide: CreativePatternsService,
          useValue: mockCreativePatternsService,
        },
      ],
    }).compile();

    controller = module.get<CreativePatternsController>(
      CreativePatternsController,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all patterns', async () => {
      mockCreativePatternsService.findAll.mockResolvedValue(mockPatterns);

      const result = await controller.findAll();

      expect(mockCreativePatternsService.findAll).toHaveBeenCalledWith({
        brandId: undefined,
        limit: undefined,
        patternType: undefined,
        platform: undefined,
        scope: undefined,
        top: false,
      });
      expect(result).toEqual({ count: 2, patterns: mockPatterns });
    });

    it('should filter by platform', async () => {
      mockCreativePatternsService.findAll.mockResolvedValue([mockPatterns[0]]);

      const result = await controller.findAll('twitter');

      expect(mockCreativePatternsService.findAll).toHaveBeenCalledWith({
        brandId: undefined,
        limit: undefined,
        patternType: undefined,
        platform: 'twitter',
        scope: undefined,
        top: false,
      });
      expect(result.count).toBe(1);
    });

    it('should filter by patternType', async () => {
      mockCreativePatternsService.findAll.mockResolvedValue([]);

      await controller.findAll(undefined, 'hook' as any);

      expect(mockCreativePatternsService.findAll).toHaveBeenCalledWith({
        brandId: undefined,
        limit: undefined,
        patternType: 'hook',
        platform: undefined,
        scope: undefined,
        top: false,
      });
    });

    it('should filter by brandId and top', async () => {
      mockCreativePatternsService.findAll.mockResolvedValue(mockPatterns);

      const result = await controller.findAll(
        undefined,
        undefined,
        undefined,
        'brand123',
        'true',
      );

      expect(mockCreativePatternsService.findAll).toHaveBeenCalledWith({
        brandId: 'brand123',
        limit: undefined,
        patternType: undefined,
        platform: undefined,
        scope: undefined,
        top: true,
      });
      expect(result).toEqual({ count: 2, patterns: mockPatterns });
    });

    it('should pass limit when top is set', async () => {
      mockCreativePatternsService.findAll.mockResolvedValue(mockPatterns);

      await controller.findAll(
        undefined,
        undefined,
        undefined,
        'brand123',
        'true',
        '5',
      );

      expect(mockCreativePatternsService.findAll).toHaveBeenCalledWith({
        brandId: 'brand123',
        limit: 5,
        patternType: undefined,
        platform: undefined,
        scope: undefined,
        top: true,
      });
    });
  });
});

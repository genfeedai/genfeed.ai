import { CreativePatternsController } from '@api/collections/creative-patterns/controllers/creative-patterns.controller';
import { CreativePatternsService } from '@api/collections/creative-patterns/creative-patterns.service';
import type { User } from '@clerk/backend';
import { Test, type TestingModule } from '@nestjs/testing';

describe('CreativePatternsController', () => {
  let controller: CreativePatternsController;

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockPatterns = [
    { _id: 'pattern1', patternType: 'hook', platform: 'twitter' },
    { _id: 'pattern2', patternType: 'cta', platform: 'instagram' },
  ];

  const mockCreativePatternsService = {
    findAll: vi.fn(),
    findTopForBrand: vi.fn(),
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
        patternType: undefined,
        platform: undefined,
        scope: undefined,
      });
      expect(result).toEqual({ count: 2, patterns: mockPatterns });
    });

    it('should filter by platform', async () => {
      mockCreativePatternsService.findAll.mockResolvedValue([mockPatterns[0]]);

      const result = await controller.findAll('twitter');

      expect(mockCreativePatternsService.findAll).toHaveBeenCalledWith({
        patternType: undefined,
        platform: 'twitter',
        scope: undefined,
      });
      expect(result.count).toBe(1);
    });

    it('should filter by patternType', async () => {
      mockCreativePatternsService.findAll.mockResolvedValue([]);

      await controller.findAll(undefined, 'hook' as any);

      expect(mockCreativePatternsService.findAll).toHaveBeenCalledWith({
        patternType: 'hook',
        platform: undefined,
        scope: undefined,
      });
    });
  });

  describe('findTopForBrand', () => {
    it('should return top patterns for brand', async () => {
      mockCreativePatternsService.findTopForBrand.mockResolvedValue(
        mockPatterns,
      );

      const result = await controller.findTopForBrand(mockUser, 'brand123');

      expect(mockCreativePatternsService.findTopForBrand).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439012',
        'brand123',
        {},
      );
      expect(result).toEqual({
        brandId: 'brand123',
        count: 2,
        patterns: mockPatterns,
      });
    });

    it('should pass limit option', async () => {
      mockCreativePatternsService.findTopForBrand.mockResolvedValue(
        mockPatterns,
      );

      await controller.findTopForBrand(mockUser, 'brand123', '5');

      expect(mockCreativePatternsService.findTopForBrand).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439012',
        'brand123',
        { limit: 5 },
      );
    });

    it('should pass patternType option', async () => {
      mockCreativePatternsService.findTopForBrand.mockResolvedValue([]);

      await controller.findTopForBrand(
        mockUser,
        'brand123',
        undefined,
        'hook' as any,
      );

      expect(mockCreativePatternsService.findTopForBrand).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439012',
        'brand123',
        { patternTypes: ['hook'] },
      );
    });
  });
});

import {
  Brand,
  type BrandDocument,
} from '@api/collections/brands/schemas/brand.schema';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CACHE_PATTERNS } from '@api/common/constants/cache-patterns.constants';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('BrandsService', () => {
  let service: BrandsService;

  const mockModel = {
    aggregate: vi.fn(),
    aggregatePaginate: vi.fn(),
    bulkWrite: vi.fn(),
    collection: { name: 'brands' },
    countDocuments: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    modelName: 'Brand',
    populate: vi.fn(),
    updateMany: vi.fn(),
  } as Record<string, unknown>;

  const mockLogger: Record<string, ReturnType<typeof vi.fn>> = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockCacheService = {
    get: vi.fn(),
    invalidateByTags: vi.fn().mockResolvedValue(undefined),
    set: vi.fn(),
  };

  const mockBrandScraperService = {
    scrape: vi.fn(),
  };

  const mockLlmDispatcherService = {
    dispatch: vi.fn(),
  };

  const mockCacheInvalidationService = {
    invalidate: vi.fn().mockResolvedValue(undefined),
    invalidatePattern: vi.fn().mockResolvedValue(undefined),
  };

  // Mock constructor for new Brand()
  const MockModelConstructor = vi
    .fn()
    .mockImplementation((data: Record<string, unknown>) => ({
      ...data,
      save: vi.fn().mockResolvedValue({ _id: 'test-object-id', ...data }),
    }));

  beforeEach(async () => {
    Object.assign(MockModelConstructor, mockModel);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrandsService,
        { provide: PrismaService, useValue: MockModelConstructor },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
        {
          provide: BrandScraperService,
          useValue: mockBrandScraperService,
        },
        {
          provide: LlmDispatcherService,
          useValue: mockLlmDispatcherService,
        },
        {
          provide: CacheInvalidationService,
          useValue: mockCacheInvalidationService,
        },
      ],
    }).compile();

    service = module.get<BrandsService>(BrandsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOne', () => {
    it('should find a brand with detail populate by default', async () => {
      const brandId = 'test-object-id';
      const mockBrand = {
        _id: brandId,
        label: 'Test Brand',
        slug: 'test-brand',
      } as unknown as BrandDocument;

      const execMock = vi.fn().mockResolvedValue(mockBrand);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        populate: populateMock,
      });

      const result = await service.findOne({ _id: brandId });

      expect(result).toBe(mockBrand);
      expect(populateMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ path: 'logo' }),
          expect.objectContaining({ path: 'banner' }),
          expect.objectContaining({ path: 'references' }),
          expect.objectContaining({ path: 'links' }),
          expect.objectContaining({ path: 'credentials' }),
        ]),
      );
    });

    it('should return null when brand not found', async () => {
      const execMock = vi.fn().mockResolvedValue(null);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        populate: populateMock,
      });

      const result = await service.findOne({ _id: 'test-object-id' });

      expect(result).toBeNull();
    });

    it('should support "none" context with no populate', async () => {
      const mockBrand = {
        _id: 'test-object-id',
        label: 'Test',
      } as unknown as BrandDocument;

      const execMock = vi.fn().mockResolvedValue(mockBrand);
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        exec: execMock,
      });

      const result = await service.findOne({ _id: 'test-object-id' }, 'none');

      expect(result).toBe(mockBrand);
    });

    it('should use list context with minimal populate', async () => {
      const mockBrand = {
        _id: 'test-object-id',
        label: 'Test',
      } as unknown as BrandDocument;

      const execMock = vi.fn().mockResolvedValue(mockBrand);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        populate: populateMock,
      });

      await service.findOne({ _id: 'test-object-id' }, 'list');

      // List context should have only logo populate
      expect(populateMock).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ path: 'logo' })]),
      );
    });

    it('should use minimal context with basic populate', async () => {
      const mockBrand = {
        _id: 'test-object-id',
      } as unknown as BrandDocument;

      const execMock = vi.fn().mockResolvedValue(mockBrand);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        populate: populateMock,
      });

      await service.findOne({ _id: 'test-object-id' }, 'minimal');

      expect(populateMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ path: 'logo', select: '_id' }),
        ]),
      );
    });
  });

  describe('findOneBySlug', () => {
    it('should find brand by slug with public populate', async () => {
      const mockBrand = {
        _id: 'test-object-id',
        slug: 'my-brand',
      } as unknown as BrandDocument;

      const execMock = vi.fn().mockResolvedValue(mockBrand);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        populate: populateMock,
      });

      const result = await service.findOneBySlug({ slug: 'my-brand' });

      expect(result).toBe(mockBrand);
    });
  });

  describe('create', () => {
    it('should create a brand successfully', async () => {
      const createDto = {
        label: 'New Brand',
        organization: '507f1f77bcf86cd799439011',
        slug: 'new-brand',
      };

      const savedBrand = {
        _id: 'test-object-id',
        ...createDto,
      } as unknown as BrandDocument;

      // Spy on super.create via the service
      const _createSpy = vi
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(service)), 'create')
        .mockResolvedValue(savedBrand);

      const result = await service.create(
        createDto as Parameters<typeof service.create>[0],
      );

      expect(result).toBe(savedBrand);
    });

    it('should allow duplicate labels inside the same organization', async () => {
      const createDto = {
        label: 'Duplicate Brand',
        organization: '507f1f77bcf86cd799439011',
        slug: 'dup-brand',
      };
      const savedBrand = {
        _id: 'test-object-id',
        ...createDto,
      } as unknown as BrandDocument;

      vi.spyOn(
        Object.getPrototypeOf(Object.getPrototypeOf(service)),
        'create',
      ).mockResolvedValue(savedBrand);

      const result = await service.create(
        createDto as Parameters<typeof service.create>[0],
      );

      expect(result).toBe(savedBrand);
    });

    it('should allow same label in different organizations', async () => {
      const createDto = {
        label: 'Same Label',
        organization: '507f1f77bcf86cd799439012',
        slug: 'brand-2',
      };

      const savedBrand = {
        _id: 'test-object-id',
        ...createDto,
      } as unknown as BrandDocument;

      vi.spyOn(
        Object.getPrototypeOf(Object.getPrototypeOf(service)),
        'create',
      ).mockResolvedValue(savedBrand);

      const result = await service.create(
        createDto as Parameters<typeof service.create>[0],
      );

      expect(result).toBe(savedBrand);
    });
  });

  describe('patch', () => {
    it('should update a brand and return with populate', async () => {
      const brandId = '507f1f77bcf86cd799439011';
      const updateDto = { label: 'Updated Brand' };

      const updatedBrand = {
        _id: new string(brandId),
        label: 'Updated Brand',
      } as unknown as BrandDocument;

      const execMock = vi.fn().mockResolvedValue(updatedBrand);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      (mockModel.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue(
        {
          populate: populateMock,
        },
      );

      const result = await service.patch(brandId, updateDto);

      expect(result).toBe(updatedBrand);
    });

    it('should throw NotFoundException when brand not found for update', async () => {
      const brandId = '507f1f77bcf86cd799439099';

      const execMock = vi.fn().mockResolvedValue(null);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      (mockModel.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue(
        {
          populate: populateMock,
        },
      );

      await expect(service.patch(brandId, { label: 'test' })).rejects.toThrow();
    });
  });

  describe('updateAgentConfig', () => {
    it('should merge partial agent config updates using dot-path $set', async () => {
      const brandId = 'test-object-id'.toString();
      const orgId = 'test-object-id'.toString();
      const updatedBrand = {
        _id: new string(brandId),
      } as unknown as BrandDocument;

      (
        mockModel.findOneAndUpdate as ReturnType<typeof vi.fn>
      ).mockResolvedValue(updatedBrand);

      const result = await service.updateAgentConfig(brandId, orgId, {
        defaultAvatarIngredientId: 'test-object-id'.toString(),
        defaultVoiceId: 'test-object-id'.toString(),
      } as Parameters<typeof service.updateAgentConfig>[2]);

      expect(result).toBe(updatedBrand);
      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: brandId,
          isDeleted: false,
          organization: orgId,
        }),
        {
          $set: expect.objectContaining({
            'agentConfig.defaultAvatarIngredientId': expect.any(String),
            'agentConfig.defaultVoiceId': expect.any(String),
          }),
        },
        { new: true },
      );
    });

    it('should return current brand when patch payload is empty', async () => {
      const brandId = 'test-object-id'.toString();
      const orgId = 'test-object-id'.toString();
      const brand = { _id: new string(brandId) } as BrandDocument;

      (mockModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(brand);

      const result = await service.updateAgentConfig(brandId, orgId, {
        defaultAvatarIngredientId: undefined,
        defaultVoiceId: undefined,
      } as Parameters<typeof service.updateAgentConfig>[2]);

      expect(result).toBe(brand);
      expect(mockModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: brandId,
          isDeleted: false,
          organization: orgId,
        }),
      );
      expect(mockModel.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should soft delete a brand', async () => {
      const brandId = '507f1f77bcf86cd799439011';
      const deletedBrand = {
        _id: new string(brandId),
        isDeleted: true,
      } as unknown as BrandDocument;

      const execMock = vi.fn().mockResolvedValue(deletedBrand);
      (mockModel.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue(
        {
          exec: execMock,
        },
      );

      const result = await service.remove(brandId);

      expect(result).toBe(deletedBrand);
      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        brandId,
        { isDeleted: true },
        { returnDocument: 'after' },
      );
    });

    it('should throw NotFoundException when brand not found for deletion', async () => {
      const execMock = vi.fn().mockResolvedValue(null);
      (mockModel.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue(
        {
          exec: execMock,
        },
      );

      await expect(
        service.remove('507f1f77bcf86cd799439099'),
      ).rejects.toThrow();
    });
  });

  describe('cache invalidation', () => {
    describe('create', () => {
      it('should invalidate brands list cache after successful create', async () => {
        const orgId = '507f1f77bcf86cd799439011';
        const createDto = {
          label: 'New Brand',
          organization: orgId,
          slug: 'new-brand',
        };

        (mockModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);

        const savedBrand = {
          _id: 'test-object-id',
          ...createDto,
        } as unknown as BrandDocument;

        vi.spyOn(
          Object.getPrototypeOf(Object.getPrototypeOf(service)),
          'create',
        ).mockResolvedValue(savedBrand);

        await service.create(createDto as Parameters<typeof service.create>[0]);

        expect(mockCacheInvalidationService.invalidate).toHaveBeenCalledWith(
          CACHE_PATTERNS.BRANDS_LIST(orgId),
        );
        expect(
          mockCacheInvalidationService.invalidatePattern,
        ).toHaveBeenCalledWith('brands:*');
      });
    });

    describe('patch', () => {
      it('should invalidate brands single cache after update', async () => {
        const brandId = '507f1f77bcf86cd799439011';
        const updateDto = { label: 'Updated Brand' };

        const updatedBrand = {
          _id: new string(brandId),
          label: 'Updated Brand',
        } as unknown as BrandDocument;

        const execMock = vi.fn().mockResolvedValue(updatedBrand);
        const populateMock = vi.fn().mockReturnValue({ exec: execMock });
        (
          mockModel.findByIdAndUpdate as ReturnType<typeof vi.fn>
        ).mockReturnValue({ populate: populateMock });

        await service.patch(brandId, updateDto);

        expect(mockCacheInvalidationService.invalidate).toHaveBeenCalledWith(
          CACHE_PATTERNS.BRANDS_SINGLE(brandId),
        );
      });
    });

    describe('remove', () => {
      it('should invalidate brands single cache after soft delete', async () => {
        const brandId = '507f1f77bcf86cd799439011';
        const deletedBrand = {
          _id: new string(brandId),
          isDeleted: true,
        } as unknown as BrandDocument;

        const execMock = vi.fn().mockResolvedValue(deletedBrand);
        (
          mockModel.findByIdAndUpdate as ReturnType<typeof vi.fn>
        ).mockReturnValue({ exec: execMock });

        await service.remove(brandId);

        expect(mockCacheInvalidationService.invalidate).toHaveBeenCalledWith(
          CACHE_PATTERNS.BRANDS_SINGLE(brandId),
        );
      });
    });
  });

  describe('count', () => {
    it('should count brands matching filter', async () => {
      (mockModel.countDocuments as ReturnType<typeof vi.fn>).mockResolvedValue(
        10,
      );

      const result = await service.count({ isDeleted: false });

      expect(result).toBe(10);
    });

    it('should return 0 when no brands match', async () => {
      (mockModel.countDocuments as ReturnType<typeof vi.fn>).mockResolvedValue(
        0,
      );

      const result = await service.count({ label: 'nonexistent' });

      expect(result).toBe(0);
    });
  });

  describe('selectBrandForUser', () => {
    it('should atomically select a brand for user', async () => {
      const brandId = '507f1f77bcf86cd799439011';
      const userId = '507f1f77bcf86cd799439012';
      const orgId = '507f1f77bcf86cd799439013';

      const selectedBrand = {
        _id: new string(brandId),
        isSelected: true,
        label: 'Selected Brand',
      } as unknown as BrandDocument;

      (mockModel.bulkWrite as ReturnType<typeof vi.fn>).mockResolvedValue({
        modifiedCount: 2,
      });

      // findOne after bulkWrite
      const findOneSpy = vi
        .spyOn(service, 'findOne')
        .mockResolvedValue(selectedBrand);

      const result = await service.selectBrandForUser(brandId, userId, orgId);

      expect(result).toBe(selectedBrand);
      expect(mockModel.bulkWrite).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            updateMany: expect.objectContaining({
              filter: expect.objectContaining({
                isDeleted: false,
              }),
            }),
          }),
          expect.objectContaining({
            updateOne: expect.objectContaining({
              filter: expect.objectContaining({
                isDeleted: false,
              }),
            }),
          }),
        ]),
      );
      expect(findOneSpy).toHaveBeenCalled();
    });

    it('should throw NotFoundException when brand not found after select', async () => {
      const brandId = '507f1f77bcf86cd799439011';
      const userId = '507f1f77bcf86cd799439012';
      const orgId = '507f1f77bcf86cd799439013';

      (mockModel.bulkWrite as ReturnType<typeof vi.fn>).mockResolvedValue({
        modifiedCount: 0,
      });

      vi.spyOn(service, 'findOne').mockResolvedValue(null);

      await expect(
        service.selectBrandForUser(brandId, userId, orgId),
      ).rejects.toThrow();
    });
  });

  describe('patchAll', () => {
    it('should bulk update brands', async () => {
      const execMock = vi.fn().mockResolvedValue({
        matchedCount: 5,
        modifiedCount: 5,
      });
      (mockModel.updateMany as ReturnType<typeof vi.fn>).mockReturnValue({
        exec: execMock,
      });

      const result = await service.patchAll(
        { isDeleted: false },
        { $set: { isActive: true } },
      );

      expect(result.modifiedCount).toBe(5);
    });
  });
});

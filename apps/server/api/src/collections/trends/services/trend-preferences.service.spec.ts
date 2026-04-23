import { TrendPreferencesService } from '@api/collections/trends/services/trend-preferences.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';

describe('TrendPreferencesService', () => {
  let service: TrendPreferencesService;
  let prisma: {
    trendPreferences: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let loggerService: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  const organizationId = '507f1f77bcf86cd799439011';
  const brandId = '507f1f77bcf86cd799439022';

  beforeEach(() => {
    prisma = {
      trendPreferences: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    };
    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    service = new TrendPreferencesService(
      prisma as unknown as PrismaService,
      loggerService as unknown as LoggerService,
    );
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPreferences', () => {
    it('should return preferences for organization without brand', async () => {
      const mockPrefs = { categories: ['tech'], keywords: ['ai'] };
      prisma.trendPreferences.findFirst.mockResolvedValue(mockPrefs);

      const result = await service.getPreferences(organizationId);

      expect(result).toEqual({
        categories: ['tech'],
        hashtags: [],
        keywords: ['ai'],
        platforms: [],
      });
      expect(prisma.trendPreferences.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            brandId: null,
            isDeleted: false,
          }),
        }),
      );
    });

    it('should return brand-specific preferences when brandId is provided', async () => {
      const mockPrefs = { brandId: 'brand1', categories: ['fashion'] };
      prisma.trendPreferences.findFirst.mockResolvedValue(mockPrefs);

      const result = await service.getPreferences(organizationId, brandId);

      expect(result).toEqual({
        brandId: 'brand1',
        categories: ['fashion'],
        hashtags: [],
        keywords: [],
        platforms: [],
      });
      expect(prisma.trendPreferences.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            brandId,
            isDeleted: false,
          }),
        }),
      );
    });

    it('should fall back to org-level preferences when brand-specific not found', async () => {
      const orgPrefs = { categories: ['general'] };
      prisma.trendPreferences.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(orgPrefs);

      const result = await service.getPreferences(organizationId, brandId);

      expect(result).toEqual({
        categories: ['general'],
        hashtags: [],
        keywords: [],
        platforms: [],
      });
      expect(prisma.trendPreferences.findFirst).toHaveBeenCalledTimes(2);
      expect(prisma.trendPreferences.findFirst).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({
            brandId: null,
            isDeleted: false,
          }),
        }),
      );
    });

    it('should return null when no preferences found at any level', async () => {
      prisma.trendPreferences.findFirst.mockResolvedValue(null);

      const result = await service.getPreferences(organizationId);

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      prisma.trendPreferences.findFirst.mockRejectedValue(
        new Error('db error'),
      );

      const result = await service.getPreferences(organizationId);

      expect(result).toBeNull();
    });
  });

  describe('savePreferences', () => {
    it('should update existing preferences', async () => {
      const existingDoc = { id: 'pref-1' };
      const updatedDoc = { categories: ['tech'], keywords: ['ai'] };
      prisma.trendPreferences.findFirst.mockResolvedValue(existingDoc);
      prisma.trendPreferences.update.mockResolvedValue(updatedDoc);

      const result = await service.savePreferences(organizationId, {
        categories: ['tech'],
        keywords: ['ai'],
      });

      expect(prisma.trendPreferences.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            config: {
              categories: ['tech'],
              hashtags: [],
              keywords: ['ai'],
              platforms: [],
            },
          }),
          where: { id: 'pref-1' },
        }),
      );
      expect(result).toEqual({
        categories: ['tech'],
        hashtags: [],
        keywords: ['ai'],
        platforms: [],
      });
    });

    it('should create new preferences when none exist', async () => {
      const createdDoc = { categories: ['tech'], keywords: ['ai'] };
      prisma.trendPreferences.findFirst.mockResolvedValue(null);
      prisma.trendPreferences.create.mockResolvedValue(createdDoc);

      const result = await service.savePreferences(organizationId, {
        categories: ['tech'],
        keywords: ['ai'],
      });

      expect(prisma.trendPreferences.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            brandId: null,
            config: {
              categories: ['tech'],
              hashtags: [],
              keywords: ['ai'],
              platforms: [],
            },
            organizationId,
          }),
        }),
      );
      expect(result).toEqual({
        categories: ['tech'],
        hashtags: [],
        keywords: ['ai'],
        platforms: [],
      });
    });

    it('should create brand-scoped preferences when brandId is provided', async () => {
      prisma.trendPreferences.findFirst.mockResolvedValue(null);
      prisma.trendPreferences.create.mockResolvedValue({});

      await service.savePreferences(organizationId, {
        brandId,
        categories: ['tech'],
      });

      expect(prisma.trendPreferences.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            brandId,
            config: {
              categories: ['tech'],
              hashtags: [],
              keywords: [],
              platforms: [],
            },
            organizationId,
          }),
        }),
      );
    });

    it('should throw on save error', async () => {
      prisma.trendPreferences.findFirst.mockRejectedValue(
        new Error('save failed'),
      );

      await expect(
        service.savePreferences('507f1f77bcf86cd799439011', {
          categories: ['tech'],
        }),
      ).rejects.toThrow('save failed');
    });
  });
});

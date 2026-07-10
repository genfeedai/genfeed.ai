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
        autoRequeueWinners: false,
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
        autoRequeueWinners: false,
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
        autoRequeueWinners: false,
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

    it('should normalize the autoRequeueWinners flag from config', async () => {
      prisma.trendPreferences.findFirst.mockResolvedValue({
        config: { autoRequeueWinners: true, keywords: ['ai'] },
      });

      const result = await service.getPreferences(organizationId);

      expect(result?.autoRequeueWinners).toBe(true);
      expect(result?.keywords).toEqual(['ai']);
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
        autoRequeueWinners: false,
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
        autoRequeueWinners: false,
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

    it('should persist autoRequeueWinners into config when provided', async () => {
      prisma.trendPreferences.findFirst.mockResolvedValue(null);
      prisma.trendPreferences.create.mockResolvedValue({});

      await service.savePreferences(organizationId, {
        autoRequeueWinners: true,
        keywords: ['ai'],
      });

      expect(prisma.trendPreferences.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            config: {
              autoRequeueWinners: true,
              categories: [],
              hashtags: [],
              keywords: ['ai'],
              platforms: [],
            },
          }),
        }),
      );
    });

    it('should omit autoRequeueWinners from config when not provided', async () => {
      prisma.trendPreferences.findFirst.mockResolvedValue(null);
      prisma.trendPreferences.create.mockResolvedValue({});

      await service.savePreferences(organizationId, { keywords: ['ai'] });

      const createArg = prisma.trendPreferences.create.mock.calls[0][0];
      expect(createArg.data.config).not.toHaveProperty('autoRequeueWinners');
    });

    it('should preserve every omitted field on a partial update', async () => {
      prisma.trendPreferences.findFirst.mockResolvedValue({
        config: {
          autoRequeueWinners: true,
          categories: ['technology'],
          hashtags: ['#ai'],
          keywords: ['old'],
          platforms: ['twitter'],
        },
        id: 'pref-1',
      });
      prisma.trendPreferences.update.mockResolvedValue({});

      // Common edit flow: keywords/categories/platforms change, opt-in flag untouched.
      await service.savePreferences(organizationId, { keywords: ['ai'] });

      const updateArg = prisma.trendPreferences.update.mock.calls[0][0];
      expect(updateArg.data.config).toEqual({
        autoRequeueWinners: true,
        categories: ['technology'],
        hashtags: ['#ai'],
        keywords: ['ai'],
        platforms: ['twitter'],
      });
    });

    it('should preserve stored arrays when only the opt-in flag changes', async () => {
      prisma.trendPreferences.findFirst.mockResolvedValue({
        config: {
          autoRequeueWinners: false,
          categories: ['technology'],
          hashtags: ['#ai'],
          keywords: ['agents'],
          platforms: ['twitter'],
        },
        id: 'pref-1',
      });
      prisma.trendPreferences.update.mockResolvedValue({});

      await service.savePreferences(organizationId, {
        autoRequeueWinners: true,
      });

      const updateArg = prisma.trendPreferences.update.mock.calls[0][0];
      expect(updateArg.data.config).toEqual({
        autoRequeueWinners: true,
        categories: ['technology'],
        hashtags: ['#ai'],
        keywords: ['agents'],
        platforms: ['twitter'],
      });
    });
  });

  describe('mergeWinnerSignals', () => {
    it('should union winner signals into existing preferences and preserve the opt-in flag', async () => {
      prisma.trendPreferences.findFirst.mockResolvedValue({
        config: {
          autoRequeueWinners: true,
          keywords: ['ai'],
          platforms: ['twitter'],
        },
        id: 'pref-1',
      });
      prisma.trendPreferences.update.mockResolvedValue({});

      await service.mergeWinnerSignals(organizationId, brandId, {
        keywords: ['ai', 'proof', 'thread'],
        platforms: ['instagram'],
      });

      const updateArg = prisma.trendPreferences.update.mock.calls[0][0];
      expect(updateArg.data.config.autoRequeueWinners).toBe(true);
      expect(updateArg.data.config.keywords).toEqual(['ai', 'proof', 'thread']);
      expect(updateArg.data.config.platforms).toEqual(['twitter', 'instagram']);
    });

    it('should create preferences from signals when none exist', async () => {
      prisma.trendPreferences.findFirst.mockResolvedValue(null);
      prisma.trendPreferences.create.mockResolvedValue({});

      await service.mergeWinnerSignals(organizationId, undefined, {
        keywords: ['founder', 'proof'],
        platforms: ['linkedin'],
      });

      expect(prisma.trendPreferences.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            brandId: null,
            config: expect.objectContaining({
              keywords: ['founder', 'proof'],
              platforms: ['linkedin'],
            }),
            organizationId,
          }),
        }),
      );
    });
  });
});

import { TrendPreferences } from '@api/collections/trends/schemas/trend-preferences.schema';
import { TrendPreferencesService } from '@api/collections/trends/services/trend-preferences.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

describe('TrendPreferencesService', () => {
  let service: TrendPreferencesService;
  const organizationId = '507f1f77bcf86cd799439011';
  const brandId = '507f1f77bcf86cd799439022';

  beforeEach(async () => {
    const mockModel = vi.fn().mockImplementation(() => ({ save: vi.fn() }));
    mockModel.findOne = vi.fn().mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrendPreferencesService,
        {
          provide: getModelToken(TrendPreferences.name, DB_CONNECTIONS.CLOUD),
          useValue: mockModel,
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

    service = module.get<TrendPreferencesService>(TrendPreferencesService);
  });

  let mockModel: Record<string, unknown>;

  beforeEach(() => {
    mockModel = (service as unknown).trendPreferencesModel;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPreferences', () => {
    it('should return preferences for organization without brand', async () => {
      const mockPrefs = { categories: ['tech'], keywords: ['ai'] };
      mockModel.findOne = vi.fn().mockResolvedValue(mockPrefs);

      const result = await service.getPreferences(organizationId);

      expect(result).toEqual(mockPrefs);
      expect(mockModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: null,
          isDeleted: false,
        }),
      );
    });

    it('should return brand-specific preferences when brandId is provided', async () => {
      const mockPrefs = { brand: 'brand1', categories: ['fashion'] };
      mockModel.findOne = vi.fn().mockResolvedValue(mockPrefs);

      const result = await service.getPreferences(organizationId, brandId);

      expect(result).toEqual(mockPrefs);
      expect(mockModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: expect.anything(),
          isDeleted: false,
        }),
      );
    });

    it('should fall back to org-level preferences when brand-specific not found', async () => {
      const orgPrefs = { categories: ['general'] };
      mockModel.findOne = vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(orgPrefs);

      const result = await service.getPreferences(organizationId, brandId);

      expect(result).toEqual(orgPrefs);
      expect(mockModel.findOne).toHaveBeenCalledTimes(2);
      expect(mockModel.findOne).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          brand: null,
          isDeleted: false,
        }),
      );
    });

    it('should return null when no preferences found at any level', async () => {
      mockModel.findOne = vi.fn().mockResolvedValue(null);

      const result = await service.getPreferences(organizationId);

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockModel.findOne = vi.fn().mockRejectedValue(new Error('db error'));

      const result = await service.getPreferences(organizationId);

      expect(result).toBeNull();
    });
  });

  describe('savePreferences', () => {
    it('should update existing preferences', async () => {
      const existingDoc = {
        categories: ['old'],
        hashtags: [],
        keywords: [],
        platforms: [],
        save: vi
          .fn()
          .mockResolvedValue({ categories: ['tech'], keywords: ['ai'] }),
      };
      mockModel.findOne = vi.fn().mockResolvedValue(existingDoc);

      await service.savePreferences(organizationId, {
        categories: ['tech'],
        keywords: ['ai'],
      });

      expect(existingDoc.save).toHaveBeenCalled();
      expect(existingDoc.categories).toEqual(['tech']);
      expect(existingDoc.keywords).toEqual(['ai']);
      expect(mockModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: null,
          isDeleted: false,
        }),
      );
    });

    it('should create new preferences when none exist', async () => {
      const savedDoc = { categories: ['tech'], keywords: ['ai'] };
      mockModel.findOne = vi.fn().mockResolvedValue(null);
      (mockModel as Function).mockImplementation(function () {
        return { save: vi.fn().mockResolvedValue(savedDoc) };
      });

      await service.savePreferences(organizationId, {
        categories: ['tech'],
        keywords: ['ai'],
      });

      expect(mockModel).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: null,
        }),
      );
    });

    it('should create brand-scoped preferences when brandId is provided', async () => {
      const savedDoc = { categories: ['tech'] };
      mockModel.findOne = vi.fn().mockResolvedValue(null);
      (mockModel as Function).mockImplementation(function () {
        return { save: vi.fn().mockResolvedValue(savedDoc) };
      });

      await service.savePreferences(organizationId, {
        brandId,
        categories: ['tech'],
      });

      expect(mockModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: expect.anything(),
          isDeleted: false,
        }),
      );
      expect(mockModel).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: expect.anything(),
        }),
      );
    });

    it('should throw on save error', async () => {
      mockModel.findOne = vi.fn().mockRejectedValue(new Error('save failed'));

      await expect(
        service.savePreferences('507f1f77bcf86cd799439011', {
          categories: ['tech'],
        }),
      ).rejects.toThrow('save failed');
    });
  });
});

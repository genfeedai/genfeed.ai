import { OrganizationSetting } from '@api/collections/organization-settings/schemas/organization-setting.schema';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { createMockModel } from '@api/shared/testing/mock-model.factory';
import { LoggerService } from '@libs/logger/logger.service';
import { ModuleRef } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';

describe('OrganizationSettingsService', () => {
  let service: OrganizationSettingsService;
  let mockModel: ReturnType<typeof createMockModel>;
  let mockModuleRef: { get: ReturnType<typeof vi.fn> };

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    mockModel = createMockModel({
      brandsLimit: 5,
      organization: 'test-object-id',
      seatsLimit: 3,
    });

    mockModuleRef = {
      get: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationSettingsService,
        { provide: PrismaService, useValue: mockModel },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
        {
          provide: ModuleRef,
          useValue: mockModuleRef,
        },
      ],
    }).compile();

    service = module.get<OrganizationSettingsService>(
      OrganizationSettingsService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateBrandsLimit', () => {
    it('should update the brands limit and return updated document', async () => {
      const settingId = 'test-object-id'.toString();
      const updatedDoc = { _id: settingId, brandsLimit: 10 };
      mockModel.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue(updatedDoc),
      });

      const result = await service.updateBrandsLimit(settingId, 10);

      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        settingId,
        { brandsLimit: 10 },
        { returnDocument: 'after' },
      );
      expect(result).toEqual(updatedDoc);
    });

    it('should return null when setting not found', async () => {
      mockModel.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });

      const result = await service.updateBrandsLimit('nonexistent', 10);

      expect(result).toBeNull();
    });
  });

  describe('updateSeatsLimit', () => {
    it('should update the seats limit and return updated document', async () => {
      const settingId = 'test-object-id'.toString();
      const updatedDoc = { _id: settingId, seatsLimit: 20 };
      mockModel.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue(updatedDoc),
      });

      const result = await service.updateSeatsLimit(settingId, 20);

      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        settingId,
        { seatsLimit: 20 },
        { returnDocument: 'after' },
      );
      expect(result).toEqual(updatedDoc);
    });

    it('should return null when setting not found', async () => {
      mockModel.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });

      const result = await service.updateSeatsLimit('nonexistent', 5);

      expect(result).toBeNull();
    });
  });

  describe('parseModelKey (via getLatestMajorVersionModelIds)', () => {
    it('should return empty array when no active models exist', async () => {
      const mockModelsService = {
        findAllActive: vi.fn().mockResolvedValue([]),
      };
      mockModuleRef.get.mockReturnValue(mockModelsService);

      const result = await service.getLatestMajorVersionModelIds();

      expect(result).toEqual([]);
    });

    it('should filter to latest major version models', async () => {
      const modelV2 = { _id: 'test-object-id', key: 'google/veo-2' };
      const modelV3 = { _id: 'test-object-id', key: 'google/veo-3' };
      const imageModel = {
        _id: 'test-object-id',
        key: 'google/imagen-4-fast',
      };

      const mockModelsService = {
        findAllActive: vi
          .fn()
          .mockResolvedValue([modelV2, modelV3, imageModel]),
      };
      mockModuleRef.get.mockReturnValue(mockModelsService);

      const result = await service.getLatestMajorVersionModelIds();

      // veo-2 should be filtered out since veo-3 is newer
      const resultStrings = result.map((id) => id.toString());
      expect(resultStrings).toContain(modelV3._id.toString());
      expect(resultStrings).not.toContain(modelV2._id.toString());
      expect(resultStrings).toContain(imageModel._id.toString());
    });

    it('should handle models with minor versions', async () => {
      const modelV3 = { _id: 'test-object-id', key: 'google/veo-3' };
      const modelV31 = { _id: 'test-object-id', key: 'google/veo-3.1' };

      const mockModelsService = {
        findAllActive: vi.fn().mockResolvedValue([modelV3, modelV31]),
      };
      mockModuleRef.get.mockReturnValue(mockModelsService);

      const result = await service.getLatestMajorVersionModelIds();

      // Both should be included since they share the same major version 3
      expect(result).toHaveLength(2);
    });

    it('should handle models without version numbers', async () => {
      const model = { _id: 'test-object-id', key: 'openai/dalle' };

      const mockModelsService = {
        findAllActive: vi.fn().mockResolvedValue([model]),
      };
      mockModuleRef.get.mockReturnValue(mockModelsService);

      const result = await service.getLatestMajorVersionModelIds();

      expect(result).toHaveLength(1);
    });
  });

  describe('inherited BaseService methods', () => {
    it('should have findOne method from BaseService', () => {
      expect(typeof service.findOne).toBe('function');
    });

    it('should have patch method from BaseService', () => {
      expect(typeof service.patch).toBe('function');
    });
  });
});

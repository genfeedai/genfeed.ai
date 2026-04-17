import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { createMockModel } from '@api/shared/testing/mock-model.factory';
import { type OrganizationSetting } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { ModuleRef } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';

describe('OrganizationSettingsService', () => {
  let service: OrganizationSettingsService;
  let mockModel: ReturnType<typeof createMockModel>;
  let mockModuleRef: Record<string, ReturnType<typeof vi.fn>>;

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
      get: vi.fn().mockReturnValue({
        findAllActive: vi.fn().mockResolvedValue([]),
      }),
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
    it('should update brandsLimit and return updated document', async () => {
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
    it('should update seatsLimit and return updated document', async () => {
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

    it('should return null when setting not found for seats update', async () => {
      mockModel.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });

      const result = await service.updateSeatsLimit('nonexistent', 5);

      expect(result).toBeNull();
    });
  });

  describe('getLatestMajorVersionModelIds', () => {
    it('should return empty array when no active models exist', async () => {
      mockModuleRef.get.mockReturnValue({
        findAllActive: vi.fn().mockResolvedValue([]),
      });

      const result = await service.getLatestMajorVersionModelIds();

      expect(result).toEqual([]);
    });

    it('should return all model IDs when no version conflicts', async () => {
      const model1Id = 'test-object-id';
      const model2Id = 'test-object-id';
      mockModuleRef.get.mockReturnValue({
        findAllActive: vi.fn().mockResolvedValue([
          { _id: model1Id, key: 'openai/dall-e-3' },
          { _id: model2Id, key: 'google/imagen-4' },
        ]),
      });

      const result = await service.getLatestMajorVersionModelIds();

      expect(result).toHaveLength(2);
      expect(result[0].toString()).toBe(model1Id.toString());
      expect(result[1].toString()).toBe(model2Id.toString());
    });

    it('should filter out older major versions', async () => {
      const oldId = 'test-object-id';
      const newId = 'test-object-id';
      mockModuleRef.get.mockReturnValue({
        findAllActive: vi.fn().mockResolvedValue([
          { _id: oldId, key: 'google/veo-2' },
          { _id: newId, key: 'google/veo-3' },
        ]),
      });

      const result = await service.getLatestMajorVersionModelIds();

      expect(result).toHaveLength(1);
      expect(result[0].toString()).toBe(newId.toString());
    });

    it('should keep all minor versions of the latest major version', async () => {
      const id1 = 'test-object-id';
      const id2 = 'test-object-id';
      const oldId = 'test-object-id';
      mockModuleRef.get.mockReturnValue({
        findAllActive: vi.fn().mockResolvedValue([
          { _id: oldId, key: 'google/veo-2' },
          { _id: id1, key: 'google/veo-3' },
          { _id: id2, key: 'google/veo-3.1' },
        ]),
      });

      const result = await service.getLatestMajorVersionModelIds();

      expect(result).toHaveLength(2);
      const resultStrings = result.map((id) => id.toString());
      expect(resultStrings).toContain(id1.toString());
      expect(resultStrings).toContain(id2.toString());
    });

    it('should return null from findAllActive gracefully', async () => {
      mockModuleRef.get.mockReturnValue({
        findAllActive: vi.fn().mockResolvedValue(null),
      });

      const result = await service.getLatestMajorVersionModelIds();

      expect(result).toEqual([]);
    });
  });

  describe('inherited BaseService methods', () => {
    it('should create a new organization setting', async () => {
      const result = await service.create({
        brandsLimit: 5,
        organization: 'test-object-id',
      } as never);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('_id');
    });

    it('should find a setting by filter', async () => {
      const settingDoc = {
        _id: 'test-object-id',
        brandsLimit: 5,
      };
      mockModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(settingDoc),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.findOne({
        _id: settingDoc._id.toString(),
      });

      expect(result).toEqual(settingDoc);
    });
  });
});

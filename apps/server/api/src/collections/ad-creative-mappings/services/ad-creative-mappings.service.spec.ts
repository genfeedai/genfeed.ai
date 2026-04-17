import {
  AdCreativeMapping,
  type AdCreativeMappingDocument,
} from '@api/collections/ad-creative-mappings/schemas/ad-creative-mapping.schema';
import { AdCreativeMappingsService } from '@api/collections/ad-creative-mappings/services/ad-creative-mappings.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('AdCreativeMappingsService', () => {
  let service: AdCreativeMappingsService;
  let mockModel: Record<string, vi.Mock>;
  let loggerService: vi.Mocked<LoggerService>;

  const mockOrgId = 'test-object-id'.toString();
  const mockBrandId = 'test-object-id'.toString();
  const mockMappingId = 'test-object-id'.toString();

  const mockMapping: Partial<AdCreativeMappingDocument> = {
    _id: new string(mockMappingId),
    adAccountId: 'act_123456789',
    brand: new string(mockBrandId),
    externalAdId: 'ad_001',
    externalCreativeId: 'creative_001',
    genfeedContentId: 'content_123',
    isDeleted: false,
    metadata: { source: 'pipeline' },
    organization: new string(mockOrgId),
    platform: 'meta',
    status: 'active',
  };

  const createChainMock = (returnValue: unknown) => {
    const chain = {
      exec: vi.fn().mockResolvedValue(returnValue),
      lean: vi.fn(),
    };
    chain.lean.mockReturnValue(chain);
    return chain;
  };

  beforeEach(async () => {
    const findOneChain = createChainMock(mockMapping);
    const findChain = createChainMock([mockMapping]);
    const findOneAndUpdateChain = createChainMock(mockMapping);
    const deleteChain = createChainMock(mockMapping);

    mockModel = {
      create: vi.fn().mockResolvedValue(mockMapping),
      find: vi.fn().mockReturnValue(findChain),
      findOne: vi.fn().mockReturnValue(findOneChain),
      findOneAndUpdate: vi.fn().mockReturnValue(findOneAndUpdateChain),
    };

    const mockLoggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdCreativeMappingsService,
        { provide: PrismaService, useValue: mockModel },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<AdCreativeMappingsService>(AdCreativeMappingsService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a mapping with all fields', async () => {
      const input = {
        adAccountId: 'act_123456789',
        brand: mockBrandId,
        externalAdId: 'ad_001',
        externalCreativeId: 'creative_001',
        genfeedContentId: 'content_123',
        metadata: { source: 'pipeline' },
        organization: mockOrgId,
        platform: 'meta' as const,
        status: 'active' as const,
      };

      const result = await service.create(input);

      expect(mockModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          adAccountId: 'act_123456789',
          externalAdId: 'ad_001',
          genfeedContentId: 'content_123',
          platform: 'meta',
          status: 'active',
        }),
      );
      expect(result).toBeDefined();
      expect(loggerService.log).toHaveBeenCalled();
    });

    it('should default platform to meta', async () => {
      await service.create({
        adAccountId: 'act_123',
        genfeedContentId: 'content_456',
        organization: mockOrgId,
      });

      expect(mockModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: 'meta',
          status: 'draft',
        }),
      );
    });

    it('should convert organization string to ObjectId', async () => {
      await service.create({
        adAccountId: 'act_123',
        genfeedContentId: 'content_789',
        organization: mockOrgId,
      });

      const calledWith = mockModel.create.mock.calls[0][0];
      expect(calledWith.organization).toBeInstanceOf(string);
    });

    it('should throw and log error on failure', async () => {
      mockModel.create.mockRejectedValue(new Error('DB error'));

      await expect(
        service.create({
          adAccountId: 'act_123',
          genfeedContentId: 'content_fail',
          organization: mockOrgId,
        }),
      ).rejects.toThrow('DB error');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should find mapping by id and organization', async () => {
      const result = await service.findById(mockMappingId, mockOrgId);

      expect(mockModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: expect.any(string),
          isDeleted: false,
          organization: expect.any(string),
        }),
      );
      expect(result).toBeDefined();
    });

    it('should return null when not found', async () => {
      const nullChain = createChainMock(null);
      mockModel.findOne.mockReturnValue(nullChain);

      const result = await service.findById(
        'test-object-id'.toString(),
        mockOrgId,
      );

      expect(result).toBeNull();
    });
  });

  describe('findByContentId', () => {
    it('should find mappings by content ID and organization', async () => {
      const result = await service.findByContentId('content_123', mockOrgId);

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          genfeedContentId: 'content_123',
          isDeleted: false,
          organization: expect.any(string),
        }),
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('findByExternalAdId', () => {
    it('should find mapping by external ad ID and organization', async () => {
      const result = await service.findByExternalAdId('ad_001', mockOrgId);

      expect(mockModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          externalAdId: 'ad_001',
          isDeleted: false,
          organization: expect.any(string),
        }),
      );
      expect(result).toBeDefined();
    });
  });

  describe('findByAdAccount', () => {
    it('should find mappings by ad account and organization', async () => {
      const result = await service.findByAdAccount('act_123456789', mockOrgId);

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          adAccountId: 'act_123456789',
          isDeleted: false,
          organization: expect.any(string),
        }),
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('should update mapping fields', async () => {
      const result = await service.update(mockMappingId, mockOrgId, {
        externalAdId: 'ad_002',
        status: 'paused',
      });

      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: expect.any(string),
          isDeleted: false,
          organization: expect.any(string),
        }),
        { $set: { externalAdId: 'ad_002', status: 'paused' } },
        { new: true },
      );
      expect(result).toBeDefined();
      expect(loggerService.log).toHaveBeenCalled();
    });

    it('should return null when mapping not found', async () => {
      const nullChain = createChainMock(null);
      mockModel.findOneAndUpdate.mockReturnValue(nullChain);

      const result = await service.update(
        'test-object-id'.toString(),
        mockOrgId,
        { status: 'archived' },
      );

      expect(result).toBeNull();
    });

    it('should throw and log error on failure', async () => {
      const errorChain = createChainMock(null);
      errorChain.exec.mockRejectedValue(new Error('Update failed'));
      mockModel.findOneAndUpdate.mockReturnValue(errorChain);

      await expect(
        service.update(mockMappingId, mockOrgId, { status: 'active' }),
      ).rejects.toThrow('Update failed');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('should set isDeleted to true', async () => {
      const execMock = vi.fn().mockResolvedValue(mockMapping);
      mockModel.findOneAndUpdate.mockReturnValue({ exec: execMock });

      const result = await service.softDelete(mockMappingId, mockOrgId);

      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: expect.any(string),
          isDeleted: false,
          organization: expect.any(string),
        }),
        { $set: { isDeleted: true } },
      );
      expect(result).toBe(true);
      expect(loggerService.log).toHaveBeenCalled();
    });

    it('should return false when mapping not found', async () => {
      const execMock = vi.fn().mockResolvedValue(null);
      mockModel.findOneAndUpdate.mockReturnValue({ exec: execMock });

      const result = await service.softDelete(
        'test-object-id'.toString(),
        mockOrgId,
      );

      expect(result).toBe(false);
    });

    it('should throw and log error on failure', async () => {
      const execMock = vi.fn().mockRejectedValue(new Error('Delete failed'));
      mockModel.findOneAndUpdate.mockReturnValue({ exec: execMock });

      await expect(
        service.softDelete(mockMappingId, mockOrgId),
      ).rejects.toThrow('Delete failed');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });
});

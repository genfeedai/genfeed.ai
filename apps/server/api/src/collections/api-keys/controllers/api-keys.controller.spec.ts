import { ApiKeysController } from '@api/collections/api-keys/controllers/api-keys.controller';
import type { CreateApiKeyDto } from '@api/collections/api-keys/dto/create-api-key.dto';
import type { UpdateApiKeyDto } from '@api/collections/api-keys/dto/update-api-key.dto';
import { type ApiKey } from '@api/collections/api-keys/schemas/api-key.schema';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import type { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { User } from '@clerk/backend';
import { ApiKeyCategory } from '@genfeedai/enums';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('ApiKeysController', () => {
  let controller: ApiKeysController;
  let service: ApiKeysService;

  const mockRequest = {} as Request;

  const mockUser: User = {
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockApiKey: ApiKey = {
    _id: '507f1f77bcf86cd799439014',
    allowedIps: [],
    category: ApiKeyCategory.GENFEEDAI,
    createdAt: new Date(),
    description: 'A test API key',
    expiresAt: new Date(Date.now() + 86400000),
    hashedKey: 'hashed_key_value',
    isRevoked: false,
    key: 'hashed_key_value',
    label: 'Test API Key',
    organization: '507f1f77bcf86cd799439012',
    scopes: ['read', 'write'],
    updatedAt: new Date(),
    usageCount: 0,
    user: '507f1f77bcf86cd799439011',
  } as ApiKey;

  const mockApiKeysService = {
    create: vi.fn(),
    createWithKey: vi.fn(),
    findAll: vi.fn(),
    findByKey: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
    remove: vi.fn(),
    revoke: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApiKeysController],
      providers: [
        {
          provide: ApiKeysService,
          useValue: mockApiKeysService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ApiKeysController>(ApiKeysController);
    service = module.get<ApiKeysService>(ApiKeysService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create an API key', async () => {
      const createApiKeyDto: CreateApiKeyDto = {
        category: ApiKeyCategory.GENFEEDAI,
        description: 'A test API key',
        label: 'Test API Key',
        scopes: ['read', 'write'],
      };

      mockApiKeysService.findAll.mockResolvedValue({
        docs: [],
        limit: 100,
        page: 1,
        totalDocs: 0,
        totalPages: 0,
      });

      const plainKey = 'plain_api_key_12345';
      mockApiKeysService.createWithKey.mockResolvedValue({
        apiKey: { ...mockApiKey, toObject: () => mockApiKey },
        plainKey,
      });

      const result = await controller.create(
        mockRequest,
        mockUser,
        createApiKeyDto,
      );

      expect(service.createWithKey).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw error when API key limit reached', async () => {
      const createApiKeyDto: CreateApiKeyDto = {
        category: ApiKeyCategory.GENFEEDAI,
        description: 'A test API key',
        label: 'Test API Key',
        scopes: ['read', 'write'],
      };

      mockApiKeysService.findAll.mockResolvedValue({
        docs: Array(10).fill(mockApiKey),
        limit: 100,
        page: 1,
        totalDocs: 10,
        totalPages: 1,
      });

      await expect(
        controller.create(mockRequest, mockUser, createApiKeyDto),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('findAll', () => {
    it('should return array of API keys', async () => {
      const apiKeys = [mockApiKey];
      mockApiKeysService.findAll.mockResolvedValue({
        docs: apiKeys,
        limit: 10,
        page: 1,
        totalDocs: 1,
        totalPages: 1,
      });

      const query: BaseQueryDto = {
        isDeleted: false,
        limit: 10,
        page: 1,
        pagination: true,
        sort: 'createdAt: -1',
      };

      const result = await controller.findAll(mockRequest, mockUser, query);

      expect(service.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should filter by label', async () => {
      mockApiKeysService.findAll.mockResolvedValue({
        docs: [mockApiKey],
        limit: 10,
        page: 1,
        totalDocs: 1,
        totalPages: 1,
      });

      const query = {
        isDeleted: false,
        label: 'Test',
        limit: 10,
        page: 1,
        pagination: true,
        sort: 'createdAt: -1',
      } as unknown as BaseQueryDto;

      const result = await controller.findAll(mockRequest, mockUser, query);

      expect(service.findAll).toHaveBeenCalled();
      expect(result.data).toBeDefined();
    });
  });

  describe('findMCPKeys', () => {
    it('should return MCP API keys', async () => {
      const mcpKey = { ...mockApiKey, label: 'MCP Key' };
      mockApiKeysService.findAll.mockResolvedValue({
        docs: [mcpKey],
        limit: 100,
        page: 1,
        totalDocs: 1,
        totalPages: 1,
      });

      const result = await controller.findMCPKeys(mockRequest, mockUser);

      expect(service.findAll).toHaveBeenCalled();
      expect(result.data).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('should return an API key by id', async () => {
      const id = '507f1f77bcf86cd799439014';
      mockApiKeysService.findOne.mockResolvedValue(mockApiKey);

      const result = await controller.findOne(mockRequest, mockUser, id);

      expect(service.findOne).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when API key not found', async () => {
      const id = '507f1f77bcf86cd799439014';
      mockApiKeysService.findOne.mockResolvedValue(null);

      await expect(
        controller.findOne(mockRequest, mockUser, id),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('update', () => {
    it('should update an API key', async () => {
      const id = '507f1f77bcf86cd799439014';
      const updateApiKeyDto: UpdateApiKeyDto = {
        isDeleted: false,
        label: 'Updated API Key',
      };

      mockApiKeysService.findOne.mockResolvedValue(mockApiKey);
      const updatedKey = { ...mockApiKey, ...updateApiKeyDto };
      mockApiKeysService.patch.mockResolvedValue(updatedKey);

      const result = await controller.update(
        mockRequest,
        mockUser,
        id,
        updateApiKeyDto,
      );

      expect(service.patch).toHaveBeenCalledWith(id, updateApiKeyDto);
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when API key not found', async () => {
      const id = '507f1f77bcf86cd799439014';
      const updateApiKeyDto: UpdateApiKeyDto = {
        isDeleted: false,
        label: 'Updated API Key',
      };

      mockApiKeysService.findOne.mockResolvedValue(null);

      await expect(
        controller.update(mockRequest, mockUser, id, updateApiKeyDto),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('revoke', () => {
    it('should revoke an API key', async () => {
      const id = '507f1f77bcf86cd799439014';
      mockApiKeysService.findOne.mockResolvedValue(mockApiKey);
      const revokedKey = { ...mockApiKey, isRevoked: true };
      mockApiKeysService.revoke.mockResolvedValue(revokedKey);

      const result = await controller.revoke(mockRequest, mockUser, id);

      expect(service.revoke).toHaveBeenCalledWith(id);
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when API key not found', async () => {
      const id = '507f1f77bcf86cd799439014';
      mockApiKeysService.findOne.mockResolvedValue(null);

      await expect(
        controller.revoke(mockRequest, mockUser, id),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('validate', () => {
    it('should validate an API key', async () => {
      const key = 'test_api_key';
      mockApiKeysService.findByKey.mockResolvedValue(mockApiKey);

      const result = await controller.validate({ key });

      expect(service.findByKey).toHaveBeenCalledWith(key);
      expect(result.valid).toBe(true);
      expect(result.label).toBe(mockApiKey.label);
    });

    it('should return invalid for non-existent key', async () => {
      const key = 'invalid_key';
      mockApiKeysService.findByKey.mockResolvedValue(null);

      const result = await controller.validate({ key });

      expect(result.valid).toBe(false);
    });
  });
});

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs || data,
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

import { PatternsController } from '@api/collections/content-intelligence/controllers/patterns.controller';
import { PatternStoreService } from '@api/collections/content-intelligence/services/pattern-store.service';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { Types } from 'mongoose';

describe('PatternsController', () => {
  let controller: PatternsController;

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/content-intelligence/patterns',
    query: {},
  } as Request;

  const mockPattern = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439015'),
    description: 'Test pattern',
    organization: new Types.ObjectId('507f1f77bcf86cd799439012'),
    patternType: 'hook',
    platform: 'twitter',
  };

  const mockPatternStoreService = {
    findAll: vi.fn(),
    findHooks: vi.fn(),
    findOne: vi.fn(),
    remove: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PatternsController],
      providers: [
        { provide: PatternStoreService, useValue: mockPatternStoreService },
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

    controller = module.get<PatternsController>(PatternsController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return patterns for organization', async () => {
      mockPatternStoreService.findAll.mockResolvedValue({
        docs: [mockPattern],
      });

      await controller.findAll(mockRequest, mockUser, {} as any);

      expect(mockPatternStoreService.findAll).toHaveBeenCalled();
    });
  });

  describe('findHooks', () => {
    it('should return hooks for organization', async () => {
      mockPatternStoreService.findHooks.mockResolvedValue([mockPattern]);

      await controller.findHooks(mockRequest, mockUser, {} as any);

      expect(mockPatternStoreService.findHooks).toHaveBeenCalledWith(
        new Types.ObjectId('507f1f77bcf86cd799439012'),
        undefined,
        50,
      );
    });

    it('should pass platform and limit', async () => {
      mockPatternStoreService.findHooks.mockResolvedValue([]);

      await controller.findHooks(mockRequest, mockUser, {
        limit: 10,
        platform: 'twitter',
      } as any);

      expect(mockPatternStoreService.findHooks).toHaveBeenCalledWith(
        new Types.ObjectId('507f1f77bcf86cd799439012'),
        'twitter',
        10,
      );
    });
  });

  describe('findTemplates', () => {
    it('should return templates for organization', async () => {
      mockPatternStoreService.findAll.mockResolvedValue({ docs: [] });

      await controller.findTemplates(mockRequest, mockUser, {} as any);

      expect(mockPatternStoreService.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a single pattern', async () => {
      mockPatternStoreService.findOne.mockResolvedValue(mockPattern);

      await controller.findOne(
        mockRequest,
        mockUser,
        '507f1f77bcf86cd799439015',
      );

      expect(mockPatternStoreService.findOne).toHaveBeenCalled();
    });

    it('should throw when pattern not found', async () => {
      mockPatternStoreService.findOne.mockResolvedValue(null);

      await expect(
        controller.findOne(mockRequest, mockUser, '507f1f77bcf86cd799439015'),
      ).rejects.toThrow(HttpException);
    });

    it('should throw for invalid ObjectId', async () => {
      await expect(
        controller.findOne(mockRequest, mockUser, 'invalid'),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('remove', () => {
    it('should remove a pattern', async () => {
      mockPatternStoreService.findOne.mockResolvedValue(mockPattern);
      mockPatternStoreService.remove.mockResolvedValue({
        ...mockPattern,
        isDeleted: true,
      });

      await controller.remove(
        mockRequest,
        mockUser,
        '507f1f77bcf86cd799439015',
      );

      expect(mockPatternStoreService.remove).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439015',
      );
    });

    it('should throw when pattern not found', async () => {
      mockPatternStoreService.findOne.mockResolvedValue(null);

      await expect(
        controller.remove(mockRequest, mockUser, '507f1f77bcf86cd799439015'),
      ).rejects.toThrow(HttpException);
    });
  });
});

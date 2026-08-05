vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn(
    (
      _req: unknown,
      serializer: { serialize(data: unknown): unknown },
      result: { docs?: unknown[] } | unknown[],
    ) => {
      const docs = Array.isArray(result) ? result : (result.docs ?? []);
      return { data: docs.map((doc) => serializer.serialize(doc)) };
    },
  ),
  serializeSingle: vi.fn(
    (
      _req: unknown,
      serializer: { serialize(data: unknown): unknown },
      data: unknown,
    ) => ({ data: serializer.serialize(data) }),
  ),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PatternsController } from '@api/collections/content-intelligence/controllers/patterns.controller';
import type { PatternsQueryDto } from '@api/collections/content-intelligence/dto/patterns-query.dto';
import { PatternStoreService } from '@api/collections/content-intelligence/services/pattern-store.service';
import { ContentPatternType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

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
    data: {
      description: 'Test pattern',
      patternType: ContentPatternType.HOOK,
      platform: 'twitter',
    },
    id: '507f1f77bcf86cd799439015',
    organizationId: '507f1f77bcf86cd799439012',
    sourceCreatorId: '507f1f77bcf86cd799439016',
  };

  const mockPatternStoreService = {
    findAll: vi.fn(),
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

      await controller.findAll(
        mockRequest,
        mockUser,
        {} satisfies PatternsQueryDto,
      );

      expect(mockPatternStoreService.findAll).toHaveBeenCalled();
    });

    it('should filter by patternType=hook', async () => {
      mockPatternStoreService.findAll.mockResolvedValue({
        docs: [mockPattern],
      });

      await controller.findAll(mockRequest, mockUser, {
        patternType: ContentPatternType.HOOK,
      } satisfies PatternsQueryDto);

      expect(mockPatternStoreService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              { data: { equals: 'hook', path: ['patternType'] } },
            ]),
          }),
        }),
        expect.anything(),
      );
    });

    it('should filter by patternType=template', async () => {
      mockPatternStoreService.findAll.mockResolvedValue({ docs: [] });

      await controller.findAll(mockRequest, mockUser, {
        patternType: ContentPatternType.TEMPLATE,
      } satisfies PatternsQueryDto);

      expect(mockPatternStoreService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              { data: { equals: 'template', path: ['patternType'] } },
            ]),
          }),
        }),
        expect.anything(),
      );
    });

    it('should filter by canonical source creator ID', async () => {
      mockPatternStoreService.findAll.mockResolvedValue({ docs: [] });

      await controller.findAll(mockRequest, mockUser, {
        sourceCreatorId: '507f1f77bcf86cd799439016',
      } satisfies PatternsQueryDto);

      expect(mockPatternStoreService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sourceCreatorId: '507f1f77bcf86cd799439016',
          }),
        }),
        expect.anything(),
      );
    });
  });

  describe('findOne', () => {
    it('should return a single pattern', async () => {
      mockPatternStoreService.findOne.mockResolvedValue(mockPattern);

      const result = await controller.findOne(
        mockRequest,
        mockUser,
        '507f1f77bcf86cd799439015',
      );

      expect(mockPatternStoreService.findOne).toHaveBeenCalled();
      expect(result).toEqual({
        data: expect.objectContaining({
          attributes: expect.objectContaining({
            description: 'Test pattern',
            sourceCreatorId: '507f1f77bcf86cd799439016',
          }),
          id: '507f1f77bcf86cd799439015',
        }),
      });
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

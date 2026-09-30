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
import { ContentPatternType } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('PatternsController', () => {
  let controller: PatternsController;

  const organizationId = testId('org');
  const sourceCreatorId = testId('creator');
  const patternId = testId('pattern');
  const missingPatternId = testId('pattern', 2);

  const mockUser = {
    id: 'user_123',
    brandId: testId('brand'),
    organizationId,
    userId: testId('user'),
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
    id: patternId,
    organizationId,
    sourceCreatorId,
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
        sourceCreatorId,
      } satisfies PatternsQueryDto);

      expect(mockPatternStoreService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sourceCreatorId,
          }),
        }),
        expect.anything(),
      );
    });
  });

  describe('findOne', () => {
    it('should return a single pattern', async () => {
      mockPatternStoreService.findOne.mockResolvedValue(mockPattern);

      const result = await controller.findOne(mockRequest, mockUser, patternId);

      expect(mockPatternStoreService.findOne).toHaveBeenCalled();
      expect(result).toEqual({
        data: expect.objectContaining({
          attributes: expect.objectContaining({
            description: 'Test pattern',
            sourceCreatorId,
          }),
          id: patternId,
        }),
      });
    });

    it('should throw when pattern not found', async () => {
      mockPatternStoreService.findOne.mockResolvedValue(null);

      await expect(
        controller.findOne(mockRequest, mockUser, missingPatternId),
      ).rejects.toThrow(HttpException);
    });

    it('should throw for an invalid entity ID', async () => {
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

      await controller.remove(mockRequest, mockUser, patternId);

      expect(mockPatternStoreService.remove).toHaveBeenCalledWith(patternId);
    });

    it('should throw when pattern not found', async () => {
      mockPatternStoreService.findOne.mockResolvedValue(null);

      await expect(
        controller.remove(mockRequest, mockUser, missingPatternId),
      ).rejects.toThrow(HttpException);
    });
  });
});

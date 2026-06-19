import { MoodBoardsController } from '@api/collections/mood-boards/controllers/mood-boards.controller';
import { UpdateMoodBoardDto } from '@api/collections/mood-boards/dto/update-mood-board.dto';
import { MoodBoardsService } from '@api/collections/mood-boards/services/mood-boards.service';
import { LoggerService } from '@libs/logger/logger.service';
import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/serializers', () => ({
  MoodBoardSerializer: {
    serialize: vi.fn((data: unknown) => ({ data })),
  },
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((name: string, id: string) => ({
    error: `${name}:${id}`,
  })),
  serializeSingle: vi.fn(
    (_req: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
}));

const mockMoodBoard = {
  brandId: 'brand-1',
  createdAt: new Date(),
  id: 'mb-1',
  isDeleted: false,
  layout: [],
  metadata: null,
  organizationId: 'org-1',
  updatedAt: new Date(),
};

const mockRequest = {
  headers: {},
  protocol: 'http',
  get: vi.fn().mockReturnValue('localhost'),
};

describe('MoodBoardsController', () => {
  let controller: MoodBoardsController;
  let service: vi.Mocked<MoodBoardsService>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const mockService = {
      findOne: vi.fn(),
      findOrCreateByBrand: vi.fn(),
      patch: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MoodBoardsController],
      providers: [
        { provide: MoodBoardsService, useValue: mockService },
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

    controller = module.get<MoodBoardsController>(MoodBoardsController);
    service = module.get(MoodBoardsService) as vi.Mocked<MoodBoardsService>;
  });

  describe('findByBrand', () => {
    it('returns serialized board for valid brandId', async () => {
      service.findOrCreateByBrand.mockResolvedValueOnce(mockMoodBoard as never);

      const result = await controller.findByBrand(
        mockRequest as never,
        'brand-1',
      );

      expect(service.findOrCreateByBrand).toHaveBeenCalledWith('brand-1');
      expect(result).toBeDefined();
    });

    it('throws NotFoundException when brandId missing', async () => {
      await expect(
        controller.findByBrand(mockRequest as never, ''),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('patches board when found', async () => {
      const dto: UpdateMoodBoardDto = { layout: [] };
      service.findOne.mockResolvedValueOnce(mockMoodBoard as never);
      service.patch.mockResolvedValueOnce(mockMoodBoard as never);

      const result = await controller.update(mockRequest as never, 'mb-1', dto);

      expect(service.patch).toHaveBeenCalledWith('mb-1', dto);
      expect(result).toBeDefined();
    });

    it('returns not-found when board does not exist', async () => {
      service.findOne.mockResolvedValueOnce(null);

      const result = await controller.update(
        mockRequest as never,
        'missing-id',
        {} as UpdateMoodBoardDto,
      );

      expect(result).toEqual({ error: 'MoodBoardsController:missing-id' });
      expect(service.patch).not.toHaveBeenCalled();
    });
  });
});

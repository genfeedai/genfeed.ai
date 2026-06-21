import { MoodBoardsService } from '@api/collections/mood-boards/services/mood-boards.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const mockPrisma = {
  brand: {
    findFirst: vi.fn(),
  },
  moodBoard: {
    findMany: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
};

const mockLogger = {
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
};

describe('MoodBoardsService', () => {
  let service: MoodBoardsService;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MoodBoardsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<MoodBoardsService>(MoodBoardsService);
  });

  describe('findOrCreateByBrand', () => {
    it('returns existing board via upsert when brand exists', async () => {
      mockPrisma.brand.findFirst.mockResolvedValueOnce({
        organizationId: 'org-1',
      });
      mockPrisma.moodBoard.upsert.mockResolvedValueOnce(mockMoodBoard);

      const result = await service.findOrCreateByBrand('brand-1');

      expect(result).toEqual(mockMoodBoard);
      expect(mockPrisma.moodBoard.upsert).toHaveBeenCalledWith({
        create: {
          brandId: 'brand-1',
          layout: [],
          organizationId: 'org-1',
        },
        update: {},
        where: { brandId: 'brand-1' },
      });
    });

    it('creates board when none exists for brand', async () => {
      const newBoard = { ...mockMoodBoard, id: 'mb-new' };
      mockPrisma.brand.findFirst.mockResolvedValueOnce({
        organizationId: 'org-1',
      });
      mockPrisma.moodBoard.upsert.mockResolvedValueOnce(newBoard);

      const result = await service.findOrCreateByBrand('brand-1');

      expect(result).toEqual(newBoard);
    });

    it('throws NotFoundException when brand not found', async () => {
      mockPrisma.brand.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.findOrCreateByBrand('missing-brand'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

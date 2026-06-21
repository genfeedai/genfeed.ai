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

      const result = await service.findOrCreateByBrand('brand-1', 'org-1');

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

    it('scopes the brand lookup to the caller organization', async () => {
      mockPrisma.brand.findFirst.mockResolvedValueOnce({
        organizationId: 'org-1',
      });
      mockPrisma.moodBoard.upsert.mockResolvedValueOnce(mockMoodBoard);

      await service.findOrCreateByBrand('brand-1', 'org-1');

      expect(mockPrisma.brand.findFirst).toHaveBeenCalledWith({
        select: { organizationId: true },
        where: { id: 'brand-1', isDeleted: false, organizationId: 'org-1' },
      });
    });

    it('creates board when none exists for brand', async () => {
      const newBoard = { ...mockMoodBoard, id: 'mb-new' };
      mockPrisma.brand.findFirst.mockResolvedValueOnce({
        organizationId: 'org-1',
      });
      mockPrisma.moodBoard.upsert.mockResolvedValueOnce(newBoard);

      const result = await service.findOrCreateByBrand('brand-1', 'org-1');

      expect(result).toEqual(newBoard);
    });

    it('throws NotFoundException when brand not found', async () => {
      mockPrisma.brand.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.findOrCreateByBrand('missing-brand', 'org-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('denies cross-org access: a foreign org cannot read another org brand board', async () => {
      // The org-scoped where clause means a brand owned by org-1 is invisible
      // to a caller in org-2, so the lookup returns null and no board is
      // created or returned for the foreign caller.
      mockPrisma.brand.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.findOrCreateByBrand('brand-1', 'org-2'),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.brand.findFirst).toHaveBeenCalledWith({
        select: { organizationId: true },
        where: { id: 'brand-1', isDeleted: false, organizationId: 'org-2' },
      });
      expect(mockPrisma.moodBoard.upsert).not.toHaveBeenCalled();
    });
  });
});

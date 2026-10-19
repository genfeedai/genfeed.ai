import { AnnouncementsService } from '@api/collections/announcements/services/announcements.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

describe('AnnouncementsService.getAll', () => {
  it('pages announcements newest first in the database and reports the total', async () => {
    const rows = [{ id: 'a2' }, { id: 'a1' }];
    const delegate = {
      count: vi.fn().mockResolvedValue(23),
      findMany: vi.fn().mockResolvedValue(rows),
    };
    const prisma = { announcement: delegate } as unknown as PrismaService;
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;
    const service = new AnnouncementsService(prisma, logger);

    const result = await service.getAll(2, 10);

    expect(delegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }],
        skip: 10,
        take: 10,
        where: expect.objectContaining({ isDeleted: false }),
      }),
    );
    expect(delegate.count).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      limit: 10,
      page: 2,
      totalDocs: 23,
      totalPages: 3,
    });
  });
});

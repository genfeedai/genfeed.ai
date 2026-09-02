import { LinksService } from '@api/collections/links/services/links.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LinkCategory } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('LinksService', () => {
  const create = vi.fn();
  const update = vi.fn();
  let service: LinksService;

  beforeEach(() => {
    vi.clearAllMocks();
    const delegate = { create, update };
    const prisma = {
      link: delegate,
    } as unknown as PrismaService;
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;

    service = new LinksService(prisma, logger);
  });

  it('passes canonical brandId through on create', async () => {
    create.mockResolvedValue({
      brandId: 'brand_1',
      category: 'WEBSITE',
      id: 'link_1',
      isDeleted: false,
      label: 'Website',
      url: 'https://example.com',
    });

    await service.create({
      brandId: 'brand_1',
      category: LinkCategory.WEBSITE,
      label: 'Website',
      url: 'https://example.com',
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          brandId: 'brand_1',
          label: 'Website',
          url: 'https://example.com',
        }),
      }),
    );
  });

  it('passes canonical brandId through on patch', async () => {
    update.mockResolvedValue({
      brandId: 'brand_2',
      category: 'WEBSITE',
      id: 'link_1',
      isDeleted: false,
      label: 'Site',
      url: 'https://example.com',
    });

    await service.patch('link_1', {
      brandId: 'brand_2',
      label: 'Site',
    } as never);

    expect(update).toHaveBeenCalled();
    const call = update.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    };
    expect(call?.data).toEqual(
      expect.objectContaining({
        brandId: 'brand_2',
        label: 'Site',
      }),
    );
  });
});

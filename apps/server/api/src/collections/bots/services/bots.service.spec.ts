vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { BotsService } from '@api/collections/bots/services/bots.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';

describe('BotsService', () => {
  const create = vi.fn();
  const findFirst = vi.fn();
  const update = vi.fn();
  let service: BotsService;

  beforeEach(() => {
    vi.clearAllMocks();

    service = new BotsService(
      { bot: { create, findFirst, update } } as unknown as PrismaService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
    );
  });

  it('writes scalar ownership and packs config-backed fields', async () => {
    create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'bot-1',
        ...data,
      }),
    );

    await service.create({
      brandId: 'brand-1',
      category: 'livestream' as never,
      description: 'Answers livestream questions',
      label: 'Live assistant',
      livestreamSettings: { transcriptEnabled: true },
      organizationId: 'organization-1',
      platforms: ['youtube' as never],
      userId: 'user-1',
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        brandId: 'brand-1',
        category: 'livestream',
        config: {
          description: 'Answers livestream questions',
          livestreamSettings: { transcriptEnabled: true },
        },
        label: 'Live assistant',
        organizationId: 'organization-1',
        platforms: ['youtube'],
        userId: 'user-1',
      }),
    });
    const data = create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data).not.toHaveProperty('brand');
    expect(data).not.toHaveProperty('organization');
    expect(data).not.toHaveProperty('user');
    expect(data).not.toHaveProperty('livestreamSettings');
  });

  it('rejects writes without canonical required ownership', () => {
    expect(() =>
      service.create({
        category: 'livestream' as never,
        label: 'Live assistant',
        platforms: ['youtube' as never],
      }),
    ).toThrow(BadRequestException);

    expect(create).not.toHaveBeenCalled();
  });

  it('merges config-backed patch fields without dropping stored config', async () => {
    findFirst.mockResolvedValue({
      config: {
        description: 'Old description',
        publishingSettings: { timezone: 'UTC' },
      },
      id: 'bot-1',
      organizationId: 'organization-1',
      userId: 'user-1',
    });
    update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'bot-1',
        organizationId: 'organization-1',
        userId: 'user-1',
        ...data,
      }),
    );

    await service.patch('bot-1', {
      description: 'New description',
      label: 'Renamed assistant',
    });

    expect(update).toHaveBeenCalledWith({
      data: {
        config: {
          description: 'New description',
          publishingSettings: { timezone: 'UTC' },
        },
        label: 'Renamed assistant',
      },
      where: { id: 'bot-1' },
    });
  });
});

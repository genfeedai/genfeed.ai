import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';

describe('BrandMemoryService typed entries', () => {
  const brandMemory = {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
  };
  const prisma = { brandMemory } as unknown as PrismaService;
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
  let service: BrandMemoryService;

  beforeEach(() => {
    vi.clearAllMocks();
    brandMemory.findMany.mockResolvedValue([]);
    service = new BrandMemoryService(prisma, logger);
  });

  it('creates a typed row scoped to the organization and brand', async () => {
    brandMemory.findFirst.mockResolvedValue(null);
    brandMemory.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'memory-1', ...data }),
    );

    await service.upsertTypedEntry('org-1', 'brand-1', {
      content: 'I ran finance at a startup.',
      metadata: { fieldKey: 'originStory' },
      type: 'positioning.originStory',
    });

    expect(brandMemory.findFirst).toHaveBeenCalledWith({
      orderBy: { updatedAt: 'desc' },
      where: {
        brandId: 'brand-1',
        isDeleted: false,
        organizationId: 'org-1',
        type: 'positioning.originStory',
      },
    });
    expect(brandMemory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        brandId: 'brand-1',
        content: 'I ran finance at a startup.',
        isDeleted: false,
        organizationId: 'org-1',
        type: 'positioning.originStory',
      }),
    });
  });

  it('overwrites the same typed row when the answer changes', async () => {
    brandMemory.findFirst.mockResolvedValue({
      content: 'First version',
      id: 'memory-1',
    });
    brandMemory.update.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'memory-1', ...data }),
    );

    await service.upsertTypedEntry('org-1', 'brand-1', {
      content: 'Second version',
      type: 'positioning.originStory',
    });

    expect(brandMemory.create).not.toHaveBeenCalled();
    expect(brandMemory.update).toHaveBeenCalledWith({
      data: expect.objectContaining({ content: 'Second version' }),
      where: { id: 'memory-1', isDeleted: false, organizationId: 'org-1' },
    });
  });

  it('lists typed rows by prefix, newest first', async () => {
    await service.listTypedEntries('org-1', 'brand-1', 'positioning.');

    expect(brandMemory.findMany).toHaveBeenCalledWith({
      orderBy: { updatedAt: 'desc' },
      where: {
        brandId: 'brand-1',
        isDeleted: false,
        organizationId: 'org-1',
        type: { startsWith: 'positioning.' },
      },
    });
  });
});

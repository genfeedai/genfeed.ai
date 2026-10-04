vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { PresetsService } from '@api/collections/presets/services/presets.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';

describe('PresetsService', () => {
  const create = vi.fn();
  const findFirst = vi.fn();
  const findMany = vi.fn();
  const findUnique = vi.fn();
  const update = vi.fn();
  let service: PresetsService;

  beforeEach(() => {
    vi.clearAllMocks();
    findFirst.mockResolvedValue(null);

    service = new PresetsService(
      {
        preset: { create, findFirst, findMany, findUnique, update },
      } as unknown as PrismaService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
    );
  });

  it('writes scalar scope fields and packs preset details into config', async () => {
    create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'preset-1',
        ...data,
      }),
    );

    await service.create({
      brandId: 'brand-1',
      camera: 'close-up',
      category: 'image' as never,
      description: 'Editorial portrait preset',
      key: 'editorial-portrait',
      label: 'Editorial Portrait',
      organizationId: 'organization-1',
      prompt: 'Editorial portrait with soft key light',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        brandId: 'brand-1',
        category: 'image',
        config: {
          camera: 'close-up',
          description: 'Editorial portrait preset',
          key: 'editorial-portrait',
          label: 'Editorial Portrait',
          prompt: 'Editorial portrait with soft key light',
        },
        organizationId: 'organization-1',
      },
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        config: { equals: 'editorial-portrait', path: ['key'] },
        isDeleted: false,
        organizationId: 'organization-1',
      },
    });
  });

  it('rejects a duplicate platform default key', async () => {
    findFirst.mockResolvedValue({ id: 'preset-2' });

    await expect(
      service.create({ key: 'editorial-portrait' } as never),
    ).rejects.toThrow("Preset with key 'editorial-portrait' already exists");
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        AND: [],
        config: { equals: 'editorial-portrait', path: ['key'] },
        isDeleted: false,
        organizationId: null,
      },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('resolves a key in the caller organization before platform defaults', async () => {
    findFirst.mockResolvedValueOnce({ id: 'own' });

    await expect(
      service.findByKey('editorial-portrait', 'organization-1'),
    ).resolves.toEqual({ id: 'own' });
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        config: { equals: 'editorial-portrait', path: ['key'] },
        isDeleted: false,
        organizationId: 'organization-1',
      },
    });
  });

  it('falls back to platform defaults and never runs an unscoped lookup', async () => {
    findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'default' });

    await expect(
      service.findByKey('editorial-portrait', 'organization-1'),
    ).resolves.toEqual({ id: 'default' });
    expect(findFirst).toHaveBeenLastCalledWith({
      where: {
        AND: [],
        config: { equals: 'editorial-portrait', path: ['key'] },
        isDeleted: false,
        organizationId: null,
      },
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('throws when neither scope has the key', async () => {
    await expect(
      service.findByKey('missing', 'organization-1'),
    ).rejects.toThrow();
  });

  it('merges config-backed updates without dropping stored preset details', async () => {
    findUnique.mockResolvedValue({
      config: {
        key: 'editorial-portrait',
        label: 'Editorial Portrait',
        prompt: 'Old prompt',
      },
      id: 'preset-1',
    });
    findFirst.mockResolvedValue({
      config: {
        key: 'editorial-portrait',
        label: 'Editorial Portrait',
        prompt: 'Old prompt',
      },
      id: 'preset-1',
    });
    update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'preset-1',
        ...data,
      }),
    );

    await service.patch('preset-1', {
      label: 'Updated Editorial Portrait',
    });

    expect(update).toHaveBeenCalledWith({
      data: {
        config: {
          key: 'editorial-portrait',
          label: 'Updated Editorial Portrait',
          prompt: 'Old prompt',
        },
      },
      where: { id: 'preset-1' },
    });
  });
});

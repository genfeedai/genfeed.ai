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
      },
    });
  });

  it('finds a preset key without materializing the preset table', async () => {
    findFirst.mockResolvedValue({ id: 'preset-1' });

    await expect(service.findByKey('editorial-portrait')).resolves.toEqual({
      id: 'preset-1',
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        config: { equals: 'editorial-portrait', path: ['key'] },
        isDeleted: false,
      },
    });
    expect(findMany).not.toHaveBeenCalled();
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

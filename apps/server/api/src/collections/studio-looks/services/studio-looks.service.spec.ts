vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { StudioLooksService } from '@api/collections/studio-looks/services/studio-looks.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { RouterPriority } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const scope = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'opaque-user-id',
};

const createDto = {
  assetType: 'video' as const,
  camera: 'camera-1',
  cameraMovement: 'move-1',
  label: 'Cinematic',
  lens: 'lens-1',
  lighting: 'lighting-1',
  mood: 'mood-1',
  promptTemplate: 'preset-1',
  scene: 'scene-1',
  style: 'style-1',
};

const setupFieldsDto = {
  ...createDto,
  aspectRatio: '16:9',
  brandingMode: 'brand' as const,
  duration: 5,
  isPromptEnhanceEnabled: true,
  modelKey: 'replicate/model-key',
  outputs: 4,
  prioritize: RouterPriority.QUALITY,
  resolution: '1080p',
};

const row = {
  ...createDto,
  ...scope,
  createdAt: new Date(),
  id: 'look-1',
  isDeleted: false,
  updatedAt: new Date(),
};

describe('StudioLooksService', () => {
  const brand = { findFirst: vi.fn() };
  const studioLook = {
    count: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  };
  let service: StudioLooksService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new StudioLooksService(
      { brand, studioLook } as unknown as PrismaService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
    );
  });

  it('lists only live Looks in the authenticated organization and active brand', async () => {
    studioLook.findMany.mockResolvedValueOnce([row]);
    studioLook.count.mockResolvedValueOnce(1);

    await service.listScoped(scope, 'video', { limit: 20, page: 1 });

    expect(studioLook.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          assetType: 'video',
          brandId: 'brand-1',
          isDeleted: false,
          organizationId: 'org-1',
        },
      }),
    );
    expect(studioLook.count).toHaveBeenCalledWith({
      where: {
        assetType: 'video',
        brandId: 'brand-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('creates with server-owned scope and keeps video camera movement', async () => {
    brand.findFirst.mockResolvedValueOnce({ id: 'brand-1' });
    studioLook.create.mockResolvedValueOnce(row);

    await service.createScoped(createDto, scope);

    expect(brand.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: { id: 'brand-1', isDeleted: false, organizationId: 'org-1' },
    });
    expect(studioLook.create).toHaveBeenCalledWith({
      data: {
        ...createDto,
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'opaque-user-id',
      },
    });
  });

  it('persists the widened Generation Setup fields on create', async () => {
    brand.findFirst.mockResolvedValueOnce({ id: 'brand-1' });
    studioLook.create.mockResolvedValueOnce({ ...row, ...setupFieldsDto });

    await service.createScoped(setupFieldsDto, scope);

    expect(studioLook.create).toHaveBeenCalledWith({
      data: {
        ...setupFieldsDto,
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'opaque-user-id',
      },
    });
  });

  it('persists the widened Generation Setup fields on update', async () => {
    const patch = {
      aspectRatio: '9:16',
      isPromptEnhanceEnabled: false,
      modelKey: '',
      outputs: 1,
      prioritize: RouterPriority.SPEED,
    };
    studioLook.findFirst
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce({ ...row, ...patch });
    studioLook.updateMany.mockResolvedValueOnce({ count: 1 });

    await service.updateScoped('look-1', patch, scope);

    expect(studioLook.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining(patch) }),
    );
  });

  it('rejects create when the active brand is outside the organization', async () => {
    brand.findFirst.mockResolvedValueOnce(null);

    await expect(service.createScoped(createDto, scope)).rejects.toThrow(
      NotFoundException,
    );
    expect(studioLook.create).not.toHaveBeenCalled();
  });

  it('updates atomically inside the live organization and brand scope', async () => {
    studioLook.findFirst
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce({ ...row, label: 'Updated' });
    studioLook.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await service.updateScoped(
      'look-1',
      { label: 'Updated' },
      scope,
    );

    const where = {
      brandId: 'brand-1',
      id: 'look-1',
      isDeleted: false,
      organizationId: 'org-1',
    };
    expect(studioLook.findFirst).toHaveBeenNthCalledWith(1, { where });
    expect(studioLook.updateMany).toHaveBeenCalledWith({
      data: { label: 'Updated' },
      where,
    });
    expect(studioLook.findFirst).toHaveBeenNthCalledWith(2, { where });
    expect(result).toMatchObject({ label: 'Updated' });
  });

  it('clears camera movement when an updated Look becomes an image', async () => {
    studioLook.findFirst.mockResolvedValueOnce(row).mockResolvedValueOnce({
      ...row,
      assetType: 'image',
      cameraMovement: null,
    });
    studioLook.updateMany.mockResolvedValueOnce({ count: 1 });

    await service.updateScoped('look-1', { assetType: 'image' }, scope);

    expect(studioLook.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { assetType: 'image', cameraMovement: null },
      }),
    );
  });

  it('soft-deletes only a live Look in the authenticated organization and brand', async () => {
    studioLook.updateMany.mockResolvedValueOnce({ count: 1 });

    await expect(service.removeScoped('look-1', scope)).resolves.toBe(true);
    expect(studioLook.updateMany).toHaveBeenCalledWith({
      data: { isDeleted: true },
      where: {
        brandId: 'brand-1',
        id: 'look-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });
});

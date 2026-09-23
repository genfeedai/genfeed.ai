import { GenerationHarnessSettingsService } from '@api/services/harness/generation-harness-settings.service';
import { describe, expect, it, vi } from 'vitest';

function setup() {
  const prisma = {
    organization: { findFirst: vi.fn().mockResolvedValue({ id: 'org' }) },
    brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand' }) },
    generationHarnessSetting: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn(),
    },
  };
  return {
    prisma,
    service: new GenerationHarnessSettingsService(prisma as never),
  };
}

describe('GenerationHarnessSettingsService', () => {
  it('defaults on and lets a brand override an organization preference', async () => {
    const { prisma, service } = setup();
    expect(await service.get('org', 'brand')).toMatchObject({
      isEnabled: true,
      source: 'default',
    });
    prisma.generationHarnessSetting.findMany.mockResolvedValue([
      { scopeKey: 'organization', isEnabled: false },
    ]);
    expect(await service.get('org', 'brand')).toMatchObject({
      isEnabled: false,
      source: 'organization',
    });
    prisma.generationHarnessSetting.findMany.mockResolvedValue([
      { scopeKey: 'organization', isEnabled: false },
      { scopeKey: 'brand', isEnabled: true },
    ]);
    expect(await service.get('org', 'brand')).toMatchObject({
      isEnabled: true,
      source: 'brand',
    });
    expect(prisma.generationHarnessSetting.findMany).toHaveBeenLastCalledWith({
      where: {
        organizationId: 'org',
        isDeleted: false,
        scopeKey: { in: ['organization', 'brand'] },
      },
    });
  });

  it('resets only the authorized scope with a soft delete', async () => {
    const { prisma, service } = setup();
    await service.set('org', {
      scope: 'brand',
      brandId: 'brand',
      isEnabled: null,
    });
    expect(prisma.generationHarnessSetting.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org', scopeKey: 'brand', isDeleted: false },
      data: { isDeleted: true },
    });
    expect(prisma.generationHarnessSetting.upsert).not.toHaveBeenCalled();
  });

  it('resurrects only the organization and scope unique row', async () => {
    const { prisma, service } = setup();
    await service.set('org', {
      scope: 'brand',
      brandId: 'brand',
      isEnabled: false,
    });
    expect(prisma.generationHarnessSetting.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org', scopeKey: 'brand', isDeleted: true },
      data: { isEnabled: false, isDeleted: false, brandId: 'brand' },
    });
  });

  it('rejects inaccessible brands before reading or writing settings', async () => {
    const { prisma, service } = setup();
    prisma.brand.findFirst.mockResolvedValue(null);
    await expect(
      service.set('org', {
        scope: 'brand',
        brandId: 'foreign',
        isEnabled: true,
      }),
    ).rejects.toThrow('Brand not found');
    expect(prisma.brand.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign', organizationId: 'org', isDeleted: false },
      select: { id: true },
    });
    expect(prisma.generationHarnessSetting.upsert).not.toHaveBeenCalled();
    expect(prisma.generationHarnessSetting.findMany).not.toHaveBeenCalled();
  });

  it('requires a brand for brand settings and a strict boolean or null', async () => {
    const { service } = setup();
    await expect(
      service.set('org', { scope: 'brand', isEnabled: true }),
    ).rejects.toThrow('brandId');
    await expect(
      service.set('org', {
        scope: 'organization',
        isEnabled: 'false',
      } as never),
    ).rejects.toThrow('boolean');
    await expect(
      service.set('org', { scope: 'organization' } as never),
    ).rejects.toThrow('boolean');
  });
});

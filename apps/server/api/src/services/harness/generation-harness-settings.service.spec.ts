import { GenerationHarnessSettingsService } from '@api/services/harness/generation-harness-settings.service';
import { describe, expect, it, vi } from 'vitest';

function setup() {
  const prisma = {
    organization: { findFirst: vi.fn().mockResolvedValue({ id: 'org' }) },
    brand: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: 'brand', isPromptEnhancementEnabled: null }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    organizationSetting: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ isPromptEnhancementEnabled: null }),
      upsert: vi.fn(),
    },
  };
  return {
    prisma,
    service: new GenerationHarnessSettingsService(prisma as never),
  };
}

describe('GenerationHarnessSettingsService', () => {
  it('defaults on, with brand over organization precedence', async () => {
    const { prisma, service } = setup();
    expect(await service.get('org', 'brand')).toMatchObject({
      isEnabled: true,
      source: 'default',
    });
    prisma.organizationSetting.findUnique.mockResolvedValue({
      isPromptEnhancementEnabled: false,
    });
    expect(await service.get('org', 'brand')).toMatchObject({
      isEnabled: false,
      source: 'organization',
    });
    prisma.brand.findFirst.mockResolvedValue({
      id: 'brand',
      isPromptEnhancementEnabled: true,
    });
    expect(await service.get('org', 'brand')).toMatchObject({
      isEnabled: true,
      source: 'brand',
    });
    expect(prisma.brand.findFirst).toHaveBeenLastCalledWith({
      where: { id: 'brand', organizationId: 'org', isDeleted: false },
      select: { isPromptEnhancementEnabled: true },
    });
  });

  it.each([true, false, null])(
    'sets or resets only the authorized brand field (%s)',
    async (isEnabled) => {
      const { prisma, service } = setup();
      await service.set('org', { scope: 'brand', brandId: 'brand', isEnabled });
      expect(prisma.brand.updateMany).toHaveBeenCalledWith({
        where: { id: 'brand', organizationId: 'org', isDeleted: false },
        data: { isPromptEnhancementEnabled: isEnabled },
      });
      expect(prisma.organizationSetting.upsert).not.toHaveBeenCalled();
    },
  );

  it('uses the existing organization settings row without overwriting other preferences', async () => {
    const { prisma, service } = setup();
    await service.set('org', { scope: 'organization', isEnabled: false });
    expect(prisma.organizationSetting.upsert).toHaveBeenCalledWith({
      where: { organizationId: 'org' },
      create: { organizationId: 'org', isPromptEnhancementEnabled: false },
      update: { isPromptEnhancementEnabled: false },
    });
    expect(prisma.brand.updateMany).not.toHaveBeenCalled();
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
    expect(prisma.brand.updateMany).not.toHaveBeenCalled();
    expect(prisma.organizationSetting.findUnique).not.toHaveBeenCalled();
  });

  it('requires a brand and a strict boolean or null', async () => {
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

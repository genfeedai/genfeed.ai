import { GenerationHarnessSettingsService } from '@api/services/harness/generation-harness-settings.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { UpdateGenerationHarnessSettings } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

interface Row {
  [key: string]: unknown;
}

const matches = (row: Row, where: Row): boolean =>
  Object.entries(where).every(([key, value]) => row[key] === value);

/**
 * In-memory organization, brand and organization-settings tables. The
 * settings row carries an unrelated preference so overwrites show up.
 */
function setup() {
  const organizations: Row[] = [
    { id: 'org', isDeleted: false },
    { id: 'other-org', isDeleted: false },
  ];
  const brands: Row[] = [
    {
      id: 'brand',
      isDeleted: false,
      isPromptEnhancementEnabled: null,
      organizationId: 'org',
    },
    {
      id: 'foreign',
      isDeleted: false,
      isPromptEnhancementEnabled: false,
      organizationId: 'other-org',
    },
  ];
  const organizationSettings: Row[] = [
    {
      isAutoPublishEnabled: true,
      isPromptEnhancementEnabled: null,
      organizationId: 'org',
    },
  ];
  const prisma = {
    brand: {
      findFirst: async ({ where }: { where: Row }) =>
        brands.find((row) => matches(row, where)) ?? null,
      updateMany: async ({ data, where }: { data: Row; where: Row }) => {
        const targets = brands.filter((row) => matches(row, where));
        for (const row of targets) Object.assign(row, data);
        return { count: targets.length };
      },
    },
    organization: {
      findFirst: async ({ where }: { where: Row }) =>
        organizations.find((row) => matches(row, where)) ?? null,
    },
    organizationSetting: {
      findUnique: async ({ where }: { where: Row }) =>
        organizationSettings.find((row) => matches(row, where)) ?? null,
      upsert: async ({
        create,
        update,
        where,
      }: {
        create: Row;
        update: Row;
        where: Row;
      }) => {
        const existing = organizationSettings.find((row) =>
          matches(row, where),
        );
        if (existing) return Object.assign(existing, update);
        organizationSettings.push({ ...create });
        return create;
      },
    },
  };
  return {
    brands,
    organizationSettings,
    service: new GenerationHarnessSettingsService(
      prisma as unknown as PrismaService,
    ),
  };
}

describe('GenerationHarnessSettingsService', () => {
  it('defaults on, with brand over organization precedence', async () => {
    const { service } = setup();
    expect(await service.get('org', 'brand')).toMatchObject({
      isEnabled: true,
      source: 'default',
    });

    await service.set('org', { scope: 'organization', isEnabled: false });
    expect(await service.get('org', 'brand')).toMatchObject({
      isEnabled: false,
      source: 'organization',
    });

    await service.set('org', {
      scope: 'brand',
      brandId: 'brand',
      isEnabled: true,
    });
    expect(await service.get('org', 'brand')).toMatchObject({
      brandEnabled: true,
      isEnabled: true,
      organizationEnabled: false,
      source: 'brand',
    });
  });

  it.each([true, false, null])(
    'sets or resets only the authorized brand field (%s)',
    async (isEnabled) => {
      const { brands, organizationSettings, service } = setup();
      await service.set('org', { scope: 'brand', brandId: 'brand', isEnabled });
      expect(brands[0]).toMatchObject({
        isPromptEnhancementEnabled: isEnabled,
      });
      expect(brands[1]).toMatchObject({ isPromptEnhancementEnabled: false });
      expect(organizationSettings).toEqual([
        {
          isAutoPublishEnabled: true,
          isPromptEnhancementEnabled: null,
          organizationId: 'org',
        },
      ]);
    },
  );

  it('uses the existing organization settings row without overwriting other preferences', async () => {
    const { brands, organizationSettings, service } = setup();
    const result = await service.set('org', {
      scope: 'organization',
      isEnabled: false,
    });
    expect(result).toMatchObject({ isEnabled: false, source: 'organization' });
    expect(organizationSettings).toEqual([
      {
        isAutoPublishEnabled: true,
        isPromptEnhancementEnabled: false,
        organizationId: 'org',
      },
    ]);
    expect(brands[0]).toMatchObject({ isPromptEnhancementEnabled: null });
  });

  it('rejects brands of another organization and leaves them unchanged', async () => {
    const { brands, organizationSettings, service } = setup();
    await expect(
      service.set('org', {
        scope: 'brand',
        brandId: 'foreign',
        isEnabled: true,
      }),
    ).rejects.toThrow('Brand not found');
    await expect(service.get('org', 'foreign')).rejects.toThrow(
      'Brand not found',
    );
    expect(brands[1]).toMatchObject({ isPromptEnhancementEnabled: false });
    expect(organizationSettings[0]).toMatchObject({
      isPromptEnhancementEnabled: null,
    });
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
      } as unknown as UpdateGenerationHarnessSettings),
    ).rejects.toThrow('boolean');
    await expect(
      service.set('org', {
        scope: 'organization',
      } as unknown as UpdateGenerationHarnessSettings),
    ).rejects.toThrow('boolean');
  });
});

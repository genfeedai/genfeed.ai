import { StudioPresetSeedService } from '@api/seeds/studio-preset-seed.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AD_PRESETS } from '@genfeedai/contracts/constants/ad-presets.constant';
import { B2B_PLAYBOOKS } from '@genfeedai/contracts/constants/b2b-playbooks.constant';
import {
  STUDIO_SYSTEM_PRESETS,
  studioSystemPresetId,
} from '@genfeedai/contracts/constants/studio-system-presets.constant';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it } from 'vitest';

type PresetRow = {
  brandId: string | null;
  category?: string;
  config?: Record<string, unknown>;
  id: string;
  isActive?: boolean;
  organizationId: string | null;
};

const CATALOG_SIZE =
  STUDIO_SYSTEM_PRESETS.length + AD_PRESETS.length + B2B_PLAYBOOKS.length;
const [conflicting] = STUDIO_SYSTEM_PRESETS;

/**
 * The presets table keyed by id, with its primary key raising P2002. Ids in
 * `racedIds` are taken by a concurrent writer between the probe and the
 * insert. Logged errors are recorded.
 */
function fixture(options: { racedIds?: string[]; rows?: PresetRow[] } = {}) {
  const rows = options.rows ?? [];
  const errors: { context: string; message: string }[] = [];
  const prisma = {
    preset: {
      create: async ({ data }: { data: PresetRow }) => {
        if (
          options.racedIds?.includes(data.id) ||
          rows.some((row) => row.id === data.id)
        ) {
          throw Object.assign(new Error('Unique constraint failed'), {
            code: 'P2002',
          });
        }
        rows.push(data);
        return data;
      },
      findUnique: async ({ where }: { where: { id: string } }) =>
        rows.find((row) => row.id === where.id) ?? null,
    },
  };
  const logger = {
    error: (message: string, _error: Error, context: string) =>
      errors.push({ context, message }),
  };
  return {
    errors,
    rows,
    service: new StudioPresetSeedService(
      prisma as unknown as PrismaService,
      logger as unknown as LoggerService,
    ),
  };
}

describe('StudioPresetSeedService', () => {
  it('seeds the platform catalog under deterministic ids and skips writes on repeat', async () => {
    const { rows, service } = fixture();

    await expect(service.reconcileCatalog()).resolves.toEqual({
      unchanged: 0,
      written: CATALOG_SIZE,
    });
    await expect(service.reconcileCatalog()).resolves.toEqual({
      unchanged: CATALOG_SIZE,
      written: 0,
    });

    expect(rows).toHaveLength(CATALOG_SIZE);
    expect(
      rows.find((row) => row.id === studioSystemPresetId(conflicting.key)),
    ).toMatchObject({
      brandId: null,
      config: { key: conflicting.key },
      isActive: true,
      organizationId: null,
    });
    expect(
      rows.filter((row) => row.organizationId !== null || row.brandId !== null),
    ).toEqual([]);
  });

  it('stores every ad preset and B2B playbook in its config', async () => {
    const { rows, service } = fixture();

    await service.reconcileCatalog();

    expect(
      rows.flatMap((row) =>
        row.config?.adPreset ? [row.config.adPreset] : [],
      ),
    ).toEqual(AD_PRESETS);
    expect(
      rows.flatMap((row) =>
        row.config?.playbook ? [[row.category, row.config.playbook]] : [],
      ),
    ).toEqual(B2B_PLAYBOOKS.map((playbook) => [playbook.mediaType, playbook]));
  });

  it('does not overwrite a tenant or brand-owned row with a colliding id', async () => {
    const owned: PresetRow = {
      brandId: 'other-brand',
      id: studioSystemPresetId(conflicting.key),
      organizationId: 'other-org',
    };
    const { rows, service } = fixture({ rows: [owned] });

    const result = await service.reconcileCatalog();

    expect(result).toEqual({ unchanged: 1, written: CATALOG_SIZE - 1 });
    expect(rows[0]).toEqual(owned);
  });

  it('keeps seeding the other templates when one conflicts and fails closed', async () => {
    const { errors, rows, service } = fixture({
      racedIds: [studioSystemPresetId(conflicting.key)],
    });

    await expect(service.reconcileCatalog()).rejects.toThrow(
      `Studio system preset reconcile failed for: ${conflicting.key}`,
    );

    expect(rows).toHaveLength(CATALOG_SIZE - 1);
    expect(errors).toEqual([
      {
        context: 'StudioPresetSeedService',
        message: `Studio system preset seed failed for ${conflicting.key}`,
      },
    ]);
  });
});

import type { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it } from 'vitest';
import { AssetGateService } from './asset-gate.service';
import type { OrganizationSettingsService } from './organization-settings.service';

interface SettingsRow {
  hasGeneratedFirstAsset: boolean;
  isDeleted: boolean;
  organizationId: string;
}

/**
 * The gate over an in-memory settings table whose bulk patch updates every row
 * matching the filter, an access cache that counts invalidations per org, and
 * a logger that keeps warnings. `isDown` makes the table throw.
 */
function gateOver(rows: SettingsRow[], options: { isDown?: boolean } = {}) {
  const table = rows.map((row) => ({ ...row }));
  const invalidated: string[] = [];
  const warnings: string[] = [];
  const settings = {
    patchAll: async (
      filter: Partial<SettingsRow>,
      update: Partial<SettingsRow>,
    ) => {
      if (options.isDown) {
        throw new Error('db down');
      }
      const matching = table.filter((row) =>
        Object.entries(filter).every(
          ([field, value]) => row[field as keyof SettingsRow] === value,
        ),
      );
      for (const row of matching) {
        Object.assign(row, update);
      }
      return { modifiedCount: matching.length };
    },
  };
  const service = new AssetGateService(
    settings as unknown as OrganizationSettingsService,
    {
      invalidateForOrganization: async (organizationId: string) => {
        invalidated.push(organizationId);
      },
    } as unknown as AccessBootstrapCacheService,
    {
      warn: (message: string) => {
        warnings.push(message);
      },
    } as unknown as LoggerService,
  );
  return { invalidated, service, table, warnings };
}

const unset = (organizationId: string, isDeleted = false): SettingsRow => ({
  hasGeneratedFirstAsset: false,
  isDeleted,
  organizationId,
});

describe('AssetGateService', () => {
  it('unlocks the org on its first asset and refreshes its access once', async () => {
    const { invalidated, service, table } = gateOver([
      unset('org-1'),
      unset('org-2'),
    ]);

    await service.markFirstAssetGenerated('org-1');
    await service.markFirstAssetGenerated('org-1');

    expect(table).toEqual([
      {
        hasGeneratedFirstAsset: true,
        isDeleted: false,
        organizationId: 'org-1',
      },
      unset('org-2'),
    ]);
    expect(invalidated).toEqual(['org-1']);
  });

  it('leaves a deleted settings row locked', async () => {
    const { invalidated, service, table } = gateOver([unset('org-1', true)]);

    await service.markFirstAssetGenerated('org-1');

    expect(table).toEqual([unset('org-1', true)]);
    expect(invalidated).toEqual([]);
  });

  it.each([undefined, null, ''])(
    'does nothing without an organization id (%s)',
    async (organizationId) => {
      const { invalidated, service, table } = gateOver([unset('org-1')]);

      await service.markFirstAssetGenerated(organizationId);

      expect(table).toEqual([unset('org-1')]);
      expect(invalidated).toEqual([]);
    },
  );

  it('logs a database failure instead of breaking the generation', async () => {
    const { invalidated, service, warnings } = gateOver([unset('org-1')], {
      isDown: true,
    });

    await expect(
      service.markFirstAssetGenerated('org-1'),
    ).resolves.toBeUndefined();
    expect(warnings).toEqual([
      'markFirstAssetGenerated failed for organization org-1',
    ]);
    expect(invalidated).toEqual([]);
  });
});

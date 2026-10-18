import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schemaSource = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20261018090000_x_daily_quota_fifteen/migration.sql',
  ),
  'utf8',
);

const organizationSettingModel = schemaSource.slice(
  schemaSource.indexOf('model OrganizationSetting {'),
  schemaSource.indexOf(
    '\n}',
    schemaSource.indexOf('model OrganizationSetting {'),
  ),
);

describe('X daily publishing cap', () => {
  it('defaults new organizations to 15 X posts a day', () => {
    expect(organizationSettingModel).toMatch(
      /quotaTwitter\s+Int\s+@default\(15\)/,
    );
  });

  it('leaves the other platform defaults unchanged', () => {
    expect(organizationSettingModel).toMatch(
      /quotaYoutube\s+Int\s+@default\(5\)/,
    );
    expect(organizationSettingModel).toMatch(
      /quotaTiktok\s+Int\s+@default\(1\)/,
    );
    expect(organizationSettingModel).toMatch(
      /quotaInstagram\s+Int\s+@default\(5\)/,
    );
  });

  it('changes the column default and raises only rows still on the old default', () => {
    expect(migrationSource).toContain(
      'ALTER TABLE "organization_settings" ALTER COLUMN "quotaTwitter" SET DEFAULT 15;',
    );
    expect(migrationSource).toMatch(
      /UPDATE "organization_settings"\s+SET "quotaTwitter" = 15,[\s\S]*WHERE "quotaTwitter" = 5;/,
    );
    expect(migrationSource).not.toMatch(/quota(Youtube|Tiktok|Instagram)/);
  });
});

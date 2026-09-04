import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const lookups = [
  ['genfeedContentId', 'content', '20260904130000'],
  ['externalAdId', 'external_ad', '20260904130100'],
  ['adAccountId', 'account', '20260904130200'],
] as const;

describe('ad mapping tenant-scoped JSON indexes', () => {
  it.each(lookups)(
    'indexes the Prisma JSONB path for %s',
    (key, label, timestamp) => {
      const sql = readFileSync(
        new URL(
          `./migrations/${timestamp}_ad_mapping_${label}_index/migration.sql`,
          import.meta.url,
        ),
        'utf8',
      )
        .split('\n')
        .filter((line) => !line.startsWith('--'))
        .join('\n');

      expect(sql).toContain(
        `CREATE INDEX CONCURRENTLY "ad_mappings_org_deleted_${label}_idx"`,
      );
      expect(sql).toContain(
        `("organizationId", "isDeleted", ("data" #> '{${key}}'::text[]))`,
      );
      expect(sql.match(/CREATE INDEX/g)).toHaveLength(1);
      expect(sql).not.toMatch(/BEGIN|->>/);
    },
  );
});

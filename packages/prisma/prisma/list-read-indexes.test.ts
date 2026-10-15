import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const indexes = [
  {
    columns:
      '("organizationId", "brandId", "isDeleted", "createdAt" DESC, "id", "status", "category")',
    migration: '20261015150000_ingredients_org_brand_library_index',
    name: 'ingredients_org_brand_library_idx',
    schema:
      '@@index([organizationId, brandId, isDeleted, createdAt(sort: Desc), id, status, category], map: "ingredients_org_brand_library_idx")',
    table: 'ingredients',
  },
  {
    columns:
      '("organizationId", "contentType", "contentId", "isDeleted", "updatedAt" DESC)',
    migration: '20261015150100_evaluations_org_content_target_index',
    name: 'evaluations_org_content_target_idx',
    schema:
      '@@index([organizationId, contentType, contentId, isDeleted, updatedAt(sort: Desc)], map: "evaluations_org_content_target_idx")',
    table: 'evaluations',
  },
] as const;

const schema = readFileSync(
  new URL('./schema.prisma', import.meta.url),
  'utf8',
);

describe('list read indexes', () => {
  it.each(indexes)(
    'builds $name concurrently in its own migration and declares it in the schema',
    ({ columns, migration, name, schema: declaration, table }) => {
      const sql = readFileSync(
        new URL(`./migrations/${migration}/migration.sql`, import.meta.url),
        'utf8',
      )
        .split('\n')
        .filter((line) => !line.startsWith('--'))
        .join('\n');

      expect(sql).toContain(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${name}"`,
      );
      expect(sql.replace(/\s+/g, ' ')).toContain(`ON "${table}" ${columns}`);
      expect(sql.match(/CREATE INDEX/g)).toHaveLength(1);
      expect(sql).not.toMatch(/BEGIN|COMMIT/);
      expect(schema).toContain(declaration);
    },
  );
});

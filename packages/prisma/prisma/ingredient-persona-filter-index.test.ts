import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('ingredient persona filter index (#6039)', () => {
  const sql = readFileSync(
    new URL(
      './migrations/20261004110000_ingredient_persona_filter_index/migration.sql',
      import.meta.url,
    ),
    'utf8',
  )
    .split('\n')
    .filter((line) => !line.startsWith('--'))
    .join('\n');
  const schema = readFileSync(
    new URL('./schema.prisma', import.meta.url),
    'utf8',
  );

  it('builds one tenant-leading concurrent index', () => {
    expect(sql).toContain(
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ingredients_org_persona_created_at_idx"',
    );
    expect(sql).toContain(
      '("organizationId", "personaId", "isDeleted", "createdAt" DESC)',
    );
    expect(sql.match(/CREATE INDEX/g)).toHaveLength(1);
    expect(sql).not.toMatch(/BEGIN/);
  });

  it('is declared on the Prisma model so the schema does not drift', () => {
    expect(schema).toContain(
      '@@index([organizationId, personaId, isDeleted, createdAt(sort: Desc)], map: "ingredients_org_persona_created_at_idx")',
    );
  });
});

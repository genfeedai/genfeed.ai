import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    prismaDir,
    'migrations/20260826220000_add_listening_post_attribution/migration.sql',
  ),
  'utf8',
);

describe('listening post outcome attribution (#1798)', () => {
  it('adds one additive Post attribution contract without repurposing sourceActionId', () => {
    expect(schema).toMatch(/^\s*listeningTopicId\s+String\?/m);
    expect(schema).toMatch(/^\s*listeningThemeId\s+String\?/m);
    expect(schema).toMatch(/^\s*listeningEvidenceIds\s+String\[\]/m);
    expect(schema).toMatch(/^\s*sourceActionId\s+String\?/m);
    expect(migration).toContain('ADD COLUMN "listeningTopicId" TEXT');
    expect(migration).toContain('ADD COLUMN "listeningThemeId" TEXT');
    expect(migration).toContain(
      'ADD COLUMN "listeningEvidenceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]',
    );
    expect(migration).not.toContain('DROP COLUMN');
    expect(migration).not.toContain('RENAME COLUMN');
  });

  it('enforces a bounded evidence snapshot and a scoped theme foreign key', () => {
    expect(migration).toContain('posts_listening_evidence_ids_bounded_check');
    expect(migration).toContain('cardinality("listeningEvidenceIds") <= 100');
    expect(migration).toContain('posts_listening_theme_scope_fkey');
    expect(migration).toContain(
      'FOREIGN KEY ("listeningThemeId", "organizationId", "brandId", "listeningTopicId")',
    );
    expect(migration).toContain(
      'REFERENCES "listening_themes"("id", "organizationId", "brandId", "topicId")',
    );
    expect(schema).toContain(
      '@@index([organizationId, brandId, listeningThemeId], map: "posts_org_brand_listening_theme_idx")',
    );
  });
});

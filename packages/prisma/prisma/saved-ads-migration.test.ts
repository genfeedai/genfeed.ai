import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(prismaDir, 'migrations/20260830123000_add_saved_ads/migration.sql'),
  'utf8',
);

describe('saved_ads brand swipe-file invariants (#4070)', () => {
  it('binds every saved snapshot to its organization, brand, and canonical user', () => {
    expect(schema).toContain('model SavedAd {');
    expect(schema).toContain('user           User');
    expect(schema).toContain(
      '@relation(fields: [brandId, organizationId], references: [id, organizationId]',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("brandId", "organizationId") REFERENCES "brands"("id", "organizationId")',
    );
  });

  it('keeps one soft-deletable snapshot per brand, platform, and source ad', () => {
    expect(schema).toContain(
      '@@unique([organizationId, brandId, platform, sourceAdId]',
    );
    expect(schema).toContain('isDeleted      Boolean');
    expect(migration).toContain('saved_ads_scope_source_key');
    expect(migration).toContain('saved_ads_scope_created_idx');
  });

  it('stores copied creative URLs and normalized research evidence', () => {
    for (const field of [
      'imageUrls',
      'videoUrls',
      'advertiserName',
      'firstSeenAt',
      'lastSeenAt',
      'patternSummary',
      'note',
    ]) {
      expect(schema).toContain(field);
      expect(migration).toContain(`"${field}"`);
    }
  });
});

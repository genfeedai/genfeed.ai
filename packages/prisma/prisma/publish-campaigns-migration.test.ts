import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    prismaDir,
    'migrations/20260902120000_add_publish_campaigns/migration.sql',
  ),
  'utf8',
);

describe('publish content campaign invariants (#4138)', () => {
  it('binds every campaign to its organization, brand, and canonical user', () => {
    expect(schema).toContain('model Campaign {');
    expect(schema).toContain(
      '@relation(fields: [brandId, organizationId], references: [id, organizationId]',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("brandId", "organizationId") REFERENCES "brands"("id", "organizationId")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("userId") REFERENCES "users"("id")',
    );
  });

  it('carries a shared brief, window, and soft-deletable lowercase status', () => {
    for (const field of ['brief', 'objective', 'startDate', 'endDate']) {
      expect(schema).toContain(field);
      expect(migration).toContain(`"${field}"`);
    }
    expect(migration).toContain(`"status" TEXT NOT NULL DEFAULT 'draft'`);
    expect(migration).toContain('"isDeleted" BOOLEAN NOT NULL DEFAULT false');
  });

  it('resolves a retried create to the same campaign per organization', () => {
    expect(schema).toContain(
      '@@unique([organizationId, idempotencyKey], map: "campaigns_organizationId_idempotencyKey_key")',
    );
    expect(migration).toContain('campaigns_organizationId_idempotencyKey_key');
  });

  it('stamps releases and channel targets with their campaign', () => {
    expect(migration).toContain(
      'ALTER TABLE "posts" ADD COLUMN "campaignId" TEXT',
    );
    expect(migration).toContain(
      'ALTER TABLE "post_groups" ADD COLUMN "campaignId" TEXT',
    );
    expect(migration).toContain('posts_org_campaign_created_idx');
    expect(migration).toContain('post_groups_org_campaign_schedule_idx');
  });

  it('detaches campaign membership instead of deleting published work', () => {
    expect(migration).toContain(
      'ALTER TABLE "posts" ADD CONSTRAINT "posts_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL',
    );
    expect(migration).toContain(
      'ALTER TABLE "post_groups" ADD CONSTRAINT "post_groups_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL',
    );
  });
});

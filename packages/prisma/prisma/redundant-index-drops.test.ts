import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schemaSource = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');

// Each dropped index is a strict leading prefix of a surviving index (or of a
// unique constraint) on the same table, so no query loses an access path.
const drops = [
  {
    model: 'Post',
    migration: '20261026090000_drop_redundant_posts_brand_status_index',
    dropped: 'posts_brandId_isDeleted_status_idx',
    keptSchemaLine:
      '@@index([brandId, isDeleted, status, createdAt(sort: Desc)], map: "posts_brand_deleted_status_created_at_idx")',
    droppedSchemaLine: '@@index([brandId, isDeleted, status])\n',
  },
  {
    model: 'SubscriptionAttribution',
    migration:
      '20261026090100_drop_redundant_subscription_attributions_org_index',
    dropped: 'subscription_attributions_organizationId_idx',
    keptSchemaLine:
      '@@unique([organizationId, stripeSubscriptionId], map: "subscription_attributions_org_stripe_subscription_key")',
    droppedSchemaLine: '@@index([organizationId])\n',
  },
  {
    model: 'ResearchCollectionJob',
    migration: '20261026090200_drop_redundant_research_jobs_org_deleted_index',
    dropped: 'research_collection_jobs_organizationId_isDeleted_idx',
    keptSchemaLine: '@@index([organizationId, isDeleted, upstreamRunId]',
    droppedSchemaLine: '@@index([organizationId, isDeleted])\n',
  },
  {
    model: 'AdPerformance',
    migration: '20261026090300_drop_redundant_ad_performance_org_deleted_index',
    dropped: 'ad_performance_organizationId_isDeleted_idx',
    keptSchemaLine:
      '@@index([organizationId, isDeleted, date(sort: Desc)], map: "ad_performance_org_deleted_date_idx")',
    droppedSchemaLine: '@@index([organizationId, isDeleted])\n',
  },
  {
    model: 'ClipResult',
    migration: '20261026090400_drop_redundant_clip_results_project_index',
    dropped: 'clip_results_organizationId_projectId_idx',
    keptSchemaLine: '@@index([organizationId, projectId, status, isDeleted])',
    droppedSchemaLine: '@@index([organizationId, projectId])\n',
  },
  {
    model: 'SkillVersion',
    migration: '20261026090500_drop_redundant_skill_versions_desc_index',
    dropped: 'skill_versions_skill_version_desc_idx',
    keptSchemaLine: '@@unique([skillId, versionNumber])',
    droppedSchemaLine: '@@index([skillId, versionNumber(sort: Desc)])',
  },
] as const;

function modelBlock(name: string): string {
  const match = new RegExp(`^model ${name} \\{\\n[\\s\\S]*?^\\}`, 'm').exec(
    schemaSource,
  );
  if (!match) throw new Error(`model ${name} not found`);
  return match[0];
}

describe('redundant prefix indexes stay dropped', () => {
  it.each(drops)(
    '$dropped is gone from the schema and dropped online',
    ({ model, migration, dropped, keptSchemaLine, droppedSchemaLine }) => {
      const block = modelBlock(model);
      expect(block).toContain(keptSchemaLine);
      expect(block).not.toContain(droppedSchemaLine);

      const sql = readFileSync(
        join(prismaDir, 'migrations', migration, 'migration.sql'),
        'utf8',
      );
      const statements = sql
        .split('\n')
        .filter((line) => line.trim() && !line.trim().startsWith('--'))
        .join('\n')
        .split(';')
        .map((statement) => statement.trim())
        .filter(Boolean);

      // CONCURRENTLY cannot share a transaction with another statement.
      expect(statements).toEqual([
        `DROP INDEX CONCURRENTLY IF EXISTS "${dropped}"`,
      ]);
    },
  );
});

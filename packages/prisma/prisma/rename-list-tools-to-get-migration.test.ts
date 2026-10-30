import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20261030130000_rename_list_tools_to_get/migration.sql',
  ),
  'utf8',
);

const RENAMED_TOOLS = [
  'activity',
  'ads_research',
  'agent_conversations',
  'assets',
  'brand_publishing_readiness',
  'clipper_projects',
  'editor_projects',
  'genfeed_tools',
  'google_ads_campaigns',
  'google_ads_customers',
  'inbox',
  'instagram_inspiration',
  'knowledge_sources',
  'meta_ad_accounts',
  'meta_ad_creatives',
  'meta_campaigns',
  'orgs',
  'outlier_posts',
  'review_queue',
  'social_conversations',
  'stalled_items',
  'system_workflow_catalog',
  'tasks',
  'tiktok_ad_accounts',
  'tiktok_adgroups',
  'tiktok_ads',
  'tiktok_campaigns',
  'workflow_runs',
  'workflow_templates',
  'workflows',
  'x_account_activity',
];

describe('Rename list_ tools to get_ migration', () => {
  it.each(RENAMED_TOOLS)('maps list_%s to get_%s', (name) => {
    expect(migrationSource).toContain(`WHEN 'list_${name}' THEN 'get_${name}'`);
    expect(migrationSource).toContain(`  'list_${name}'`);
  });

  it('only rewrites the stored MCP approval tool names', () => {
    expect(migrationSource.match(/UPDATE "/g)).toHaveLength(1);
    expect(migrationSource).toContain('UPDATE "mcp_approvals"');
    expect(migrationSource).not.toMatch(
      /\bDROP\b|\bRENAME\b|\bDELETE\b|\bALTER\b/,
    );
  });

  it('never rewrites the hashed workflow version history', () => {
    expect(migrationSource).not.toMatch(/UPDATE "workflow_versions"/);
  });
});

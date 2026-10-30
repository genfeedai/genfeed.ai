import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20261030140000_rename_paid_provider_reads_to_fetch/migration.sql',
  ),
  'utf8',
);

const RENAMED_TOOLS = [
  'instagram_inspiration',
  'instagram_inspiration_detail',
  'x_account_activity',
  'x_posts',
];

describe('Rename paid provider reads to fetch_ migration', () => {
  it.each(RENAMED_TOOLS)('maps get_%s to fetch_%s', (name) => {
    expect(migrationSource).toContain(
      `WHEN 'get_${name}' THEN 'fetch_${name}'`,
    );
    expect(migrationSource).toContain(`  'get_${name}'`);
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

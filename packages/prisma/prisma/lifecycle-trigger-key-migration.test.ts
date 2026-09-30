import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260811150000_colon_free_lifecycle_trigger_keys/migration.sql',
  ),
  'utf8',
);

describe('colon-free lifecycle trigger keys migration', () => {
  it('rewrites persisted trigger keys to the colon-free format', () => {
    expect(migrationSource).toContain(
      `SET "triggerKey" = replace("triggerKey", ':', '-')`,
    );
    expect(migrationSource).toContain(`WHERE "triggerKey" LIKE '%:%';`);
  });

  it('only touches lifecycle_email_deliveries', () => {
    const updates = migrationSource.match(/UPDATE "[a-z_]+"/g);
    expect(updates).toEqual(['UPDATE "lifecycle_email_deliveries"']);
  });
});

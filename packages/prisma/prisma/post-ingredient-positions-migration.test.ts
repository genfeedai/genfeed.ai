import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const migration = readFileSync(
  join(
    prismaDir,
    'migrations/20261012220000_post_ingredient_positions/migration.sql',
  ),
  'utf8',
);
const statements = migration.replace(/^\s*--.*$/gm, '');

describe('post ingredient positions migration (#6740)', () => {
  it('blocks old-table writes before the backfill reads it, until the bridge triggers exist', () => {
    const lock = statements.indexOf(
      'LOCK TABLE "_post_ingredients" IN SHARE ROW EXCLUSIVE MODE',
    );
    const backfill = statements.indexOf(
      'INSERT INTO "post_ingredients"\n  ("id", "postId"',
    );
    const firstTrigger = statements.indexOf('CREATE TRIGGER');

    expect(lock).toBeGreaterThan(-1);
    expect(backfill).toBeGreaterThan(lock);
    expect(firstTrigger).toBeGreaterThan(backfill);
  });

  it('is expand only: the old table is never dropped or emptied here', () => {
    expect(statements).not.toMatch(/DROP\s+TABLE\s+"?_post_ingredients/i);
    expect(statements).not.toMatch(/TRUNCATE/i);
    expect(statements).not.toMatch(/DELETE\s+FROM\s+"?_post_ingredients/i);
  });
});

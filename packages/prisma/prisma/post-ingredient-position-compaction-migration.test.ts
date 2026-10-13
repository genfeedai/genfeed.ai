import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const repair = readFileSync(
  join(
    prismaDir,
    'migrations/20261013150000_compact_post_ingredient_positions/migration.sql',
  ),
  'utf8',
);
const applied = readFileSync(
  join(
    prismaDir,
    'migrations/20261012220000_post_ingredient_positions/migration.sql',
  ),
  'utf8',
);

function tagged(sql: string, tag: string): string {
  const match = sql.match(new RegExp(`\\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$`));
  expect(match?.[1]).toBeTruthy();
  return match?.[1] ?? '';
}

describe('post ingredient position compaction migration (#6862)', () => {
  it('repairs the applied bridge forward and leaves the rollback mirror in place', () => {
    expect(
      '20261013150000_compact_post_ingredient_positions' >
        '20261012220000_post_ingredient_positions',
    ).toBe(true);
    expect(applied).toContain('DELETE FROM "post_ingredients"');
    expect(applied).not.toContain('compact_post_ingredient_positions');
    expect(repair).toContain(
      'CREATE OR REPLACE FUNCTION mirror_post_ingredient_link_to_positions()',
    );
    expect(repair).not.toContain(
      'CREATE FUNCTION mirror_post_ingredient_link_to_implicit',
    );
    expect(repair).not.toContain(
      'CREATE OR REPLACE FUNCTION mirror_post_ingredient_link_to_implicit',
    );
    expect(repair).not.toMatch(/DROP\s+TABLE/i);
    expect(repair).not.toMatch(/DROP\s+FUNCTION/i);
    expect(repair).not.toMatch(/DROP\s+TRIGGER/i);
    expect(repair).not.toMatch(/TRUNCATE/i);
  });

  it('locks the implicit table first, then the position table, while writers are blocked', () => {
    const implicit = repair.indexOf(
      'LOCK TABLE "_post_ingredients" IN SHARE ROW EXCLUSIVE MODE',
    );
    const positions = repair.indexOf(
      'LOCK TABLE "post_ingredients" IN SHARE ROW EXCLUSIVE MODE',
    );
    const replaced = repair.indexOf(
      'CREATE OR REPLACE FUNCTION mirror_post_ingredient_link_to_positions()',
    );

    expect(implicit).toBeGreaterThan(-1);
    expect(positions).toBeGreaterThan(implicit);
    expect(replaced).toBeGreaterThan(positions);
  });

  it('renumbers one post to contiguous positions in read order', () => {
    const compact = tagged(repair, 'compact');

    expect(compact).toContain(
      'ORDER BY survivor."position" ASC, survivor."id" ASC',
    );
    expect(compact).toContain('(ROW_NUMBER() OVER (');
    expect(compact).toContain('- 1)::INTEGER');
    expect(compact).toContain('survivor."postId" = target_post');
    expect(compact).not.toContain('DELETE FROM');
  });

  it('takes the insert lock before a legacy delete removes and compacts', () => {
    const mirror = tagged(repair, 'mirror');
    const insertAt = mirror.indexOf("IF TG_OP = 'INSERT'");
    const deleteAt = mirror.indexOf('ELSE');
    const insert = mirror.slice(insertAt, deleteAt);
    const deleted = mirror.slice(deleteAt);

    expect(mirror.indexOf('IF pg_trigger_depth() > 1')).toBeGreaterThan(-1);
    expect(insert).toContain(
      `pg_advisory_xact_lock(hashtext('post_ingredients:' || NEW."B"))`,
    );
    expect(insert.indexOf('pg_advisory_xact_lock')).toBeLessThan(
      insert.indexOf('INSERT INTO "post_ingredients"'),
    );
    expect(deleted).toContain(
      `pg_advisory_xact_lock(hashtext('post_ingredients:' || OLD."B"))`,
    );
    expect(deleted.indexOf('pg_advisory_xact_lock')).toBeLessThan(
      deleted.indexOf('DELETE FROM "post_ingredients"'),
    );
    expect(deleted.indexOf('DELETE FROM "post_ingredients"')).toBeLessThan(
      deleted.indexOf('PERFORM compact_post_ingredient_positions(OLD."B")'),
    );
  });

  it('heals every post that already has a gap before the new body is used', () => {
    const heal = tagged(repair, 'heal');

    expect(heal).toContain('SELECT DISTINCT "postId" FROM "post_ingredients"');
    expect(heal).toContain(
      'PERFORM compact_post_ingredient_positions(post_id)',
    );
    expect(repair.indexOf('DO $heal$')).toBeGreaterThan(
      repair.indexOf(
        'CREATE OR REPLACE FUNCTION mirror_post_ingredient_link_to_positions()',
      ),
    );
  });
});

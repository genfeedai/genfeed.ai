import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL(
    './migrations/20260930180000_content_learning/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
describe('additive learning migration', () => {
  it('every added constraint targets a created table or the existing posts table', () => {
    const tables = new Set(
      [...sql.matchAll(/CREATE TABLE "([^"]+)"/g)].map((match) => match[1]),
    );
    for (const match of sql.matchAll(/ALTER TABLE "([^"]+)"/g))
      expect(tables.has(match[1]) || match[1] === 'posts').toBe(true);
  });
  it('adds all fifteen tables with no fabricated history or destructive change', () => {
    expect(sql.match(/CREATE TABLE /g)).toHaveLength(15);
    expect(sql).not.toMatch(/DROP TABLE|INSERT INTO|UPDATE "posts"/);
    expect(sql).toContain('ADD COLUMN     "learningDecisionId" TEXT');
  });
  it('enforces distributions, scope foreign keys and finite reward bounds', () => {
    expect(sql).toContain('learning_decision_distribution_check');
    expect(sql).toContain('learning_reward_bounds_check');
    expect(sql).toContain('learning_consent_account_fk');
    expect(sql).toContain('cardinality("contextVector") = 9');
  });
});

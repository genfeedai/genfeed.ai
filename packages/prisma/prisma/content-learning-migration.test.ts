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

// Explicit opt-in only: never fall back to an application DATABASE_URL.
const isolatedUrl = process.env.CONTENT_LEARNING_TEST_DATABASE_URL;
describe.skipIf(!isolatedUrl)(
  'real isolated PostgreSQL learning constraints',
  () => {
    it('rejects nullable/nonfinite features and null JSON probabilities with the exact learning CHECK', async () => {
      const { assertIsolatedDatabaseUrl } = await import('../src/testing');
      const { Pool } = await import('pg');
      if (!isolatedUrl) throw new Error('Explicit isolated database required');
      assertIsolatedDatabaseUrl(isolatedUrl);
      const pool = new Pool({ connectionString: isolatedUrl });
      const columns =
        '"id","updatedAt","organizationId","brandId","credentialId","requestKey","destinationKey","candidateIndex","payloadHash","scopeKey","epoch","accountRevision","mode","contextVector","contextSnapshot","eligibleArmIds","probabilities","selectedArmId","selectedProbability","assignment","assignmentProbability","executionProbability","configVersion"';
      const insert = `INSERT INTO content_learning_decisions (${columns}) VALUES ('negative-fixture',now(),'no-org','no-brand','no-account','request','destination',0,'hash','scope',0,0,'shadow',$1,'{}',ARRAY['baseline-v1'],$2::jsonb,'baseline-v1',1,'control',1,1,'rl-reward-v1-experimental')`;
      try {
        for (const vector of [
          null,
          [1, 0, 0, 0, 0, 0, 0, 0, Number.NaN],
          [1, 0, 0, 0, 0, 0, 0, 0, Number.POSITIVE_INFINITY],
        ]) {
          await expect(
            pool.query(insert, [
              vector,
              JSON.stringify({
                'baseline-v1': 1,
                'question-example-v1': 0,
                'proof-steps-v1': 0,
              }),
            ]),
          ).rejects.toMatchObject({
            code: '23514',
            constraint: 'learning_decision_vector_check',
          });
        }
        await expect(
          pool.query(insert, [
            Array<number>(9).fill(0),
            JSON.stringify({
              'baseline-v1': null,
              'question-example-v1': null,
              'proof-steps-v1': null,
            }),
          ]),
        ).rejects.toMatchObject({
          code: '23514',
          constraint: 'learning_decision_distribution_check',
        });
      } finally {
        await pool.end();
      }
    });
  },
);

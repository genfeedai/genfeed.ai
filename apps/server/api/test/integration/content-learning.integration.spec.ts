import { describe, expect, it } from 'vitest';
import { assertIsolatedDatabaseUrl } from '../../scripts/assert-isolated-db-url';

// Explicit opt-in only: never fall back to an application DATABASE_URL.
const isolatedUrl = process.env.CONTENT_LEARNING_TEST_DATABASE_URL;
describe.skipIf(!isolatedUrl)(
  'real isolated PostgreSQL learning constraints',
  () => {
    it('rejects nullable/nonfinite features and null JSON probabilities with the exact learning CHECK', async () => {
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
        const datasetInsert = `INSERT INTO content_learning_dataset_entries ("id","updatedAt","datasetId","sourceFingerprint","sourceReference","accountGroup","decisionAt","measuredAt","features","armId","probabilities","reward","split") VALUES ('negative-dataset',now(),'no-dataset','fingerprint','{}','group',now(),now(),$1,'baseline-v1','{}',0,'training')`;
        for (const vector of [
          null,
          [1, 0, 0, 0, 0, 0, 0, 0, null],
          [1, 0, 0, 0, 0, 0, 0, 0, Number.NaN],
          [1, 0, 0, 0, 0, 0, 0, 0, Number.POSITIVE_INFINITY],
        ])
          await expect(
            pool.query(datasetInsert, [vector]),
          ).rejects.toMatchObject({
            code: '23514',
            constraint: 'learning_dataset_numeric_check',
          });
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

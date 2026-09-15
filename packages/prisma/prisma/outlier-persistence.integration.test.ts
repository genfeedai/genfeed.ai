import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

const databaseUrl = process.env.OUTLIER_TEST_DATABASE_URL;
const migration = readFileSync(
  new URL(
    './migrations/20260915143000_outlier_persistence/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
describe.skipIf(!databaseUrl)('outlier PostgreSQL persistence', () => {
  it('applies additive migration, rejects cross-org references, deduplicates and rolls back atomically', async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 2 });
    const client = await pool.connect();
    const second = await pool.connect();
    const schema = `outlier_${process.pid}_${Date.now()}`;
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      await client.query('CREATE TABLE post_analytics (id TEXT PRIMARY KEY)');
      await client.query(migration);
      const snapshot = `INSERT INTO outlier_baseline_snapshots (id,"organizationId","brandId","accountType","accountId",platform,"contentType","inputFingerprint","sampleSize","windowSize","minimumSampleSize","maturityMs","outlierThreshold","breakoutThreshold",status,"computedAt",exclusions,"unknownEligibility","contributorIds","idempotencyKey","updatedAt") VALUES ($1,$2,'b','credential','a','twitter','caption','fp',5,20,5,172800000,3,10,'ready',NOW(),'[]','[]','{}',$3,NOW())`;
      const performance = `INSERT INTO outlier_post_performances (id,"organizationId","brandId","accountType","accountId",platform,"contentType","logicalPostId","measuredAt","baselineSnapshotId","isContributor",eligibility,"exclusionReasons","isPinnedUnknown","isPromotedUnknown","updatedAt") VALUES ($1,$2,'b','credential','a','twitter','caption','post',NOW(),$3,true,'eligible','[]',false,false,NOW())`;
      await client.query(snapshot, ['s', 'org', 'key']);
      await client.query(performance, ['p', 'org', 's']);
      await expect(
        client.query(performance.replace("'post'", "'cross-post'"), [
          'cross',
          'other-org',
          's',
        ]),
      ).rejects.toMatchObject({ code: '23503' });
      await expect(
        client.query(snapshot, ['duplicate', 'org', 'key']),
      ).rejects.toMatchObject({ code: '23505' });
      await expect(
        client.query(performance, ['duplicate-p', 'org', 's']),
      ).rejects.toMatchObject({ code: '23505' });
      await client.query('BEGIN');
      await client.query(snapshot, ['rollback', 'org', 'new-key']);
      await client.query('ROLLBACK');
      expect(
        (
          await client.query(
            "SELECT id FROM outlier_baseline_snapshots WHERE id='rollback'",
          )
        ).rowCount,
      ).toBe(0);
      await second.query(`SET search_path TO "${schema}"`);
      await client.query('BEGIN');
      await client.query(snapshot, ['winner', 'org', 'concurrent']);
      const competing = second.query(snapshot, ['loser', 'org', 'concurrent']);
      const rejected = expect(competing).rejects.toMatchObject({
        code: '23505',
      });
      await client.query('COMMIT');
      await rejected;
      await client.query(snapshot, ['new', 'org', 'changed']);
      expect(
        (
          await client.query(
            'SELECT "baselineSnapshotId" FROM outlier_post_performances',
          )
        ).rows,
      ).toEqual([{ baselineSnapshotId: 's' }]);
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      second.release();
      await pool.end();
    }
  });
});

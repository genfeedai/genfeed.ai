vi.unmock('@genfeedai/prisma');

import { latestWinnerAnalyticsIds } from '@api/collections/outliers/services/winner-latest-analytics.query';
import { CredentialPlatform } from '@genfeedai/prisma';
import { Pool } from 'pg';

const databaseUrl = process.env.OUTLIER_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)(
  'latest winner analytics PostgreSQL query',
  () => {
    it('caps distinct posts, not daily rows, within the tenant scope', async () => {
      const pool = new Pool({ connectionString: databaseUrl, max: 1 });
      const client = await pool.connect();
      const schema = `winner_latest_${process.pid}_${Date.now()}`;
      try {
        await client.query(`CREATE SCHEMA "${schema}"`);
        await client.query(`SET search_path TO "${schema}"`);
        await client.query(
          `CREATE TYPE "CredentialPlatform" AS ENUM ('TWITTER', 'INSTAGRAM')`,
        );
        await client.query(
          `CREATE TABLE posts (id TEXT PRIMARY KEY, "organizationId" TEXT, "brandId" TEXT)`,
        );
        await client.query(
          `CREATE TABLE post_analytics (id TEXT PRIMARY KEY, "postId" TEXT, "organizationId" TEXT, "brandId" TEXT, "isDeleted" BOOLEAN DEFAULT false, platform "CredentialPlatform", "updatedAt" TIMESTAMP, date TIMESTAMP)`,
        );
        await client.query(
          `INSERT INTO posts VALUES ('busy','org','brand'),('old','org','brand'),('other-brand','org','brand-b'),('foreign','foreign','brand')`,
        );
        // 10000 daily rows for one post must not crowd out the older post.
        await client.query(
          `INSERT INTO post_analytics SELECT 'busy-'||i,'busy','org','brand',false,'TWITTER',TIMESTAMP '2026-01-01' + i * INTERVAL '1 hour',TIMESTAMP '2026-01-01' + i * INTERVAL '1 hour' FROM generate_series(1,10000) i`,
        );
        await client.query(
          `INSERT INTO post_analytics VALUES
          ('old-latest','old','org','brand',false,'TWITTER',TIMESTAMP '2025-06-02',TIMESTAMP '2025-06-02'),
          ('old-first','old','org','brand',false,'TWITTER',TIMESTAMP '2025-06-01',TIMESTAMP '2025-06-01'),
          ('busy-instagram','busy','org','brand',false,'INSTAGRAM',TIMESTAMP '2025-01-01',TIMESTAMP '2025-01-01'),
          ('other-brand-row','other-brand','org','brand-b',false,'TWITTER',TIMESTAMP '2025-05-01',TIMESTAMP '2025-05-01'),
          ('foreign-row','foreign','org','brand',false,'TWITTER',NOW(),NOW()),
          ('deleted-row','old','org','brand',true,'TWITTER',TIMESTAMP '2100-01-01',TIMESTAMP '2100-01-01')`,
        );
        const run = async (
          scope: Parameters<typeof latestWinnerAnalyticsIds>[0],
        ) => {
          const query = latestWinnerAnalyticsIds(scope);
          const { rows } = await client.query(query.text, query.values);
          return rows.map((row: { id: string }) => row.id);
        };

        expect(
          await run({ brandId: 'brand', limit: 10, organizationId: 'org' }),
        ).toEqual(['busy-10000', 'old-latest', 'busy-instagram']);
        expect(
          await run({
            brandId: 'brand',
            limit: 10,
            organizationId: 'org',
            platform: CredentialPlatform.TWITTER,
          }),
        ).toEqual(['busy-10000', 'old-latest']);
        expect(await run({ limit: 10, organizationId: 'org' })).toEqual([
          'busy-10000',
          'old-latest',
          'other-brand-row',
          'busy-instagram',
        ]);
        expect(await run({ limit: 1, organizationId: 'org' })).toEqual([
          'busy-10000',
        ]);
      } finally {
        await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        client.release();
        await pool.end();
      }
    });
  },
);

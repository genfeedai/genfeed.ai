vi.unmock('@genfeedai/prisma');

import { latestOutlierAnalyticsIds } from '@api/collections/outliers/services/outlier-latest-analytics.query';
import { CredentialPlatform } from '@genfeedai/prisma';
import { Pool } from 'pg';

const databaseUrl = process.env.OUTLIER_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)(
  'latest outlier observation PostgreSQL query',
  () => {
    it('selects latest distinct posts across more than 10000 daily rows with active tenant scopes', async () => {
      const pool = new Pool({ connectionString: databaseUrl, max: 1 });
      const client = await pool.connect();
      const schema = `outlier_latest_${process.pid}_${Date.now()}`;
      const scope = {
        organizationId: 'org',
        brandId: 'brand',
        accountId: 'account',
        accountType: 'credential' as const,
        platform: 'twitter',
      };
      try {
        await client.query(`CREATE SCHEMA "${schema}"`);
        await client.query(`SET search_path TO "${schema}"`);
        await client.query(
          `CREATE TYPE "CredentialPlatform" AS ENUM ('TWITTER')`,
        );
        await client.query(
          `CREATE TABLE posts (id TEXT PRIMARY KEY, "organizationId" TEXT, "brandId" TEXT, "isDeleted" BOOLEAN DEFAULT false, platform TEXT, "credentialId" TEXT)`,
        );
        await client.query(
          `CREATE TABLE post_analytics (id TEXT PRIMARY KEY, "postId" TEXT, "organizationId" TEXT, "brandId" TEXT, "isDeleted" BOOLEAN DEFAULT false, platform "CredentialPlatform", "credentialId" TEXT, "updatedAt" TIMESTAMP, date TIMESTAMP)`,
        );
        await client.query(
          `INSERT INTO posts VALUES ('p','org','brand',false,'twitter','account'),('legacy','org','brand',false,NULL,'account'),('deleted','org','brand',true,'twitter','account'),('foreign','foreign','brand',false,'twitter','account')`,
        );
        await client.query(
          `INSERT INTO post_analytics SELECT 'day-'||i,'p','org','brand',false,'TWITTER','account',TIMESTAMP '2020-01-01' + i * INTERVAL '1 day',TIMESTAMP '2020-01-01' + i * INTERVAL '1 day' FROM generate_series(1,10001) i`,
        );
        await client.query(
          `INSERT INTO post_analytics VALUES ('legacy-row','legacy','org','brand',false,'TWITTER',NULL,NOW(),NOW()),('deleted-row','deleted','org','brand',false,'TWITTER','account',NOW(),NOW()),('foreign-row','foreign','org','brand',false,'TWITTER','account',NOW(),NOW()),('inactive','p','org','brand',true,'TWITTER','account',TIMESTAMP '2100-01-01',NOW())`,
        );
        const query = latestOutlierAnalyticsIds(
          scope,
          CredentialPlatform.TWITTER,
          0,
        );
        expect((await client.query(query.text, query.values)).rows).toEqual([
          { id: 'legacy-row' },
          { id: 'day-10001' },
        ]);
        const next = latestOutlierAnalyticsIds(
          scope,
          CredentialPlatform.TWITTER,
          200,
        );
        expect((await client.query(next.text, next.values)).rows).toEqual([]);
      } finally {
        await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        client.release();
        await pool.end();
      }
    });
  },
);

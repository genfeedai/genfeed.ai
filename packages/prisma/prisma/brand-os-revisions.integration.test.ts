import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    './migrations/20260914150000_brand_os_revisions/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const databaseUrl = process.env.BRAND_OS_TEST_DATABASE_URL;

// An explicit isolated database is required; never inherit the application database.
describe.skipIf(!databaseUrl)('Brand OS PostgreSQL migration', () => {
  it('enforces approval metadata, unique versions, atomic supersession and competing approvals', async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 3 });
    const client = await pool.connect();
    const second = await pool.connect();
    const schema = `brand_os_${process.pid}_${Date.now()}`;
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      await second.query(`SET search_path TO "${schema}"`);
      await client.query(`
        CREATE TABLE organizations (id TEXT PRIMARY KEY);
        CREATE TABLE users (id TEXT PRIMARY KEY);
        CREATE TABLE brands (id TEXT PRIMARY KEY);
        INSERT INTO organizations VALUES ('org');
        INSERT INTO users VALUES ('owner');
        INSERT INTO brands VALUES ('brand');
      `);
      await client.query(migration);
      const insert = `INSERT INTO brand_os_revisions (id,"organizationId","brandId",version,content,"updatedAt") VALUES ($1,'org','brand',$2,'{}',NOW())`;
      await client.query(insert, ['one', 1]);
      await client.query(insert, ['two', 2]);
      await client.query(insert, ['three', 3]);
      await expect(
        client.query(insert, ['duplicate', 1]),
      ).rejects.toMatchObject({ code: '23505' });
      await expect(
        client.query(
          `UPDATE brand_os_revisions SET status='APPROVED' WHERE id='one'`,
        ),
      ).rejects.toMatchObject({ code: '23514' });
      const approve = `UPDATE brand_os_revisions SET status='APPROVED',"approvedById"='owner',"approvedAt"=NOW() WHERE id=$1`;
      await client.query(approve, ['one']);
      await client.query('BEGIN');
      await client.query(
        `UPDATE brand_os_revisions SET status='SUPERSEDED' WHERE id='one'`,
      );
      await client.query(approve, ['two']);
      await client.query('ROLLBACK');
      expect(
        (
          await client.query(
            `SELECT id FROM brand_os_revisions WHERE status='APPROVED'`,
          )
        ).rows,
      ).toEqual([{ id: 'one' }]);
      await client.query(
        `UPDATE brand_os_revisions SET status='SUPERSEDED' WHERE id='one'`,
      );
      await client.query('BEGIN');
      await client.query(approve, ['two']);
      const competing = second.query(approve, ['three']);
      const competingResult = expect(competing).rejects.toMatchObject({
        code: '23505',
      });
      await client.query('COMMIT');
      await competingResult;
      expect(
        (
          await client.query(
            `SELECT id FROM brand_os_revisions WHERE status='APPROVED'`,
          )
        ).rows,
      ).toEqual([{ id: 'two' }]);
      await expect(
        client.query(`DELETE FROM users WHERE id='owner'`),
      ).rejects.toMatchObject({ code: '23503' });
      await client.query(
        `INSERT INTO brand_os_publications (id,"organizationId","brandId","revisionId","publishedById","updatedAt") VALUES ('public','org','brand','two','owner',NOW())`,
      );
      await expect(
        client.query(
          `INSERT INTO brand_os_publications (id,"organizationId","brandId","revisionId","publishedById","updatedAt") VALUES ('duplicate','org','brand','two','owner',NOW())`,
        ),
      ).rejects.toMatchObject({ code: '23505' });
    } finally {
      await client.query('ROLLBACK');
      await client.query('RESET search_path');
      await second.query('RESET search_path');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      second.release();
      await pool.end();
    }
  });
});

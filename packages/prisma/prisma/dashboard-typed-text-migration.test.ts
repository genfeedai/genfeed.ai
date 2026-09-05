import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

const migrationSource = readFileSync(
  fileURLToPath(
    new URL(
      './migrations/20260905143000_retire_dashboard_markdown_blocks/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);
const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres('dashboard typed text migration on PostgreSQL', () => {
  it('preserves content, metadata, nested order and unrelated documents across repeated runs', async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    const longText = 'x'.repeat(4000);
    const documents = [
      {
        version: 'genfeed.dashboard.openui.v1',
        blocks: [
          {
            id: 'text',
            type: 'markdown',
            content: longText,
            title: 'Recap',
            width: 'half',
          },
          {
            id: 'group',
            type: 'composite',
            blocks: [
              { id: 'nested', type: 'markdown', content: 'Nested summary' },
            ],
          },
          { id: 'metric', type: 'metric_card', value: 42 },
        ],
      },
      {
        blocks: [
          { id: 'typed', type: 'text_paragraph', text: 'Already typed' },
        ],
      },
      {},
      { blocks: null },
    ];
    try {
      await client.query('BEGIN');
      await client.query(
        'CREATE TEMP TABLE dashboard_layouts (id integer PRIMARY KEY, document jsonb) ON COMMIT DROP',
      );
      for (const [id, document] of documents.entries()) {
        await client.query('INSERT INTO dashboard_layouts VALUES ($1, $2)', [
          id,
          JSON.stringify(document),
        ]);
      }
      await client.query(migrationSource);
      const first = await client.query<{ document: unknown }>(
        'SELECT document FROM dashboard_layouts ORDER BY id',
      );
      expect(first.rows.map((row) => row.document)).toEqual([
        {
          version: 'genfeed.dashboard.openui.v1',
          blocks: [
            {
              id: 'text',
              type: 'text_paragraph',
              text: longText,
              title: 'Recap',
              width: 'half',
            },
            {
              id: 'group',
              type: 'composite',
              blocks: [
                {
                  id: 'nested',
                  type: 'text_paragraph',
                  text: 'Nested summary',
                },
              ],
            },
            { id: 'metric', type: 'metric_card', value: 42 },
          ],
        },
        ...documents.slice(1),
      ]);
      await client.query(migrationSource);
      const second = await client.query(
        'SELECT document FROM dashboard_layouts ORDER BY id',
      );
      expect(second.rows).toEqual(first.rows);
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  });
});

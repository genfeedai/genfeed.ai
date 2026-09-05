import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import type { Client, QueryResult } from 'pg';

export const CREDENTIAL_BACKFILL_VERSION = 'credential-encryption-v1';
const SECRET_FIELDS = [
  'accessToken',
  'accessTokenSecret',
  'oauthToken',
  'oauthTokenSecret',
  'refreshToken',
] as const;
const CIPHERTEXT_PATTERN = /^[0-9a-f]{32}:(?:[0-9a-f]{2})+:[0-9a-f]{32}$/i;
type SecretField = (typeof SECRET_FIELDS)[number];
type CredentialRow = { id: string } & Record<SecretField, string | null>;

export type CredentialBackfillArgs = { dryRun: boolean; batchSize: number };
export type CredentialBackfillReport = {
  skipped: boolean;
  rowsScanned: number;
  rowsUpdated: number;
  fieldsEncrypted: number;
};

export function parseCredentialBackfillArgs(
  args: readonly string[],
): CredentialBackfillArgs {
  let batchSize = 100;
  for (const arg of args) {
    if (arg === '--live' || arg === '--dry-run') continue;
    if (!/^--batch=[1-9]\d*$/.test(arg))
      throw new Error(
        'Expected --live, --dry-run, or --batch=<positive integer>',
      );
    batchSize = Number(arg.slice('--batch='.length));
    if (batchSize > 5000) throw new Error('--batch must be at most 5000');
  }
  if (args.includes('--live') && args.includes('--dry-run'))
    throw new Error('Choose either --dry-run or --live');
  return { batchSize, dryRun: !args.includes('--live') };
}

/**
 * Runs only after encrypt-on-write services are stable. The dedicated connection
 * holds the advisory lock across bounded batch transactions. Failed batches roll
 * back; retries skip previously committed ciphertext. Row locks protect refreshes.
 * This cross-tenant maintenance includes deleted credentials with retained secrets.
 */
export async function runCredentialEncryptionBackfill(
  client: Client,
  args: CredentialBackfillArgs,
  secret: string,
): Promise<CredentialBackfillReport> {
  if (!secret) throw new Error('TOKEN_ENCRYPTION_KEY is required');
  if (
    !Number.isInteger(args.batchSize) ||
    args.batchSize < 1 ||
    args.batchSize > 5000
  ) {
    throw new Error('batchSize must be an integer between 1 and 5000');
  }
  const key = createHash('sha256').update(secret).digest();
  const report: CredentialBackfillReport = {
    skipped: false,
    rowsScanned: 0,
    rowsUpdated: 0,
    fieldsEncrypted: 0,
  };
  let acquired = false;
  let failed = false;
  try {
    if (!args.dryRun) {
      const lock = await client.query<{ acquired: boolean }>(
        'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
        [CREDENTIAL_BACKFILL_VERSION],
      );
      acquired = lock.rows[0]?.acquired === true;
      if (!acquired) {
        throw new Error(
          'Credential backfill is already running; retry after it finishes',
        );
      }
      const completed = await client.query(
        'SELECT id FROM data_backfills WHERE id = $1',
        [CREDENTIAL_BACKFILL_VERSION],
      );
      if (completed.rowCount) return { ...report, skipped: true };
    }

    const columns = SECRET_FIELDS.map((field) => `"${field}"`).join(', ');
    let afterId: string | null = null;
    for (;;) {
      await client.query('BEGIN');
      try {
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SET LOCAL statement_timeout = '120s'");
        await client.query(
          "SET LOCAL idle_in_transaction_session_timeout = '30s'",
        );
        const rows: QueryResult<CredentialRow> =
          await client.query<CredentialRow>(
            `SELECT id, ${columns} FROM credentials
           WHERE ($1::text IS NULL OR id > $1)
           ORDER BY id LIMIT $2 ${args.dryRun ? '' : 'FOR UPDATE'}`,
            [afterId, args.batchSize],
          );
        if (!rows.rowCount) {
          // The session lock excludes other backfill runners until this final
          // transaction commits. Encrypt-on-write services own concurrent inserts.
          if (!args.dryRun) {
            await client.query(
              'INSERT INTO data_backfills (id, report) VALUES ($1, $2::jsonb)',
              [CREDENTIAL_BACKFILL_VERSION, JSON.stringify(report)],
            );
          }
          await client.query('COMMIT');
          return report;
        }
        for (const row of rows.rows) {
          report.rowsScanned += 1;
          const updates: string[] = [];
          const values: string[] = [row.id];
          for (const field of SECRET_FIELDS) {
            const value = row[field];
            if (!value || CIPHERTEXT_PATTERN.test(value)) continue;
            const iv = randomBytes(16);
            const cipher = createCipheriv('aes-256-gcm', key, iv);
            const encrypted = Buffer.concat([
              cipher.update(value, 'utf8'),
              cipher.final(),
            ]);
            values.push(
              `${iv.toString('hex')}:${encrypted.toString('hex')}:${cipher.getAuthTag().toString('hex')}`,
            );
            updates.push(`"${field}" = $${values.length}`);
            report.fieldsEncrypted += 1;
          }
          if (!updates.length) continue;
          report.rowsUpdated += 1;
          if (!args.dryRun) {
            await client.query(
              `UPDATE credentials SET ${updates.join(', ')} WHERE id = $1`,
              values,
            );
          }
        }
        await client.query('COMMIT');
        afterId = rows.rows.at(-1)?.id ?? null;
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Preserve the query failure if a lost connection also prevents rollback.
          // The caller closes this dedicated connection in its finally block.
        }
        throw error;
      }
    }
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    if (acquired) await releaseBackfillLock(client, failed);
  }
}

async function releaseBackfillLock(
  client: Client,
  preserveFailure: boolean,
): Promise<void> {
  try {
    await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [
      CREDENTIAL_BACKFILL_VERSION,
    ]);
  } catch (error) {
    if (!preserveFailure) throw error;
  }
}

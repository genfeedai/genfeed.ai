import { Client } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import {
  parseCredentialBackfillArgs,
  runCredentialEncryptionBackfill,
} from './credential-encryption-backfill';

describe('credential encryption backfill arguments', () => {
  it('defaults to a read-only dry run', () => {
    expect(parseCredentialBackfillArgs([])).toEqual({
      dryRun: true,
      batchSize: 100,
    });
    expect(parseCredentialBackfillArgs(['--live', '--batch=5000'])).toEqual({
      dryRun: false,
      batchSize: 5000,
    });
  });
  it.each([
    '--batch=0',
    '--batch=-1',
    '--batch=NaN',
    '--batch=5junk',
    '--batch=5001',
    '--batch=1.5',
    '--unknown',
  ])('rejects invalid input %s before connecting', (arg) => {
    expect(() => parseCredentialBackfillArgs([arg])).toThrow();
  });
  it('rejects conflicting write intent', () => {
    expect(() => parseCredentialBackfillArgs(['--live', '--dry-run'])).toThrow(
      'Choose either',
    );
  });
});

describe('credential backfill cleanup errors', () => {
  it('preserves the original query error when rollback and unlock fail', async () => {
    const client = new Client();
    const failure = new Error(
      'database connection lost while reading credentials',
    );
    vi.spyOn(client, 'query').mockImplementation((async (sql: string) => {
      if (sql.includes('pg_try_advisory_lock'))
        return { rows: [{ acquired: true }] };
      if (sql.startsWith('SELECT id FROM data_backfills'))
        return { rows: [], rowCount: 0 };
      if (sql.includes('FROM credentials')) throw failure;
      if (sql === 'ROLLBACK' || sql.includes('pg_advisory_unlock'))
        throw new Error('connection is closed');
      return { rows: [], rowCount: 0 };
    }) as never);
    await expect(
      runCredentialEncryptionBackfill(
        client,
        { dryRun: false, batchSize: 1 },
        'synthetic-test-key',
      ),
    ).rejects.toBe(failure);
  });

  it('fails closed if unlock fails after an otherwise successful skip', async () => {
    const client = new Client();
    const failure = new Error('unlock connection failed');
    vi.spyOn(client, 'query').mockImplementation((async (sql: string) => {
      if (sql.includes('pg_try_advisory_lock'))
        return { rows: [{ acquired: true }] };
      if (sql.includes('pg_advisory_unlock')) throw failure;
      return { rows: [{ id: 'credential-encryption-v1' }], rowCount: 1 };
    }) as never);
    await expect(
      runCredentialEncryptionBackfill(
        client,
        { dryRun: false, batchSize: 1 },
        'synthetic-test-key',
      ),
    ).rejects.toBe(failure);
  });
});

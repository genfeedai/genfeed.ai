import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PGlite, Transaction } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runDesktopPrismaMigrations } from '../src/migrations';

const MIGRATIONS_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../prisma/migrations',
);

interface RecordedInsert {
  params: unknown[];
  sql: string;
}

interface FakePGlite {
  execCalls: string[];
  insertedMigrationNames: string[];
  inserts: RecordedInsert[];
  instance: PGlite;
  transactionCount: number;
}

function buildFakePGlite(appliedMigrationNames: string[]): FakePGlite {
  const execCalls: string[] = [];
  const inserts: RecordedInsert[] = [];
  const state = {
    transactionCount: 0,
  };

  const transactionStub = {
    exec: (sql: string): Promise<void> => {
      execCalls.push(sql);
      return Promise.resolve();
    },
    query: (sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> => {
      inserts.push({ params: params ?? [], sql });
      return Promise.resolve({ rows: [] });
    },
  };

  const instance = {
    exec: (sql: string): Promise<void> => {
      execCalls.push(sql);
      return Promise.resolve();
    },
    query: (): Promise<{ rows: Array<{ migration_name: string }> }> =>
      Promise.resolve({
        rows: appliedMigrationNames.map((name) => ({ migration_name: name })),
      }),
    transaction: async (
      callback: (tx: Transaction) => Promise<void>,
    ): Promise<void> => {
      state.transactionCount += 1;
      await callback(transactionStub as unknown as Transaction);
    },
  } as unknown as PGlite;

  return {
    execCalls,
    get insertedMigrationNames() {
      return inserts.map((insert) => String(insert.params[3]));
    },
    inserts,
    instance,
    get transactionCount() {
      return state.transactionCount;
    },
  };
}

describe('runDesktopPrismaMigrations', () => {
  let migrationNames: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    const entries = await fs.readdir(MIGRATIONS_DIRECTORY, {
      withFileTypes: true,
    });
    migrationNames = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));

    expect(migrationNames.length).toBeGreaterThan(0);
  });

  it('creates the bookkeeping table and applies every migration on a fresh database', async () => {
    const fake = buildFakePGlite([]);

    await runDesktopPrismaMigrations(fake.instance);

    expect(fake.execCalls[0]).toContain(
      'CREATE TABLE IF NOT EXISTS _prisma_migrations',
    );
    expect(fake.transactionCount).toBe(migrationNames.length);
    expect(fake.insertedMigrationNames).toEqual(migrationNames);
    for (const insert of fake.inserts) {
      expect(insert.sql).toContain('INSERT INTO _prisma_migrations');
      expect(insert.params).toHaveLength(6);
      expect(insert.params[5]).toBe(1);
    }
  });

  it('skips migrations that are already applied', async () => {
    const applied = migrationNames.slice(0, 1);
    const fake = buildFakePGlite(applied);

    await runDesktopPrismaMigrations(fake.instance);

    expect(fake.transactionCount).toBe(migrationNames.length - 1);
    expect(fake.insertedMigrationNames).toEqual(migrationNames.slice(1));
  });

  it('is a no-op when every migration is already applied', async () => {
    const fake = buildFakePGlite(migrationNames);

    await runDesktopPrismaMigrations(fake.instance);

    expect(fake.transactionCount).toBe(0);
    expect(fake.inserts).toEqual([]);
  });

  it('propagates unexpected migration directory errors', async () => {
    const fake = buildFakePGlite([]);
    const permissionError = Object.assign(new Error('Permission denied'), {
      code: 'EACCES',
    });
    vi.spyOn(fs, 'stat').mockRejectedValue(permissionError);

    await expect(runDesktopPrismaMigrations(fake.instance)).rejects.toBe(
      permissionError,
    );
  });
});

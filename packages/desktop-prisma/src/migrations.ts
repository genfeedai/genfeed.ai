import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PGlite } from '@electric-sql/pglite';

const MIGRATIONS_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../prisma/migrations',
);

interface MigrationFile {
  id: string;
  sql: string;
}

async function loadMigrationFiles(): Promise<MigrationFile[]> {
  const entries = await fs.readdir(MIGRATIONS_DIRECTORY, {
    withFileTypes: true,
  });

  const migrations = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(async (entry) => {
        const sql = await fs.readFile(
          path.join(MIGRATIONS_DIRECTORY, entry.name, 'migration.sql'),
          'utf8',
        );

        return {
          id: entry.name,
          sql,
        };
      }),
  );

  return migrations;
}

export async function runDesktopPrismaMigrations(
  pglite: PGlite,
): Promise<void> {
  await pglite.exec(`
    CREATE TABLE IF NOT EXISTS _prisma_migrations (
      id TEXT PRIMARY KEY,
      checksum TEXT,
      finished_at TEXT,
      migration_name TEXT NOT NULL,
      logs TEXT,
      rolled_back_at TEXT,
      started_at TEXT NOT NULL,
      applied_steps_count INTEGER NOT NULL DEFAULT 0
    )
  `);

  const appliedRows = await pglite.query<{
    migration_name: string;
  }>('SELECT migration_name FROM _prisma_migrations');
  const appliedNames = new Set(
    appliedRows.rows.map((row) => row.migration_name),
  );
  const migrations = await loadMigrationFiles();

  for (const migration of migrations) {
    if (appliedNames.has(migration.id)) {
      continue;
    }

    const startedAt = new Date().toISOString();

    await pglite.transaction(async (tx) => {
      await tx.exec(migration.sql);
      await tx.query(
        `INSERT INTO _prisma_migrations (
          id,
          checksum,
          finished_at,
          migration_name,
          started_at,
          applied_steps_count
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          migration.id,
          migration.id,
          new Date().toISOString(),
          migration.id,
          startedAt,
          1,
        ],
      );
    });
  }
}

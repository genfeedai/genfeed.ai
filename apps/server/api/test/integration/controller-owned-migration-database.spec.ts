import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import {
  assertControllerOwnedMigrationConnection,
  assertControllerOwnedMigrationInventory,
  CONTROLLER_OWNED_MIGRATION_DATABASES,
  type ControllerOwnedMigrationQuery,
  type ControllerOwnedMigrationRole,
  type ControllerOwnedMigrationRow,
  readControllerOwnedMigrationDatabaseUrl,
} from '@api-test/helpers/controller-owned-migration-database';
import { describe, expect, it } from 'vitest';

function databaseUrl(role: ControllerOwnedMigrationRole): string {
  return `postgresql://fixture@127.0.0.1:5432/${CONTROLLER_OWNED_MIGRATION_DATABASES[role]}`;
}

function connection(
  role: ControllerOwnedMigrationRole,
  database: string = CONTROLLER_OWNED_MIGRATION_DATABASES[role],
  schema: string = 'public',
  relations: string[] = [],
): ControllerOwnedMigrationQuery {
  return {
    async query(sql) {
      return {
        rows: sql.includes('current_database()')
          ? [{ database, schema }]
          : relations.map((relname) => ({ relname })),
      };
    },
  };
}

async function actualMigrationInventory() {
  const directory = new URL(
    '../../../../../packages/prisma/prisma/migrations/',
    import.meta.url,
  );
  const names = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  return Promise.all(
    names.map(async (migration_name) => ({
      migration_name,
      checksum: createHash('sha256')
        .update(
          await readFile(new URL(`${migration_name}/migration.sql`, directory)),
        )
        .digest('hex'),
    })),
  );
}

describe('controller-owned canonical-public migration database', () => {
  it.each([
    'learning-runtime',
    'learning-races',
    'brand-acceptance',
    'dataset-correctness',
    'dataset-matrix',
    'dataset-profile',
  ] as const)(
    'accepts only the exact URL and fresh public connection for %s',
    async (role) => {
      expect(
        readControllerOwnedMigrationDatabaseUrl(role, databaseUrl(role)),
      ).toBe(databaseUrl(role));
      await expect(
        assertControllerOwnedMigrationConnection(connection(role), role, true),
      ).resolves.toBeUndefined();
    },
  );

  it.each([
    'learning-runtime',
    'learning-races',
    'brand-acceptance',
    'dataset-correctness',
    'dataset-matrix',
    'dataset-profile',
  ] as const)(
    'rejects missing, wrong-name, remote, hash and query URLs for %s',
    (role) => {
      for (const value of [
        undefined,
        'postgresql://fixture@127.0.0.1:5432/another_test',
        databaseUrl(role).replace('127.0.0.1', 'remote.invalid'),
        `${databaseUrl(role)}#fragment`,
        `${databaseUrl(role)}?schema=public`,
      ])
        expect(() =>
          readControllerOwnedMigrationDatabaseUrl(role, value),
        ).toThrow();
      expect(() =>
        Reflect.apply(readControllerOwnedMigrationDatabaseUrl, undefined, [
          'unknown-role',
          databaseUrl(role),
        ]),
      ).toThrow('INVALID_ROLE');
    },
  );

  it.each([
    'learning-runtime',
    'learning-races',
    'brand-acceptance',
    'dataset-correctness',
    'dataset-matrix',
    'dataset-profile',
  ] as const)(
    'rejects crossed database and schema identity for %s',
    async (role) => {
      await expect(
        assertControllerOwnedMigrationConnection(
          connection(role, 'another_test'),
          role,
        ),
      ).rejects.toThrow('CONNECTION_IDENTITY');
      await expect(
        assertControllerOwnedMigrationConnection(
          connection(
            role,
            CONTROLLER_OWNED_MIGRATION_DATABASES[role],
            'other_schema',
          ),
          role,
        ),
      ).rejects.toThrow('CONNECTION_IDENTITY');
      await expect(
        assertControllerOwnedMigrationConnection(
          { query: async () => ({ rows: [] }) },
          role,
        ),
      ).rejects.toThrow('CONNECTION_IDENTITY');
    },
  );

  it.each(['existing_application_table', '_prisma_migrations'])(
    'rejects nonfresh public relation %s before deployment',
    async (relation) => {
      await expect(
        assertControllerOwnedMigrationConnection(
          connection('learning-runtime', undefined, 'public', [relation]),
          'learning-runtime',
          true,
        ),
      ).rejects.toThrow('PUBLIC_NOT_FRESH');
    },
  );

  it('accepts the complete repository migration checksums and rejects altered, missing, duplicate, unfinished or rolled-back history', async () => {
    const expected = await actualMigrationInventory();
    expect(expected.length).toBeGreaterThan(0);
    const rows: ControllerOwnedMigrationRow[] = expected.map((entry) => ({
      ...entry,
      finished_at: new Date(0),
      rolled_back_at: null,
    }));
    expect(() =>
      assertControllerOwnedMigrationInventory(rows, expected),
    ).not.toThrow();
    for (const kind of [
      'checksum',
      'missing',
      'duplicate',
      'unfinished',
      'rolled-back',
      'reordered',
    ]) {
      const changed = rows.map((row) => ({ ...row }));
      if (kind === 'checksum') changed[0].checksum = '0'.repeat(64);
      if (kind === 'missing') changed.pop();
      if (kind === 'duplicate') changed[1] = { ...changed[0] };
      if (kind === 'unfinished') changed[0].finished_at = null;
      if (kind === 'rolled-back') changed[0].rolled_back_at = new Date(0);
      if (kind === 'reordered') changed.reverse();
      expect(() =>
        assertControllerOwnedMigrationInventory(changed, expected),
      ).toThrow('INCOMPLETE_MIGRATION_CHECKSUM_INVENTORY');
    }
  });
});

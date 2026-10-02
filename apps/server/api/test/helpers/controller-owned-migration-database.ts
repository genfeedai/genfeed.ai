import { assertIsolatedDatabaseUrl } from '@api-test/../scripts/assert-isolated-db-url';

export type ControllerOwnedMigrationRole =
  | 'learning-runtime'
  | 'learning-races'
  | 'brand-acceptance';

export const CONTROLLER_OWNED_MIGRATION_DATABASES = {
  'learning-runtime': 'genfeed_learning_runtime_test',
  'learning-races': 'genfeed_learning_races_test',
  'brand-acceptance': 'genfeed_branded_acceptance_test',
} as const;

export interface ControllerOwnedMigrationQueryResult {
  rows: Record<string, unknown>[];
}

export interface ControllerOwnedMigrationQuery {
  query(sql: string): Promise<ControllerOwnedMigrationQueryResult>;
}

export interface ControllerOwnedMigrationRow {
  migration_name: string;
  checksum: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
}

export interface ControllerOwnedMigrationExpected {
  migration_name: string;
  checksum: string;
}

function requireMigrationDatabase(value: unknown, code: string): asserts value {
  if (!value) throw new Error(`Controller-owned migration database: ${code}`);
}

export function readControllerOwnedMigrationDatabaseUrl(
  role: ControllerOwnedMigrationRole,
  value: string | undefined,
): string {
  requireMigrationDatabase(
    Object.hasOwn(CONTROLLER_OWNED_MIGRATION_DATABASES, role),
    'INVALID_ROLE',
  );
  requireMigrationDatabase(value, 'EXPLICIT_DATABASE_URL_REQUIRED');
  const url = new URL(assertIsolatedDatabaseUrl(value));
  requireMigrationDatabase(
    !url.search &&
      !url.hash &&
      url.pathname === `/${CONTROLLER_OWNED_MIGRATION_DATABASES[role]}`,
    'ROLE_DATABASE_URL',
  );
  return url.toString();
}

export function assertControllerOwnedMigrationIdentity(
  row: Record<string, unknown> | undefined,
  role: ControllerOwnedMigrationRole,
): void {
  requireMigrationDatabase(
    Object.hasOwn(CONTROLLER_OWNED_MIGRATION_DATABASES, role) &&
      row?.database === CONTROLLER_OWNED_MIGRATION_DATABASES[role] &&
      row.schema === 'public',
    'CONNECTION_IDENTITY',
  );
}

export async function assertControllerOwnedMigrationConnection(
  client: ControllerOwnedMigrationQuery,
  role: ControllerOwnedMigrationRole,
  fresh = false,
): Promise<void> {
  const identity = await client.query(
    'SELECT current_database() AS database, current_schema() AS schema',
  );
  requireMigrationDatabase(identity.rows.length === 1, 'CONNECTION_IDENTITY');
  assertControllerOwnedMigrationIdentity(identity.rows[0], role);
  if (fresh) {
    const relations = await client.query(
      "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')",
    );
    requireMigrationDatabase(relations.rows.length === 0, 'PUBLIC_NOT_FRESH');
  }
}

export function assertControllerOwnedMigrationInventory(
  rows: readonly ControllerOwnedMigrationRow[],
  expected: readonly ControllerOwnedMigrationExpected[],
): void {
  requireMigrationDatabase(
    expected.length > 0 &&
      rows.length === expected.length &&
      new Set(expected.map((entry) => entry.migration_name)).size ===
        expected.length &&
      rows.every(
        (row, index) =>
          row.migration_name === expected[index].migration_name &&
          /^[0-9a-f]{64}$/.test(expected[index].checksum) &&
          row.checksum === expected[index].checksum &&
          row.finished_at instanceof Date &&
          !Number.isNaN(row.finished_at.getTime()) &&
          row.rolled_back_at === null,
      ),
    'INCOMPLETE_MIGRATION_CHECKSUM_INVENTORY',
  );
}

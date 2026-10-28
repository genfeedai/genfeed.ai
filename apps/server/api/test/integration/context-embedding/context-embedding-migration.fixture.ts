import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  access,
  cp,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { Client } from 'pg';

const command = promisify(execFile);
export const EMBEDDING_MIGRATION = '20261022090000_context_embedding_queue';
export const MIGRATION_ROOT = resolve(
  import.meta.dirname,
  '../../../../../../packages/prisma/prisma/migrations',
);
const SCHEMA_PATH = resolve(MIGRATION_ROOT, '../schema.prisma');
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

function packageRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export async function resolvePrismaMigrationTools(
  ownerManifest = resolve(MIGRATION_ROOT, '../../package.json'),
): Promise<{ configModule: string; cli: string; version: string }> {
  const owner: unknown = JSON.parse(await readFile(ownerManifest, 'utf8'));
  if (
    !packageRecord(owner) ||
    !packageRecord(owner.dependencies) ||
    typeof owner.dependencies.prisma !== 'string'
  ) {
    throw new Error(
      'The migration owner must declare its exact Prisma dependency',
    );
  }
  const ownerRequire = createRequire(ownerManifest);
  const configModule = pathToFileURL(
    ownerRequire.resolve('prisma/config'),
  ).href;
  const packagePath = ownerRequire.resolve('prisma/package.json');
  const manifest: unknown = JSON.parse(await readFile(packagePath, 'utf8'));
  if (
    !packageRecord(manifest) ||
    typeof manifest.version !== 'string' ||
    manifest.version !== owner.dependencies.prisma
  ) {
    throw new Error(
      'Resolved Prisma version does not match its owning package declaration',
    );
  }
  const bin =
    typeof manifest.bin === 'string'
      ? manifest.bin
      : packageRecord(manifest.bin)
        ? manifest.bin.prisma
        : undefined;
  if (typeof bin !== 'string' || !bin) {
    throw new Error('Resolved Prisma package has no CLI entrypoint');
  }
  const cli = resolve(dirname(packagePath), bin);
  await access(cli);
  return { configModule, cli, version: manifest.version };
}

export interface ContextEmbeddingTransportBinding {
  host: string;
  port: number;
  db: 0;
  prefix: string;
}

export function inspectContextEmbeddingTransport(
  connection: unknown,
  prefix: unknown,
  redisUrl: URL,
  expectedPrefix: string,
): ContextEmbeddingTransportBinding {
  if (
    !packageRecord(connection) ||
    typeof connection.host !== 'string' ||
    typeof connection.port !== 'number' ||
    connection.host !== redisUrl.hostname ||
    connection.port !== Number(redisUrl.port || '6379') ||
    connection.db !== 0 ||
    typeof prefix !== 'string' ||
    prefix !== expectedPrefix ||
    !expectedPrefix.startsWith('context-embedding-acceptance-')
  ) {
    throw new Error('Uninspectable or foreign context embedding transport');
  }
  return {
    host: connection.host,
    port: connection.port,
    db: connection.db,
    prefix,
  };
}

export async function closeContextEmbeddingResources(
  closers: ReadonlyArray<() => void | Promise<void>>,
  initializationError?: unknown,
): Promise<void> {
  const errors: unknown[] =
    initializationError === undefined ? [] : [initializationError];
  for (const close of closers) {
    try {
      await close();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1 && initializationError !== undefined)
    throw initializationError;
  if (errors.length)
    throw new AggregateError(
      errors,
      'Context embedding setup or cleanup failed',
    );
}

export function dedicatedDatabaseUrl(kind: 'runtime' | 'upgrade'): string {
  if (process.env.CONTEXT_EMBEDDING_ACCEPTANCE !== '1')
    throw new Error(
      'Context embedding acceptance requires its explicit disposable runtime flag',
    );
  const key =
    kind === 'runtime'
      ? 'CONTEXT_EMBEDDING_TEST_DATABASE_URL'
      : 'CONTEXT_EMBEDDING_UPGRADE_DATABASE_URL';
  const value = process.env[key];
  if (!value)
    throw new Error(key + ' is required; DATABASE_URL is never a fallback');
  const url = new URL(value);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !LOOPBACK.has(url.hostname) ||
    decodeURIComponent(url.username) !== 'context_embedding_test' ||
    decodeURIComponent(url.pathname) !==
      (kind === 'runtime'
        ? '/genfeed_context_embedding_test'
        : '/genfeed_context_embedding_upgrade_test') ||
    url.searchParams.has('schema')
  )
    throw new Error(
      'Context embedding databases must be distinct dedicated loopback test databases',
    );
  return value;
}

export function validateContextEmbeddingRuntime(input: {
  nodeVersion: string;
  bunVersion: string;
  selector: string;
  packageManager: string;
  ciCheckRuntime: string | undefined;
  platform: string;
  architecture: string;
}) {
  const node = input.nodeVersion.trim();
  const bun = input.bunVersion.trim();
  const selector = input.selector.trim();
  const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
  if (
    input.platform !== 'linux' ||
    input.architecture !== 'x64' ||
    !/^24\.\d+\.\d+$/.test(node) ||
    !stableVersion.test(bun) ||
    (selector !== 'latest' &&
      (!stableVersion.test(selector) || selector !== bun)) ||
    input.ciCheckRuntime !== 'Linux/X64/' + bun + '/v' + node
  )
    throw new Error(
      'Context embedding acceptance requires the declared selector and exact canonical Linux/X64 Node 24 CI runtime identity',
    );
  return {
    node,
    bun,
    bunSelector: selector,
    packageManager: input.packageManager,
    ciCheckRuntime: input.ciCheckRuntime,
  };
}

export async function acceptanceEnvironment() {
  const runtime = new URL(dedicatedDatabaseUrl('runtime'));
  const upgrade = new URL(dedicatedDatabaseUrl('upgrade'));
  if (
    runtime.origin !== upgrade.origin ||
    runtime.host !== upgrade.host ||
    runtime.pathname === upgrade.pathname
  )
    throw new Error(
      'Runtime and upgrade require separate databases on their disposable instance',
    );
  const candidate = process.env.CONTEXT_EMBEDDING_CANDIDATE_SHA;
  const { stdout: head } = await command('git', ['rev-parse', 'HEAD']);
  if (
    !candidate ||
    !/^[a-f0-9]{40}$/.test(candidate) ||
    head.trim() !== candidate
  )
    throw new Error(
      'Context embedding acceptance requires the exact checked-out candidate head',
    );
  const root = resolve(MIGRATION_ROOT, '../../../..');
  const manifest: unknown = JSON.parse(
    await readFile(join(root, 'package.json'), 'utf8'),
  );
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    !('packageManager' in manifest) ||
    typeof manifest.packageManager !== 'string'
  )
    throw new Error(
      'Acceptance requires the actual checked-out packageManager declaration',
    );
  const { stdout: bun } = await command('bun', ['--version']);
  const identity = validateContextEmbeddingRuntime({
    nodeVersion: process.versions.node,
    bunVersion: bun,
    selector: await readFile(join(root, '.bun-version'), 'utf8'),
    packageManager: manifest.packageManager,
    ciCheckRuntime: process.env.CI_CHECK_RUNTIME,
    platform: process.platform,
    architecture: process.arch,
  });
  return { candidateSHA: candidate, ...identity };
}

export async function connectDedicated(
  kind: 'runtime' | 'upgrade',
): Promise<Client> {
  const client = new Client({ connectionString: dedicatedDatabaseUrl(kind) });
  await client.connect();
  const identity = await client.query<{
    database: string;
    role: string;
    version: number;
  }>(
    "SELECT current_database() AS database, current_user AS role, current_setting('server_version_num')::int AS version",
  );
  const row = identity.rows[0];
  if (
    row.database !==
      (kind === 'runtime'
        ? 'genfeed_context_embedding_test'
        : 'genfeed_context_embedding_upgrade_test') ||
    row.role !== 'context_embedding_test' ||
    Math.floor(row.version / 10000) !== 17
  ) {
    await client.end();
    throw new Error(
      'Disposable database identity or PostgreSQL 17 runtime did not match',
    );
  }
  return client;
}

export async function migrationInventory(
  includeEmbedding = true,
): Promise<Array<{ name: string; checksum: string }>> {
  const directories = (await readdir(MIGRATION_ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const rows = [];
  for (const name of directories) {
    if (!includeEmbedding && name >= EMBEDDING_MIGRATION) continue;
    const sql = await readFile(join(MIGRATION_ROOT, name, 'migration.sql'));
    rows.push({
      name,
      checksum: createHash('sha256').update(sql).digest('hex'),
    });
  }
  if (!directories.includes(EMBEDDING_MIGRATION))
    throw new Error('Prepared embedding migration is missing');
  return rows;
}

export async function deployRealMigrations(
  kind: 'runtime' | 'upgrade',
  includeEmbedding = true,
): Promise<void> {
  const scratch = await mkdtemp(join(tmpdir(), 'context-embedding-migrate-'));
  try {
    const migrationsPath = includeEmbedding
      ? MIGRATION_ROOT
      : join(scratch, 'predecessors');
    if (!includeEmbedding) {
      await cp(MIGRATION_ROOT, migrationsPath, { recursive: true });
      // The predecessor is the history before the embedding migration; later
      // migrations may depend on it (for example on its unique indexes), so
      // they are applied by the upgrade itself, as they are in production.
      const directories = await readdir(migrationsPath, {
        withFileTypes: true,
      });
      for (const entry of directories) {
        if (entry.isDirectory() && entry.name >= EMBEDDING_MIGRATION)
          await rm(join(migrationsPath, entry.name), { recursive: true });
      }
    }
    const config = join(scratch, 'prisma.config.mjs');
    const { configModule, cli } = await resolvePrismaMigrationTools();
    await writeFile(
      config,
      [
        'import { defineConfig } from ' + JSON.stringify(configModule) + ';',
        'export default defineConfig({ schema: ' +
          JSON.stringify(SCHEMA_PATH) +
          ', migrations: { path: ' +
          JSON.stringify(migrationsPath) +
          ' }, datasource: { url: process.env.CONTEXT_EMBEDDING_ACTIVE_MIGRATION_DATABASE_URL } });',
      ].join(String.fromCharCode(10)),
    );
    try {
      await command(
        process.execPath,
        [cli, 'migrate', 'deploy', '--config', config],
        {
          cwd: resolve(MIGRATION_ROOT, '../..'),
          env: {
            ...process.env,
            CONTEXT_EMBEDDING_ACTIVE_MIGRATION_DATABASE_URL:
              dedicatedDatabaseUrl(kind),
          },
          timeout: 600000,
          maxBuffer: 2 * 1024 * 1024,
        },
      );
    } catch (error) {
      throw new Error(
        'Real Prisma migration deploy failed for the disposable ' +
          kind +
          ' database',
        { cause: error },
      );
    }
  } finally {
    await rm(scratch, { recursive: true });
  }
}

export async function assertRealMigrationLedger(
  client: Client,
  includeEmbedding = true,
): Promise<Array<{ name: string; checksum: string }>> {
  const expected = await migrationInventory(includeEmbedding);
  const actual = await client.query<{
    migration_name: string;
    checksum: string;
    finished_at: Date | null;
    rolled_back_at: Date | null;
  }>(
    'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name',
  );
  if (
    actual.rows.length !== expected.length ||
    actual.rows.some(
      (row, i) =>
        row.migration_name !== expected[i].name ||
        row.checksum !== expected[i].checksum ||
        !row.finished_at ||
        row.rolled_back_at,
    )
  )
    throw new Error(
      'Actual migration ledger does not match the complete checked-in inventory and checksums',
    );
  return expected;
}

export async function verifyPgvector(client: Client): Promise<string> {
  const result = await client.query<{ extversion: string }>(
    "SELECT extversion FROM pg_extension WHERE extname = 'vector'",
  );
  if (!result.rows[0]?.extversion)
    throw new Error('Actual pgvector extension is required');
  return result.rows[0].extversion;
}

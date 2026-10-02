import { deepStrictEqual } from 'node:assert';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, open, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { WorkflowExecutionJobData } from '@api/collections/workflows/services/workflow-execution-queue.service';
import {
  assertControllerOwnedMigrationConnection,
  assertControllerOwnedMigrationIdentity,
  assertControllerOwnedMigrationInventory,
  type ControllerOwnedMigrationRole,
  type ControllerOwnedMigrationRow,
  readControllerOwnedMigrationDatabaseUrl,
} from '@api-test/helpers/controller-owned-migration-database';
import { formatMigrationDeployDiagnostic } from '@api-test/helpers/migration-deploy-diagnostics';
import Redis from 'ioredis';
import { z } from 'zod';

const command = promisify(execFile);
const RAW_LIMIT = 50 * 1024 * 1024;
const OWNER_KEY = 'learning-runtime:owner';

const systemJobIdentitySchema = z.object({
  systemRun: z
    .object({
      input: z.object({
        canonicalId: z.string().min(1),
        organizationId: z.string().min(1),
      }),
      priorExecution: z.object({ executionId: z.string().min(1) }).optional(),
    })
    .optional(),
});
function systemJobIdentity(data: unknown) {
  return systemJobIdentitySchema.parse(data).systemRun;
}

const receiptSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal('ci-owned-redis-instance'),
    candidateSHA: z.string().regex(/^[0-9a-f]{40}$/),
    runId: z.string().regex(/^\d+$/),
    runAttempt: z.string().regex(/^\d+$/),
    job: z.string().min(1),
    ownerNonce: z.string().uuid(),
    containerId: z.string().regex(/^[0-9a-f]{64}$/),
    imageId: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    redisRunId: z.string().regex(/^[0-9a-f]{40}$/),
    endpoint: z
      .object({
        hostname: z.string().min(1),
        port: z.number().int().min(1).max(65535),
      })
      .strict(),
    ownedDatabases: z.tuple([
      z.literal(0),
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
    ]),
    issuedAt: z.string().datetime(),
  })
  .strict();
type OwnershipReceipt = z.infer<typeof receiptSchema>;
const inspectSchema = z
  .array(
    z.object({
      Id: z.string(),
      Image: z.string(),
      Created: z.string(),
      State: z.object({ Running: z.boolean() }),
      Mounts: z.array(
        z.object({
          Type: z.string(),
          Name: z.string().optional(),
          Destination: z.string(),
        }),
      ),
      NetworkSettings: z.object({
        Ports: z.record(
          z.string(),
          z
            .array(z.object({ HostIp: z.string(), HostPort: z.string() }))
            .nullable(),
        ),
      }),
    }),
  )
  .length(1);
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing explicit ${name}`);
  return value;
}
function ensure(value: unknown, code: string): asserts value {
  if (!value) throw new Error(`Learning runtime resource gate: ${code}`);
}
function serverIdentity(info: string) {
  const runId = info
    .split('\r\n')
    .find((line) => line.startsWith('run_id:'))
    ?.slice(7);
  ensure(runId && /^[0-9a-f]{40}$/.test(runId), 'REDIS_RUN_ID');
  return runId;
}
function occupiedDatabases(info: string) {
  return info.split('\r\n').flatMap((line) => {
    const match = /^db(\d+):keys=(\d+),/.exec(line);
    return match && Number(match[2]) > 0 ? [Number(match[1])] : [];
  });
}

export function learningRuntimeRedisDatabaseUrl(base: URL, db: number): string {
  ensure(Number.isInteger(db) && db >= 0 && db <= 4, 'OWNED_REDIS_DATABASE');
  const url = new URL(base);
  url.pathname = `/${db}`;
  return url.toString();
}

export function assertLearningRuntimeMigrationScope(name: string, sql: string) {
  let scanned = sql;
  if (name === '20260417050332_init') {
    const prefix = '-- CreateSchema\nCREATE SCHEMA IF NOT EXISTS "public";\n\n';
    ensure(
      createHash('sha256').update(sql, 'utf8').digest('hex') ===
        'ec9a796c46bdf0df26204fa6e39d5d9352a4e55a190e2cc247abeec0777abf1c' &&
        sql.startsWith(prefix),
      'IMMUTABLE_INITIAL_MIGRATION',
    );
    scanned = sql.slice(prefix.length);
  }
  ensure(
    !/\bpublic\s*\.|"public"\s*\.|(?:SET\s+search_path|CREATE\s+SCHEMA)\s*.*\bpublic\b/i.test(
      scanned,
    ) &&
      !/(?:\b(?:CREATE|ALTER|DROP)\s+SCHEMA\b|\b(?:GRANT|REVOKE|COMMENT)\b[^;]*\b(?:ON\s+)?SCHEMA\b)[^;]*\bpublic\b/i.test(
        scanned,
      ),
    'EXPLICIT_PUBLIC_MIGRATION',
  );
}

export class LearningRuntimeResources {
  readonly sqlSchema = 'public';
  readonly fixtureId = randomUUID();
  readonly schema =
    `learning_runtime_test_${this.fixtureId.replaceAll('-', '')}`;
  readonly prefix = `learning-runtime-${this.fixtureId}`;
  readonly clients: Redis[] = [];
  readonly applicationClients: Array<{ $disconnect(): Promise<void> }> = [];
  readonly applicationClosers: Array<() => Promise<void>> = [];
  private pendingApplicationConstructions = 0;
  beginApplicationConstruction() {
    this.pendingApplicationConstructions++;
  }
  registerApplicationCloser(close: () => Promise<void>) {
    this.applicationClosers.push(close);
    this.pendingApplicationConstructions--;
  }
  assertApplicationConstructionClosed() {
    ensure(
      this.pendingApplicationConstructions === 0,
      'PARTIAL_APPLICATION_OWNERSHIP',
    );
  }
  readonly workDeadline = Date.now() + 540000;
  private stopping = false;
  beginCleanup() {
    this.stopping = true;
  }
  readonly databaseUrl: string;
  readonly redisUrl: URL;
  readonly receiptPath: string;
  private receipt!: OwnershipReceipt;
  private receiptHash = '';
  private receiptInode = 0;
  private receiptDevice = 0;
  private claimValue = '';
  private cancelled = false;
  private claimed = false;

  constructor(
    readonly role: Exclude<ControllerOwnedMigrationRole, 'brand-acceptance'>,
  ) {
    ensure(
      role === 'learning-runtime' || role === 'learning-races',
      'LEARNING_DATABASE_ROLE',
    );
    this.databaseUrl = readControllerOwnedMigrationDatabaseUrl(
      role,
      required(
        role === 'learning-runtime'
          ? 'LEARNING_RUNTIME_TEST_DATABASE_URL'
          : 'LEARNING_RUNTIME_RACES_TEST_DATABASE_URL',
      ),
    );
    this.redisUrl = new URL(required('LEARNING_RUNTIME_TEST_REDIS_URL'));
    this.receiptPath = resolve(
      required('LEARNING_RUNTIME_REDIS_OWNERSHIP_RECEIPT'),
    );
    ensure(
      this.redisUrl.protocol === 'redis:' &&
        !this.redisUrl.username &&
        !this.redisUrl.password &&
        !this.redisUrl.search,
      'CI_REDIS_TRANSPORT',
    );
    ensure(/^[a-z][a-z0-9_]{1,63}$/.test(this.schema), 'SCHEMA_IDENTIFIER');
  }

  private async readReceipt() {
    const file = await open(
      this.receiptPath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
    try {
      const metadata = await file.stat();
      ensure(
        metadata.isFile() &&
          metadata.size > 0 &&
          metadata.size <= 16384 &&
          metadata.uid === process.getuid?.() &&
          (metadata.mode & 0o777) === 0o600,
        'PRIVATE_REGULAR_RECEIPT',
      );
      const buffer = Buffer.alloc(16385);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await file.read(
          buffer,
          length,
          buffer.length - length,
          length,
        );
        if (bytesRead === 0) break;
        length += bytesRead;
      }
      const after = await file.stat(),
        pathname = await lstat(this.receiptPath);
      ensure(
        length === metadata.size &&
          after.size === metadata.size &&
          after.mtimeMs === metadata.mtimeMs &&
          after.ctimeMs === metadata.ctimeMs &&
          after.mode === metadata.mode &&
          pathname.isFile() &&
          !pathname.isSymbolicLink() &&
          pathname.ino === metadata.ino &&
          pathname.dev === metadata.dev &&
          pathname.size === metadata.size &&
          pathname.mode === metadata.mode &&
          pathname.uid === metadata.uid &&
          pathname.mtimeMs === metadata.mtimeMs &&
          pathname.ctimeMs === metadata.ctimeMs,
        'RECEIPT_CHANGED_DURING_READ',
      );
      const bytes = buffer.subarray(0, length);
      const hash = createHash('sha256').update(bytes).digest('hex');
      if (this.receiptHash)
        ensure(
          hash === this.receiptHash &&
            metadata.ino === this.receiptInode &&
            metadata.dev === this.receiptDevice,
          'RECEIPT_REPLACED',
        );
      this.receiptHash = hash;
      this.receiptInode = metadata.ino;
      this.receiptDevice = metadata.dev;
      return receiptSchema.parse(JSON.parse(bytes.toString('utf8')));
    } finally {
      await file.close();
    }
  }

  private async inspectContainer() {
    const { stdout } = await command(
      'docker',
      ['inspect', this.receipt.containerId],
      { timeout: 5000, maxBuffer: 1024 * 1024 },
    );
    const inspect = inspectSchema.parse(JSON.parse(stdout))[0];
    ensure(
      inspect.Id === this.receipt.containerId &&
        inspect.Image === this.receipt.imageId &&
        inspect.State.Running,
      'CONTAINER_IDENTITY',
    );
    ensure(
      inspect.Mounts.every(
        (mount) =>
          mount.Type === 'volume' &&
          mount.Destination === '/data' &&
          /^[0-9a-f]{64}$/.test(mount.Name ?? ''),
      ),
      'REUSED_OR_BOUND_DATA',
    );
    const ports = inspect.NetworkSettings.Ports['6379/tcp'] ?? [];
    ensure(
      ports.some(
        (port) =>
          Number(port.HostPort) === this.receipt.endpoint.port &&
          ['127.0.0.1', '0.0.0.0', '::'].includes(port.HostIp),
      ),
      'CONTAINER_ENDPOINT',
    );
    ensure(
      ['127.0.0.1', 'localhost', '::1'].includes(
        this.receipt.endpoint.hostname,
      ),
      'CI_LOOPBACK_ENDPOINT',
    );
    const created = new Date(inspect.Created).getTime(),
      issued = new Date(this.receipt.issuedAt).getTime();
    ensure(
      Number.isFinite(created) && created <= issued && issued <= Date.now(),
      'CONTAINER_CREATION',
    );
    const { stdout: inside } = await command(
      'docker',
      ['exec', this.receipt.containerId, 'redis-cli', 'INFO', 'server'],
      { timeout: 5000, maxBuffer: 16384 },
    );
    ensure(
      serverIdentity(inside) === this.receipt.redisRunId,
      'CONTAINER_REDIS_IDENTITY',
    );
  }

  async acquire() {
    this.receipt = await this.readReceipt();
    ensure(
      this.receipt.candidateSHA ===
        required('LEARNING_RUNTIME_ACCEPTANCE_HEAD') &&
        this.receipt.runId === required('RUNTIME_ACCEPTANCE_CI_RUN_ID') &&
        this.receipt.runAttempt ===
          required('RUNTIME_ACCEPTANCE_CI_RUN_ATTEMPT') &&
        this.receipt.job === required('RUNTIME_ACCEPTANCE_CI_JOB') &&
        this.receipt.containerId === required('RUNTIME_ACCEPTANCE_REDIS_ID'),
      'TRUSTED_CONTROLLER_IDENTITY',
    );
    const { stdout: head } = await command('git', ['rev-parse', 'HEAD'], {
      timeout: 5000,
      maxBuffer: 1024,
    });
    ensure(head.trim() === this.receipt.candidateSHA, 'ACTUAL_CANDIDATE_HEAD');
    ensure(
      this.redisUrl.hostname === this.receipt.endpoint.hostname &&
        Number(this.redisUrl.port || 6379) === this.receipt.endpoint.port,
      'EXPLICIT_ENDPOINT_MISMATCH',
    );
    await this.inspectContainer();
    for (const db of this.receipt.ownedDatabases) {
      const client = new Redis(
        learningRuntimeRedisDatabaseUrl(this.redisUrl, db),
        {
          lazyConnect: true,
          maxRetriesPerRequest: 0,
          retryStrategy: () => null,
        },
      );
      this.clients.push(client);
      await client.connect();
      ensure(
        serverIdentity(await client.info('server')) === this.receipt.redisRunId,
        'ENDPOINT_REDIS_IDENTITY',
      );
      const info = await client.call('CLIENT', 'INFO');
      ensure(typeof info === 'string', 'REDIS_CLIENT_INFO');
      const databases =
        typeof info === 'string'
          ? info
              .trim()
              .split(/\s+/)
              .filter((field) => /^db=\d+$/.test(field))
          : [];
      ensure(
        databases.length === 1 && Number(databases[0].slice(3)) === db,
        'REDIS_SELECTED_DATABASE',
      );
      ensure((await client.dbsize()) === 0, 'NONEMPTY_ASSIGNED_DATABASE');
    }
    ensure(
      occupiedDatabases(await this.clients[0].info('keyspace')).length === 0,
      'NONEMPTY_INSTANCE',
    );
    this.claimValue = `${this.receipt.ownerNonce}:${this.fixtureId}`;
    ensure(
      (await this.clients[0].set(OWNER_KEY, this.claimValue, 'NX')) === 'OK',
      'OWNER_CLAIM_BUSY',
    );
    this.claimed = true;
    await this.check();
  }

  async check() {
    ensure(!this.cancelled && this.claimed, 'CANCELLED_OR_UNCLAIMED');
    ensure(
      this.stopping || Date.now() < this.workDeadline,
      'AGGREGATE_WORK_DEADLINE',
    );
    try {
      await this.readReceipt();
      await this.inspectContainer();
      ensure(
        (await this.clients[0].get(OWNER_KEY)) === this.claimValue &&
          serverIdentity(await this.clients[0].info('server')) ===
            this.receipt.redisRunId,
        'OWNER_CLAIM_LOST',
      );
      ensure(
        occupiedDatabases(await this.clients[0].info('keyspace')).every((db) =>
          this.receipt.ownedDatabases.includes(db as 0 | 1 | 2 | 3 | 4),
        ),
        'UNASSIGNED_DATABASE_WRITER',
      );
    } catch (error) {
      this.cancelled = true;
      throw error;
    }
  }

  async cleanup() {
    const evidencePath = resolve(
      dirname(this.receiptPath),
      `learning-runtime-${this.fixtureId}-cleanup.json`,
    );
    const inventories: Array<{ db: number; keys: string[] }> = [];
    let success = false;
    let evidenceFile: Awaited<ReturnType<typeof open>> | undefined;
    const evidence = (
      complete: boolean,
      failureCode: string | null,
      captured = inventories,
    ) =>
      JSON.stringify({
        version: 1,
        fixtureId: this.fixtureId,
        candidateSHA: this.receipt?.candidateSHA ?? null,
        receiptHash: this.receiptHash,
        claimValue: this.claimValue,
        inventories: captured,
        success: complete,
        failureCode,
      });
    async function persist(encoded: string) {
      ensure(
        Buffer.byteLength(encoded) <= RAW_LIMIT,
        'ENCODED_INVENTORY_BOUND',
      );
      evidenceFile ??= await open(evidencePath, 'wx', 0o600);
      const descriptor = await evidenceFile.stat(),
        pathname = await lstat(evidencePath);
      ensure(
        descriptor.ino === pathname.ino &&
          descriptor.dev === pathname.dev &&
          pathname.isFile() &&
          !pathname.isSymbolicLink() &&
          (pathname.mode & 0o777) === 0o600,
        'PRIVATE_EVIDENCE_REPLACED',
      );
      const bytes = Buffer.from(encoded);
      await evidenceFile.write(bytes, 0, bytes.length, 0);
      await evidenceFile.truncate(bytes.length);
      await evidenceFile.sync();
    }
    try {
      await this.check();
      let count = 0,
        bytes = 0;
      for (const db of this.receipt.ownedDatabases) {
        const client = this.clients[db],
          keys = new Set<string>();
        let cursor = '0';
        do {
          const page = await client.scan(cursor, 'COUNT', 1000);
          cursor = page[0];
          for (const key of page[1]) {
            ensure(
              db !== 1 || key.startsWith(`${this.prefix}:`),
              'FOREIGN_QUEUE_PREFIX',
            );
            if (keys.has(key)) continue;
            count++;
            bytes += Buffer.byteLength(key);
            ensure(count <= 10000 && bytes <= RAW_LIMIT, 'INVENTORY_BOUND');
            keys.add(key);
          }
        } while (cursor !== '0');
        inventories.push({ db, keys: [...keys] });
      }
      await persist(evidence(false, null));
      await this.check();
      for (const inventory of inventories) {
        const keys = inventory.keys.filter(
          (key) => !(inventory.db === 0 && key === OWNER_KEY),
        );
        for (let offset = 0; offset < keys.length; offset += 1000)
          await this.clients[inventory.db].unlink(
            ...keys.slice(offset, offset + 1000),
          );
        for (const key of keys)
          ensure(
            (await this.clients[inventory.db].exists(key)) === 0,
            'EXACT_KEY_REMAINS',
          );
        if (inventory.db !== 0)
          ensure(
            (await this.clients[inventory.db].dbsize()) === 0,
            'DATABASE_REMAINS',
          );
      }
      await this.check();
      ensure(
        (await this.clients[0].eval(
          "if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",
          1,
          OWNER_KEY,
          this.claimValue,
        )) === 1,
        'CLAIM_COMPARE_DELETE',
      );
      ensure(
        (await this.clients[0].dbsize()) === 0,
        'DEFAULT_DATABASE_REMAINS',
      );
      await persist(evidence(true, null));
      success = true;
    } catch (error) {
      if (this.receiptHash)
        await persist(
          evidence(
            false,
            'RESOURCE_OR_CLEANUP_FAILURE',
            evidenceFile ? inventories : [],
          ),
        );
      throw error;
    } finally {
      try {
        await evidenceFile?.close();
      } finally {
        for (const client of this.clients) client.disconnect();
      }
      ensure(success, 'CLEANUP_FAILED_UNKNOWN_KEYS_PRESERVED');
    }
  }
}

type FixtureEnvironment = { restore(): void; assertConfig(): Promise<void> };
const runtimeEnvironmentKeys = [
  'PATH',
  'HOME',
  'USER',
  'TMPDIR',
  'TMP',
  'TEMP',
  'SYSTEMROOT',
  'WINDIR',
  'COMSPEC',
  'PATHEXT',
  'VITEST',
  'VITEST_POOL_ID',
  'VITEST_WORKER_ID',
  'FORCE_COLOR',
  'NO_COLOR',
] as const;
const unusedRequiredKeys = [
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'TIKTOK_CLIENT_KEY',
  'TIKTOK_CLIENT_SECRET',
  'INSTAGRAM_APP_ID',
  'INSTAGRAM_APP_SECRET',
  'FACEBOOK_APP_ID',
  'FACEBOOK_APP_SECRET',
  'TWITTER_BEARER_TOKEN',
  'TWITTER_CLIENT_ID',
  'TWITTER_CLIENT_SECRET',
  'TWITTER_CONSUMER_KEY',
  'TWITTER_CONSUMER_SECRET',
  'REPLICATE_KEY',
  'REPLICATE_WEBHOOK_SIGNING_SECRET',
  'KLINGAI_KEY',
  'KLINGAI_SECRET',
  'ELEVENLABS_API_KEY',
  'ELEVENLABS_MODEL',
  'LEONARDO_KEY',
  'HEYGEN_KEY',
  'ARGIL_WEBHOOK_SECRET',
  'NEWS_API_KEY',
] as const;
const optionalProviderKeys = [
  'OPENROUTER_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'FAL_API_KEY',
  'MUREKA_API_KEY',
  'HEDRA_KEY',
  'TYPESAFE_API_KEY',
  'CONTENT_EVAL_GENFEED_API_KEY',
  'REPLICATE_API_TOKEN',
  'ARGIL_KEY',
] as const;
const ownedUrlKeys = [
  'GENFEEDAI_API_PUBLIC_URL',
  'GENFEEDAI_API_URL',
  'GENFEEDAI_APP_URL',
  'GENFEEDAI_CDN_URL',
  'GENFEEDAI_MCP_PUBLIC_URL',
  'GENFEEDAI_WEBHOOKS_URL',
  'GENFEEDAI_MICROSERVICES_FILES_URL',
  'GENFEEDAI_MICROSERVICES_MCP_URL',
  'GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL',
  'YOUTUBE_REDIRECT_URI',
  'INSTAGRAM_GRAPH_URL',
  'INSTAGRAM_REDIRECT_URI',
  'FACEBOOK_GRAPH_URL',
  'FACEBOOK_REDIRECT_URI',
  'TWITTER_REDIRECT_URI',
  'NEWS_API_URL',
] as const;
export async function assertNoLearningRuntimeEnvFiles(cwd = process.cwd()) {
  const fromServer = cwd.endsWith('apps/server');
  const paths = [
    resolve(cwd, fromServer ? '../../.env.test' : '.env.test'),
    resolve(cwd, fromServer ? 'api/.env.test' : 'apps/server/api/.env.test'),
  ];
  for (const path of paths) {
    try {
      await lstat(path);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        continue;
      throw error;
    }
    throw new Error('Learning runtime refuses an existing configuration file');
  }
}
function replaceEnvironment(values: NodeJS.ProcessEnv) {
  for (const key of Object.keys(process.env)) delete process.env[key];
  for (const [key, value] of Object.entries(values))
    if (value !== undefined) process.env[key] = value;
}
export async function installLearningRuntimeEnvironment(
  resources: LearningRuntimeResources,
  peerOrigin: string,
): Promise<FixtureEnvironment> {
  await assertNoLearningRuntimeEnvFiles();
  const original = { ...process.env };
  const environment: NodeJS.ProcessEnv = { NODE_ENV: 'test' };
  for (const key of runtimeEnvironmentKeys)
    if (original[key] !== undefined) environment[key] = original[key];
  const database = new URL(resources.databaseUrl);
  database.searchParams.set('schema', resources.sqlSchema);
  Object.assign(environment, {
    CI: 'true',
    NODE_ENV: 'test',
    TZ: 'UTC',
    GENFEED_CLOUD: 'true',
    NEXT_PUBLIC_GENFEED_CLOUD: 'true',
    PORT: '3001',
    REDIS_DRIVER: 'redis',
    DATABASE_URL: database.toString(),
    REDIS_URL: new URL('/0', resources.redisUrl).toString(),
    REDIS_TLS: 'false',
    TOKEN_ENCRYPTION_KEY: 'test-encryption-key-for-testing-only',
    BETTER_AUTH_SECRET: 'learning-runtime-fixture-session-secret-only',
    BETTER_AUTH_ENABLED: 'true',
    GENFEEDAI_API_KEY: 'learning-runtime-fixture-internal-only',
    AWS_ACCESS_KEY_ID: 'learning-runtime-fixture-access',
    AWS_SECRET_ACCESS_KEY: 'learning-runtime-fixture-secret',
    AWS_REGION: 'us-east-1',
    AWS_S3_BUCKET: 'learning-runtime-fixture-unused',
    AWS_EC2_METADATA_DISABLED: 'true',
    AWS_SHARED_CREDENTIALS_FILE: resolve(
      dirname(resources.receiptPath),
      `${resources.fixtureId}-absent-aws-credentials`,
    ),
    AWS_CONFIG_FILE: resolve(
      dirname(resources.receiptPath),
      `${resources.fixtureId}-absent-aws-config`,
    ),
    STRIPE_SECRET_KEY: 'sk_test_learning_runtime_unused',
    STRIPE_PUBLISHABLE_KEY: 'pk_test_learning_runtime_unused',
    STRIPE_WEBHOOK_SIGNING_SECRET: 'whsec_learning_runtime_unused',
    STRIPE_PRICE_PAYG: 'price_learningruntimeunused',
    SENTRY_ENABLED: 'false',
    SENTRY_ENVIRONMENT: 'test',
    SENTRY_DSN: 'http://00000000000000000000000000000000@127.0.0.1:1/1',
    INSTAGRAM_API_VERSION: 'v22.0',
    FACEBOOK_API_VERSION: 'v22.0',
  });
  for (const key of unusedRequiredKeys)
    environment[key] = 'learning-runtime-fixture-unused';
  for (const key of ownedUrlKeys) environment[key] = peerOrigin;
  for (const [workload, db] of [
    ['QUEUE', 1],
    ['CACHE', 2],
    ['RATELIMIT', 3],
    ['SOCKET', 4],
  ] as const) {
    environment[`REDIS_${workload}_URL`] = new URL(
      `/${db}`,
      resources.redisUrl,
    ).toString();
    environment[`REDIS_${workload}_DB`] = String(db);
  }
  for (const key of [
    'LEARNING_RUNTIME_ACCEPTANCE_HEAD',
    'RUNTIME_ACCEPTANCE_CI_RUN_ID',
    'RUNTIME_ACCEPTANCE_CI_RUN_ATTEMPT',
    'RUNTIME_ACCEPTANCE_CI_JOB',
    'RUNTIME_ACCEPTANCE_REDIS_ID',
  ] as const)
    environment[key] = required(key);
  environment.LEARNING_RUNTIME_REDIS_OWNERSHIP_RECEIPT = resources.receiptPath;
  environment.LEARNING_RUNTIME_TEST_DATABASE_URL = required(
    'LEARNING_RUNTIME_TEST_DATABASE_URL',
  );
  environment.LEARNING_RUNTIME_RACES_TEST_DATABASE_URL = required(
    'LEARNING_RUNTIME_RACES_TEST_DATABASE_URL',
  );
  environment.LEARNING_RUNTIME_TEST_REDIS_URL = resources.redisUrl.toString();
  replaceEnvironment(environment);
  try {
    for (const key of ['AWS_SHARED_CREDENTIALS_FILE', 'AWS_CONFIG_FILE']) {
      try {
        await lstat(required(key));
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 'ENOENT'
        )
          continue;
        throw error;
      }
      throw new Error('Fixture AWS resource path already exists');
    }
  } catch (error) {
    replaceEnvironment(original);
    throw error;
  }
  return {
    restore: () => replaceEnvironment(original),
    async assertConfig() {
      const { ConfigService } = await import('@libs/config/config.service');
      const { CredentialCryptoService } = await import(
        '@api/collections/credentials/services/credential-crypto.service'
      );
      const { isCloudTenantGuardEnabled } = await import(
        '@libs/prisma/prisma.service'
      );
      const { parseRedisConnectionForWorkload, RedisWorkload } = await import(
        '@libs/redis/redis-connection.utils'
      );
      const config = new ConfigService();
      ensure(
        config.constructor === ConfigService &&
          config.isTest &&
          config.get('PORT') === 3001,
        'REAL_VALIDATED_CONFIG',
      );
      ensure(
        isCloudTenantGuardEnabled((key) => {
          const value: unknown = config.get(key);
          return typeof value === 'string' ? value : undefined;
        }),
        'REAL_CLOUD_TENANT_AUTHORITY',
      );
      ensure(
        config.apiUrl === peerOrigin &&
          config.cdnUrl === peerOrigin &&
          !config.mediaUrlConfig.signing,
        'REAL_CONFIG_URLS',
      );
      const crypto = new CredentialCryptoService(config),
        ciphertext = crypto.encrypt('learning-runtime-owned-token');
      ensure(
        ciphertext !== 'learning-runtime-owned-token' &&
          crypto.decrypt(ciphertext) === 'learning-runtime-owned-token',
        'REAL_CREDENTIAL_CRYPTO',
      );
      for (const key of optionalProviderKeys)
        ensure(process.env[key] === undefined, 'AMBIENT_PROVIDER_KEY');
      for (const [workload, db] of [
        [RedisWorkload.DEFAULT, 0],
        [RedisWorkload.QUEUE, 1],
        [RedisWorkload.CACHE, 2],
        [RedisWorkload.RATE_LIMIT, 3],
        [RedisWorkload.SOCKET, 4],
      ] as const) {
        const parsed = parseRedisConnectionForWorkload(config, workload);
        ensure(
          (parsed.db ?? 0) === db &&
            parsed.host === resources.redisUrl.hostname &&
            parsed.port === Number(resources.redisUrl.port || 6379) &&
            !parsed.password &&
            !parsed.tls,
          'REAL_REDIS_WORKLOAD_MAPPING',
        );
      }
      for (const key of ['DATABASE_URL', 'GOOGLE_OAUTH_CLIENT_SECRET']) {
        const value = process.env[key];
        delete process.env[key];
        let rejected = false;
        try {
          new ConfigService();
        } catch {
          rejected = true;
        } finally {
          process.env[key] = value;
        }
        ensure(rejected, 'REAL_REQUIRED_CLOUD_CONFIG_VALIDATION');
      }
      await assertNoLearningRuntimeEnvFiles();
    },
  };
}

type SocketEndpoint = { host: string; port: number };
export async function installLearningRuntimeTransports(
  resources: LearningRuntimeResources,
) {
  const { createServer } = await import('node:http');
  const { Socket } = await import('node:net');
  const { vi } = await import('vitest');
  const violations: string[] = [];
  const peer = createServer((request, response) => {
    if (
      request.method === 'GET' &&
      request.url === '/learning-runtime-health'
    ) {
      response.writeHead(200);
      response.end('owned');
      return;
    }
    violations.push('UNEXPECTED_OWNED_PEER_REQUEST');
    response.writeHead(503);
    response.end('unexpected transport');
  });
  await new Promise<void>((accept, reject) => {
    peer.once('error', reject);
    peer.listen(0, '127.0.0.1', accept);
  });
  const address = peer.address();
  ensure(address && typeof address !== 'string', 'OWNED_PEER_ENDPOINT');
  const database = new URL(resources.databaseUrl);
  const endpoints: SocketEndpoint[] = [
    { host: database.hostname, port: Number(database.port || 5432) },
    {
      host: resources.redisUrl.hostname,
      port: Number(resources.redisUrl.port || 6379),
    },
    { host: '127.0.0.1', port: address.port },
  ];
  const original = Socket.prototype.connect;
  const socketGuard = vi
    .spyOn(Socket.prototype, 'connect')
    .mockImplementation(function (
      this: InstanceType<typeof Socket>,
      ...args: Parameters<typeof original>
    ) {
      const values: unknown[] = Array.isArray(args[0]) ? args[0] : args;
      const first = values[0];
      let host: unknown, port: unknown;
      if (first && typeof first === 'object' && 'port' in first) {
        port = first.port;
        host = 'host' in first ? first.host : 'localhost';
      } else if (
        typeof first === 'number' ||
        (typeof first === 'string' && /^\d+$/.test(first))
      ) {
        port = first;
        host = typeof values[1] === 'string' ? values[1] : 'localhost';
      }
      if (
        typeof host !== 'string' ||
        !endpoints.some(
          (endpoint) =>
            endpoint.host === host && endpoint.port === Number(port),
        )
      ) {
        violations.push('UNOWNED_SOCKET_ENDPOINT');
        throw new Error('Learning runtime denied unowned socket');
      }
      return Reflect.apply(original, this, args);
    });
  const originalFetch = globalThis.fetch;
  const fetchGuard = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation((input, options) => {
      const url = new URL(
        typeof input === 'string' || input instanceof URL
          ? input.toString()
          : input.url,
      );
      if (
        url.origin !== `http://127.0.0.1:${address.port}` ||
        url.pathname !== '/learning-runtime-health' ||
        (options?.method ?? 'GET') !== 'GET'
      ) {
        violations.push('UNOWNED_FETCH');
        throw new Error('Learning runtime denied outbound fetch');
      }
      return originalFetch(input, options);
    });
  return {
    peerOrigin: `http://127.0.0.1:${address.port}`,
    assertNoViolations: () =>
      ensure(violations.length === 0, 'OUTBOUND_TRANSPORT_VIOLATION'),
    async close() {
      fetchGuard.mockRestore();
      socketGuard.mockRestore();
      await new Promise<void>((accept, reject) =>
        peer.close((error) => (error ? reject(error) : accept())),
      );
    },
  };
}

export async function createLearningRuntimeDatabase(
  resources: LearningRuntimeResources,
) {
  const { Client } = await import('pg');
  const { readdir } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const prismaDirectory = fileURLToPath(
    new URL('../../../../../../packages/prisma/', import.meta.url),
  );
  const migrationsDirectory = resolve(prismaDirectory, 'prisma/migrations');
  const names = (await readdir(migrationsDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  ensure(names.length > 0, 'NO_MIGRATIONS');
  const expectedMigrations = [];
  for (const name of names) {
    const sql = await readFile(
      resolve(migrationsDirectory, name, 'migration.sql'),
      'utf8',
    );
    assertLearningRuntimeMigrationScope(name, sql);
    expectedMigrations.push({
      migration_name: name,
      checksum: createHash('sha256').update(sql, 'utf8').digest('hex'),
    });
  }
  const control = new Client({
    connectionString: resources.databaseUrl,
    application_name: `${resources.schema}_control`,
  });
  const observer = new Client({
    connectionString: resources.databaseUrl,
    application_name: `${resources.schema}_observer`,
    options: `-c search_path=${resources.sqlSchema}`,
  });
  const close = async () => {
    const results = await Promise.allSettled([observer.end(), control.end()]);
    const errors = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : [],
    );
    if (errors.length > 0)
      throw new AggregateError(errors, 'Learning database disconnect failed');
  };
  try {
    await control.connect();
    await assertControllerOwnedMigrationConnection(
      control,
      resources.role,
      true,
    );
    const scoped = new URL(resources.databaseUrl);
    scoped.searchParams.set('schema', resources.sqlSchema);
    try {
      await command('bun', ['x', 'prisma', 'migrate', 'deploy'], {
        cwd: prismaDirectory,
        env: { ...process.env, DATABASE_URL: scoped.toString() },
        timeout: 120000,
        maxBuffer: 8 * 1024 * 1024,
      });
    } catch (error) {
      process.stderr.write(
        `${formatMigrationDeployDiagnostic(error, scoped.toString())}\n`,
      );
      throw new Error('Learning runtime full migration deployment failed');
    }
    await observer.connect();
    for (const client of [control, observer])
      await assertControllerOwnedMigrationConnection(client, resources.role);
    const applied = await control.query<ControllerOwnedMigrationRow>(
      'SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name',
    );
    deepStrictEqual(
      applied.rows.map((row) => row.migration_name),
      names,
    );
    assertControllerOwnedMigrationInventory(applied.rows, expectedMigrations);
    return { control, observer, close };
  } catch (error) {
    try {
      await close();
    } catch (closeError) {
      throw new AggregateError(
        [error, closeError],
        'Learning database setup and disconnect failed',
      );
    }
    throw error;
  }
}

async function createLearningRuntimePrisma(
  config: import('@libs/config/config.service').ConfigService,
  resources: LearningRuntimeResources,
  index: number,
) {
  const { PrismaClient, PRISMA_MODEL_METADATA } = await import(
    '@genfeedai/prisma'
  );
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const { createPrismaPgConfig } = await import(
    '@libs/prisma/prisma-pg-config'
  );
  const { tenantModelsFromMetadata, billingAccountModelNamesFromMetadata } =
    await import('@libs/prisma/discover-tenant-models');
  const { createTenantGuardExtension } = await import(
    '@libs/prisma/tenant-guard.extension'
  );
  const { isCloudTenantGuardEnabled } = await import(
    '@libs/prisma/prisma.service'
  );
  const { createMediaUrlExtension } = await import(
    '@libs/prisma/media-url.extension'
  );
  const { assertMediaUrlSigningConfig } = await import(
    '@libs/media/media-url.util'
  );
  const tenantModelNames = new Set(
    tenantModelsFromMetadata(PRISMA_MODEL_METADATA).map(({ model }) => model),
  );
  const billingFields = billingAccountModelNamesFromMetadata(
    PRISMA_MODEL_METADATA,
  );
  const billingAccountModelNames = new Set(
    [...tenantModelNames].filter((model) => billingFields.has(model)),
  );
  const isCloud = isCloudTenantGuardEnabled((key) => {
    const value: unknown = config.get(key);
    return typeof value === 'string' ? value : undefined;
  });
  ensure(isCloud, 'PRISMA_CLOUD_EXTENSION_REQUIRED');
  assertMediaUrlSigningConfig(config.mediaUrlConfig);
  const client = new PrismaClient({
    adapter: new PrismaPg(
      {
        ...createPrismaPgConfig(resources.databaseUrl),
        application_name: `${resources.schema}_application_${index}`,
        options: `-c search_path=${resources.sqlSchema}`,
        max: 2,
      },
      { schema: resources.sqlSchema },
    ),
  });
  const extended = client
    .$extends(
      createTenantGuardExtension({
        tenantModelNames,
        billingAccountModelNames,
        isCloud,
      }),
    )
    .$extends(createMediaUrlExtension(config.mediaUrlConfig));
  Object.defineProperty(extended, 'onModuleInit', {
    configurable: true,
    value: () => client.$connect(),
  });
  Object.defineProperty(extended, 'onModuleDestroy', {
    configurable: true,
    value: () => client.$disconnect(),
  });
  resources.applicationClients.push(extended);
  await client.$connect();
  const current = await extended.$queryRaw<
    Array<{ database: string; schema: string }>
  >`SELECT current_database() AS database, current_schema() AS schema`;
  assertControllerOwnedMigrationIdentity(current[0], resources.role);
  return extended;
}
export async function createLearningRuntimeApplication(
  resources: LearningRuntimeResources,
  index: number,
) {
  const { Test } = await import('@nestjs/testing');
  const { ModulesContainer } = await import('@nestjs/core');
  const { EventEmitterModule } = await import('@nestjs/event-emitter');
  const { getSharedConfigToken } = await import('@nestjs/bullmq');
  const { ConfigModule } = await import('@libs/config/config.module');
  const { ConfigService } = await import('@libs/config/config.service');
  const { LoggerModule } = await import('@libs/logger/logger.module');
  const { LoggerService } = await import('@libs/logger/logger.service');
  const { RedisModule } = await import('@libs/redis/redis.module');
  const { PrismaModule } = await import(
    '@api/shared/modules/prisma/prisma.module'
  );
  const { PrismaService } = await import(
    '@api/shared/modules/prisma/prisma.service'
  );
  const { PrismaService: LibsPrismaService } = await import(
    '@libs/prisma/prisma.service'
  );
  const { WorkflowsModule } = await import(
    '@api/collections/workflows/workflows.module'
  );
  const { BackgroundSystemWorkflowProcessor } = await import(
    '@workers/processors/api/collections/workflows/services/background-system-workflow.processor'
  );
  const { SchedulerPublishStateService } = await import(
    '@workers/services/scheduler-publish-state.service'
  );
  const { PostLifecycleModule } = await import(
    '@api/collections/posts/post-lifecycle.module'
  );
  const { PostLifecycleService } = await import(
    '@api/post-lifecycle/post-lifecycle.service'
  );
  const { Queue } = await import('bullmq');
  const connection = {
    host: resources.redisUrl.hostname,
    port: Number(resources.redisUrl.port || 6379),
    db: 1,
    maxRetriesPerRequest: null,
  };
  await assertNoLearningRuntimeEnvFiles();
  await resources.check();
  const builder = Test.createTestingModule({
    imports: [
      ConfigModule,
      LoggerModule,
      PrismaModule,
      RedisModule.forRoot({
        configModule: ConfigModule,
        configService: ConfigService,
      }),
      EventEmitterModule.forRoot({
        delimiter: '.',
        ignoreErrors: false,
        maxListeners: 20,
        verboseMemoryLeak: true,
        wildcard: true,
      }),
      WorkflowsModule,
      PostLifecycleModule,
    ],
    providers: [
      BackgroundSystemWorkflowProcessor,
      {
        provide: SchedulerPublishStateService,
        inject: [PrismaService, LoggerService, PostLifecycleService],
        useFactory: (
          prisma: import('@api/shared/modules/prisma/prisma.service').PrismaService,
          logger: import('@libs/logger/logger.service').LoggerService,
          lifecycle: import('@api/post-lifecycle/post-lifecycle.service').PostLifecycleService,
        ) => new SchedulerPublishStateService(prisma, logger, lifecycle),
      },
    ],
  })
    .overrideProvider(PrismaService)
    .useFactory({
      inject: [ConfigService],
      factory: (config: import('@libs/config/config.service').ConfigService) =>
        createLearningRuntimePrisma(config, resources, index),
    })
    .overrideProvider(getSharedConfigToken())
    .useValue({ connection, prefix: resources.prefix })
    // Installed @nestjs/bullmq 12 bull.constants.js; registrar remains real.
    .overrideProvider('BULLMQ_EXTRA_OPTIONS')
    .useValue({ manualRegistration: true });
  resources.beginApplicationConstruction();
  const module = await builder.compile();
  const queues = new Set<InstanceType<typeof Queue>>();
  async function closeApplication() {
    const errors: unknown[] = [];
    for (const close of [
      ...[...queues].map((queue) => () => queue.close()),
      () => module.close(),
    ]) {
      try {
        await close();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length)
      throw new AggregateError(errors, 'Learning application shutdown failed');
  }
  resources.registerApplicationCloser(closeApplication);
  const prisma = module.get(PrismaService),
    config = module.get(ConfigService);
  ensure(
    config instanceof ConfigService && config.constructor === ConfigService,
    'REAL_CONFIG_DI_IDENTITY',
  );
  ensure(module.get(LibsPrismaService) === prisma, 'REAL_PRISMA_DI_ALIAS');
  deepStrictEqual(module.get('BULLMQ_EXTRA_OPTIONS'), {
    manualRegistration: true,
  });
  for (const container of module.get(ModulesContainer).values())
    for (const provider of container.providers.values())
      if (provider.instance instanceof Queue) queues.add(provider.instance);
  ensure(queues.size > 0, 'NO_ACTUAL_QUEUES');
  for (const queue of queues) {
    const options = queue.opts.connection;
    ensure(
      options &&
        typeof options === 'object' &&
        'host' in options &&
        options.host === connection.host &&
        'port' in options &&
        options.port === connection.port &&
        'db' in options &&
        options.db === 1 &&
        queue.opts.prefix === resources.prefix,
      'UNOWNED_QUEUE_INSTANCE',
    );
    await queue.waitUntilReady();
  }
  return {
    module,
    prisma,
    config,
    queues,
    connection,
    scheduler: module.get(SchedulerPublishStateService),
    processor: module.get(BackgroundSystemWorkflowProcessor),
    close: closeApplication,
  };
}

export type RuntimeApplication = Awaited<
  ReturnType<typeof createLearningRuntimeApplication>
>;
export async function learningRuntimeServices(application: RuntimeApplication) {
  const { SystemWorkflowRunnerService } = await import(
    '@api/collections/workflows/system-workflow-runner.service'
  );
  const { WorkflowEngineAdapterService } = await import(
    '@api/collections/workflows/services/workflow-engine-adapter.service'
  );
  const { WorkflowExecutionQueueService } = await import(
    '@api/collections/workflows/services/workflow-execution-queue.service'
  );
  const { ContentLearningWorkflowService } = await import(
    '@api/collections/workflows/services/content-learning-workflow.service'
  );
  const { LearningCheckpointService } = await import(
    '@api/collections/content-learning/services/learning-checkpoint.service'
  );
  const { LearningBaselineMaterializationService } = await import(
    '@api/collections/content-learning/services/learning-baseline-materialization.service'
  );
  const { LearningAccountService } = await import(
    '@api/collections/content-learning/services/learning-account.service'
  );
  const { LearningScopeStateService } = await import(
    '@api/collections/content-learning/services/learning-scope-state.service'
  );
  const { AnalyticsTwitterCollectionService } = await import(
    '@api/analytics/services/analytics-twitter-collection.service'
  );
  const { PostAnalyticsCollectionStateService } = await import(
    '@api/analytics/services/post-analytics-collection-state.service'
  );
  const { PublishApprovalsService } = await import(
    '@api/publish-approvals/publish-approvals.service'
  );
  const { PostsService } = await import(
    '@api/collections/posts/services/posts.service'
  );
  const { CredentialsService } = await import(
    '@api/collections/credentials/services/credentials.service'
  );
  const { CredentialCryptoService } = await import(
    '@api/collections/credentials/services/credential-crypto.service'
  );
  const { BrandsService } = await import(
    '@api/collections/brands/services/brands.service'
  );
  const { BrandLifecycleService } = await import(
    '@api/collections/brands/services/brand-lifecycle.service'
  );
  const { OrganizationsService } = await import(
    '@api/collections/organizations/services/organizations.service'
  );
  return {
    runner: application.module.get(SystemWorkflowRunnerService),
    engine: application.module.get(WorkflowEngineAdapterService),
    queue: application.module.get(WorkflowExecutionQueueService),
    learning: application.module.get(ContentLearningWorkflowService),
    capture: application.module.get(LearningCheckpointService),
    materializer: application.module.get(
      LearningBaselineMaterializationService,
    ),
    accounts: application.module.get(LearningAccountService),
    scopes: application.module.get(LearningScopeStateService),
    analytics: application.module.get(AnalyticsTwitterCollectionService),
    analyticsState: application.module.get(PostAnalyticsCollectionStateService),
    approvals: application.module.get(PublishApprovalsService),
    posts: application.module.get(PostsService),
    credentials: application.module.get(CredentialsService),
    crypto: application.module.get(CredentialCryptoService),
    brands: application.module.get(BrandsService),
    brandLifecycle: application.module.get(BrandLifecycleService),
    organizations: application.module.get(OrganizationsService),
  };
}
export type RuntimeServices = Awaited<
  ReturnType<typeof learningRuntimeServices>
>;
export async function seedLearningRuntimeScenario(
  application: RuntimeApplication,
  services: RuntimeServices,
) {
  const { CredentialPlatform } = await import('@genfeedai/prisma');
  const actorId = randomUUID();
  const role = await application.prisma.role.upsert({
    where: { key: 'owner' },
    create: { key: 'owner', label: 'Owner' },
    update: {},
  });
  await application.prisma.user.create({
    data: { id: actorId, handle: `learning-${actorId}` },
  });
  const targets = [];
  for (let index = 0; index < 2; index++) {
    const organizationId = randomUUID(),
      brandId = randomUUID(),
      spareBrandId = randomUUID(),
      credentialId = randomUUID();
    await application.prisma.organization.create({
      data: {
        id: organizationId,
        userId: actorId,
        label: 'Owned learning acceptance',
        slug: `learning-${organizationId}`,
      },
    });
    for (const id of [brandId, spareBrandId])
      await application.prisma.brand.create({
        data: {
          id,
          organizationId,
          userId: actorId,
          label: 'Owned learning brand',
          slug: `learning-${id}`,
          isActive: true,
        },
      });
    await application.prisma.member.create({
      data: {
        organizationId,
        userId: actorId,
        roleId: role.id,
        roleKey: 'owner',
        currentBrandId: brandId,
        brands: { connect: [{ id: brandId }, { id: spareBrandId }] },
        isActive: true,
      },
    });
    await application.prisma.credential.create({
      data: {
        id: credentialId,
        organizationId,
        brandId,
        userId: actorId,
        platform: CredentialPlatform.TWITTER,
        externalId: `owned-account-${credentialId}`,
        isConnected: true,
        accessToken: services.crypto.encrypt('learning-runtime-owned-token'),
        accessTokenSecret: services.crypto.encrypt(
          'learning-runtime-owned-secret',
        ),
      },
    });
    const account = await services.accounts.ensure(
      organizationId,
      credentialId,
    );
    targets.push({
      actorId,
      organizationId,
      brandId,
      spareBrandId,
      credentialId,
      accountId: account.id,
    });
  }
  return targets;
}
export type RuntimeTarget = Awaited<
  ReturnType<typeof seedLearningRuntimeScenario>
>[number];
export async function publishLearningRuntimePost(
  application: RuntimeApplication,
  services: RuntimeServices,
  target: RuntimeTarget,
  legacy = false,
) {
  const {
    Platform,
    PostCategory,
    PostFormat,
    PostVisibility,
    TargetExecutionState,
  } = await import('@genfeedai/contracts');
  const { resolveLearningPublicationSourceV1 } = await import(
    '@api/collections/content-learning/services/learning-publication-source.helper'
  );
  const id = randomUUID(),
    externalId = `owned-publication-${id}`,
    publishedAt = new Date(Date.now() - (48 * 60 + 10) * 60000);
  await application.prisma.post.create({
    data: {
      id,
      description: `Owned canonical text ${id}`,
      userId: target.actorId,
      organizationId: target.organizationId,
      brandId: target.brandId,
      credentialId: target.credentialId,
      platform: Platform.TWITTER,
      category: PostCategory.TEXT,
      format: PostFormat.STANDARD,
      timezone: 'UTC',
      targetAttachments: [],
      targetSettings: {},
      visibility: PostVisibility.PUBLIC,
      ...(legacy
        ? {
            targetExecutionState: TargetExecutionState.PUBLISHED,
            externalId,
            publishedAt,
          }
        : {}),
    },
  });
  if (!legacy) {
    const approval = await services.approvals.createForCurrentPost({
      actorUserId: target.actorId,
      organizationId: target.organizationId,
      postId: id,
      mode: 'immediate',
    });
    await services.approvals.markQueued(
      approval.id,
      target.organizationId,
      target.actorId,
    );
    const claim = await services.approvals.claimForExecution({
      approvalId: approval.id,
      operationId: approval.operationId,
      organizationId: target.organizationId,
      postId: id,
      versionPinId: approval.artifactVersionPinId,
    });
    ensure(
      !claim.isAlreadyPublished && claim.executionStartedAt,
      'ACTUAL_APPROVAL_LEASE',
    );
    ensure(
      await application.scheduler.transitionPost(
        { id, organizationId: target.organizationId },
        { executionState: TargetExecutionState.PUBLISHING },
        'Owned transport started',
      ),
      'ACTUAL_PUBLISHING_TRANSITION',
    );
    ensure(
      await application.scheduler.transitionPost(
        { id, organizationId: target.organizationId },
        {
          executionState: TargetExecutionState.PUBLISHED,
          visibility: PostVisibility.PUBLIC,
          externalId,
          publishedAt,
        },
        'Owned transport completed',
        undefined,
        {
          source: 'learning-runtime-owned-transport',
          result: {
            success: true,
            isProviderDraft: false,
            executionState: TargetExecutionState.PUBLISHED,
            platform: Platform.TWITTER,
            externalId,
          },
        },
      ),
      'ACTUAL_PUBLICATION_TRANSITION',
    );
    await services.approvals.completeExecution({
      approvalId: approval.id,
      operationId: approval.operationId,
      organizationId: target.organizationId,
      versionPinId: approval.artifactVersionPinId,
      executionStartedAt: claim.executionStartedAt,
      isSuccessful: true,
    });
  }
  const source = await resolveLearningPublicationSourceV1(
    application.prisma,
    target.organizationId,
    id,
  );
  ensure(
    legacy ? source === null : source !== null,
    'CANONICAL_PUBLICATION_ASSOCIATION',
  );
  return { id, externalId, publishedAt, target, source };
}
export type RuntimePublication = Awaited<
  ReturnType<typeof publishLearningRuntimePost>
>;
export async function learningRuntimeMetrics() {
  const { captureLearningMetrics } = await import(
    '@genfeedai/contracts/interfaces/analytics/content-learning.interface'
  );
  const metrics = captureLearningMetrics(
    {
      views: 1000,
      impressions: 1000,
      reach: 1000,
      likes: 10,
      comments: 2,
      shares: 3,
      clicks: 0,
      isPaid: false,
      isPinned: false,
    },
    {
      views: 'views',
      impressions: 'impressions',
      reach: 'reach',
      likes: 'likes',
      comments: 'comments',
      shares: 'shares',
      clicks: 'clicks',
      saves: 'saves',
    },
  );
  for (const metric of Object.values(metrics.metrics))
    metric.source = 'provider';
  return metrics;
}
export async function captureLearningRuntimePublication(
  services: RuntimeServices,
  publication: RuntimePublication,
) {
  ensure(publication.source, 'RACE_REQUIRES_REAL_PREREAD_SOURCE');
  return services.capture.capture({
    publicationSource: publication.source,
    organizationId: publication.target.organizationId,
    credentialId: publication.target.credentialId,
    postId: publication.id,
    publishedAt: publication.publishedAt,
    requestStartedAt: new Date(),
    receivedAt: new Date(),
    sourceAttemptId: randomUUID(),
    format: 'text',
    objective: 'engagement',
    learningMetrics: await learningRuntimeMetrics(),
  });
}
export async function collectLearningRuntimePublications(
  services: RuntimeServices,
  target: RuntimeTarget,
  publications: RuntimePublication[],
) {
  ensure(
    publications.length > 0 &&
      publications.length <= 24 &&
      publications.every(
        (post) => post.target.credentialId === target.credentialId,
      ),
    'BOUNDED_ACTUAL_ANALYTICS_BATCH',
  );
  const { CredentialPlatform } = await import('@genfeedai/contracts');
  const attemptKey = randomUUID();
  await services.analyticsState.markPending({
    attemptKey,
    requestedAt: new Date(),
    targets: publications.map((post) => ({
      id: post.id,
      organizationId: target.organizationId,
      brandId: target.brandId,
      platform: CredentialPlatform.TWITTER,
    })),
  });
  return services.analytics.collect({
    credentialId: target.credentialId,
    posts: publications.map((post) => ({
      id: post.id,
      externalId: post.externalId,
      brandId: target.brandId,
      organizationId: target.organizationId,
    })),
    attemptKey,
  });
}
export async function learningRuntimeScope(
  application: RuntimeApplication,
  services: RuntimeServices,
  target: RuntimeTarget,
) {
  const { learningRegisteredProfiles, learningDescriptorTuple } = await import(
    '@genfeedai/harness'
  );
  const { learningHash } = await import(
    '@api/collections/content-learning/services/learning-operation.service'
  );
  const descriptor = learningRegisteredProfiles(
    'twitter',
    'text',
    'engagement',
  ).find((profile) => profile.capability.mask === 'LCS')?.descriptor;
  ensure(descriptor, 'REAL_REGISTERED_PROFILE');
  const scope: import('@genfeedai/contracts/interfaces/analytics/content-learning.interface').LearningScope =
    {
      organizationId: target.organizationId,
      brandId: target.brandId,
      credentialId: target.credentialId,
      platform: 'twitter',
      format: 'text',
      objective: 'engagement',
      rewardProfileId: learningHash(learningDescriptorTuple(descriptor)),
    };
  const account = await services.accounts.ensure(
    target.organizationId,
    target.credentialId,
  );
  await services.scopes.ensure(
    application.prisma,
    scope,
    descriptor,
    account.epoch,
  );
  return { scope, descriptor };
}
export async function openLearningRuntimeFixture(
  role: Exclude<ControllerOwnedMigrationRole, 'brand-acceptance'>,
) {
  const resources = new LearningRuntimeResources(role);
  const transports = await installLearningRuntimeTransports(resources);
  let environment: FixtureEnvironment | undefined;
  let database:
    | Awaited<ReturnType<typeof createLearningRuntimeDatabase>>
    | undefined;
  const applications: RuntimeApplication[] = [];
  const { vi } = await import('vitest');
  let restoreAnalytics: (() => void) | undefined;
  let worker:
    | import('bullmq').Worker<
        import('@api/collections/workflows/services/workflow-execution-queue.service').WorkflowExecutionJobData
      >
    | undefined;
  let events: import('bullmq').QueueEvents | undefined;
  const failedJobs: Array<{
    id: string | null;
    executionId: string | null;
    canonicalId: string;
  }> = [];
  const expectedFailureExecutions = new Map<
    string,
    { organizationId: string; canonicalId: string }
  >();
  const workerErrors: string[] = [],
    handledJobs: Array<{
      id: string;
      executionId: string | null;
      canonicalId: string;
    }> = [];
  async function close() {
    resources.beginCleanup();
    const errors: unknown[] = [];
    for (const closeResource of [
      async () => {
        if (worker) await worker.close();
      },
      async () => {
        if (events) await events.close();
      },
      ...[...resources.applicationClosers].reverse(),
      ...resources.applicationClients.map(
        (client) => () => client.$disconnect(),
      ),
    ]) {
      try {
        await closeResource();
      } catch (error) {
        errors.push(error);
      }
    }
    try {
      resources.assertApplicationConstructionClosed();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length) {
      for (const client of resources.clients) client.disconnect();
      throw new AggregateError(
        errors,
        'Learning writer shutdown unproven; owned data and transport gates retained',
      );
    }
    // Destructive cleanup is reachable only after every known writer closed,
    // and no failed compilation can have left untracked production providers.
    if (database) await database.close();
    await resources.cleanup();
    transports.assertNoViolations();
    restoreAnalytics?.();
    environment?.restore();
    await transports.close();
  }
  try {
    await resources.acquire();
    environment = await installLearningRuntimeEnvironment(
      resources,
      transports.peerOrigin,
    );
    vi.resetModules();
    await environment.assertConfig();
    const { TwitterService } = await import(
      '@api/services/integrations/twitter/services/twitter.service'
    );
    const analytics = vi
      .spyOn(TwitterService.prototype, 'getMediaAnalyticsBatch')
      .mockImplementation(async (ids) => {
        ensure(
          ids.length <= 24 &&
            ids.every((id) => id.startsWith('owned-publication-')),
          'EXTERNAL_ANALYTICS_OWNERSHIP',
        );
        const metrics = await learningRuntimeMetrics();
        return new Map(
          ids.map((id) => [
            id,
            {
              views: 1000,
              impressions: 1000,
              likes: 10,
              comments: 2,
              retweets: 3,
              bookmarks: 0,
              learningMetrics: metrics,
              mediaType: 'text' as const,
            },
          ]),
        );
      });
    restoreAnalytics = () => analytics.mockRestore();
    database = await createLearningRuntimeDatabase(resources);
    applications.push(await createLearningRuntimeApplication(resources, 0));
    const first = applications[0],
      services = await learningRuntimeServices(first);
    const { SYSTEM_WORKFLOW_PRINCIPAL_ID } = await import(
      '@api/collections/workflows/system-workflow.contract'
    );
    await first.prisma.user.create({
      data: {
        id: SYSTEM_WORKFLOW_PRINCIPAL_ID,
        handle: `system-${resources.fixtureId}`,
      },
    });
    await first.prisma.organization.create({
      data: {
        id: SYSTEM_WORKFLOW_PRINCIPAL_ID,
        userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
        label: 'Owned system principal',
        slug: `system-${resources.fixtureId}`,
      },
    });
    const targets = await seedLearningRuntimeScenario(first, services);
    for (const application of applications) await application.module.init();
    applications.push(await createLearningRuntimeApplication(resources, 1));
    await applications[1].module.init();
    const secondServices = await learningRuntimeServices(applications[1]);
    const { QueueEvents, Worker } = await import('bullmq');
    const {
      WORKFLOW_BACKGROUND_QUEUE,
      WORKFLOW_EXECUTION_QUEUE,
      PLATFORM_SYSTEM_WORKFLOW_QUEUE,
      AGENT_TURN_QUEUE,
    } = await import('@genfeedai/contracts/queue');
    const { withLongJobWorkerOptions } = await import(
      '@libs/jobs/bullmq-worker-lock.options'
    );
    for (const name of [
      WORKFLOW_BACKGROUND_QUEUE,
      WORKFLOW_EXECUTION_QUEUE,
      PLATFORM_SYSTEM_WORKFLOW_QUEUE,
      AGENT_TURN_QUEUE,
    ])
      ensure(
        [...first.queues].some((queue) => queue.name === name),
        'MISSING_PRODUCTION_ROUTE_QUEUE',
      );
    for (const application of applications)
      ensure(!('_worker' in application.processor), 'FRAMEWORK_WORKER_STARTED');
    const selectedBackground = [...first.queues].find(
      (queue) => queue.name === WORKFLOW_BACKGROUND_QUEUE,
    );
    ensure(selectedBackground, 'BACKGROUND_QUEUE');
    const background = selectedBackground;
    events = new QueueEvents(WORKFLOW_BACKGROUND_QUEUE, {
      connection: first.connection,
      prefix: resources.prefix,
    });
    await events.waitUntilReady();
    worker = new Worker<WorkflowExecutionJobData>(
      WORKFLOW_BACKGROUND_QUEUE,
      async (job) => {
        await resources.check();
        const result = await first.processor.process(job);
        handledJobs.push({
          id: String(job.id),
          executionId:
            systemJobIdentity(job.data)?.priorExecution?.executionId ?? null,
          canonicalId: systemJobIdentity(job.data)?.input.canonicalId ?? '',
        });
        return result;
      },
      {
        connection: first.connection,
        prefix: resources.prefix,
        ...withLongJobWorkerOptions({ concurrency: 1 }),
      },
    );
    worker.on('error', () => {
      workerErrors.push('BACKGROUND_WORKER_ERROR');
    });
    worker.on('failed', (job) => {
      failedJobs.push({
        id: job?.id ? String(job.id) : null,
        executionId:
          (job
            ? systemJobIdentity(job.data)?.priorExecution?.executionId
            : null) ?? null,
        canonicalId:
          (job ? systemJobIdentity(job.data)?.input.canonicalId : '') ?? '',
      });
    });
    await worker.waitUntilReady();
    async function assertExpectedJobFailures() {
      const failures = await background.getJobs(['failed'], 0, 999);
      ensure(
        (await background.getJobCounts('failed')).failed === failures.length,
        'FAILED_JOB_INVENTORY_BOUND',
      );
      for (const job of failures) {
        const executionId = systemJobIdentity(job.data)?.priorExecution
          ?.executionId;
        const expected = executionId
          ? expectedFailureExecutions.get(executionId)
          : undefined;
        ensure(
          expected &&
            executionId &&
            systemJobIdentity(job.data)?.input.organizationId ===
              expected.organizationId &&
            systemJobIdentity(job.data)?.input.canonicalId ===
              expected.canonicalId,
          'UNEXPECTED_FAILED_BACKGROUND_JOB',
        );
        const row = await first.prisma.workflowExecution.findFirst({
          where: {
            id: executionId,
            organizationId: expected.organizationId,
            isDeleted: false,
          },
        });
        ensure(
          row?.status === 'FAILED',
          'FAILED_JOB_WITHOUT_EXPECTED_EXECUTION',
        );
      }
      for (const executionId of expectedFailureExecutions.keys())
        ensure(
          failures.filter(
            (job) =>
              systemJobIdentity(job.data)?.priorExecution?.executionId ===
              executionId,
          ).length === 1,
          'EXPECTED_FAILED_JOB_MISSING_OR_DUPLICATED',
        );
      for (const failure of failedJobs)
        ensure(
          failure.id &&
            failure.executionId &&
            expectedFailureExecutions.get(failure.executionId)?.canonicalId ===
              failure.canonicalId &&
            failures.some((job) => String(job.id) === failure.id),
          'UNEXPECTED_FAILED_JOB_EVENT',
        );
    }
    async function drain() {
      const deadline = Date.now() + 45000;
      while (Date.now() < deadline) {
        await resources.check();
        const counts = await background.getJobCounts(
          'active',
          'waiting',
          'prioritized',
          'delayed',
        );
        if (Object.values(counts).every((count) => count === 0)) {
          ensure(workerErrors.length === 0, 'WORKER_ERRORS');
          await assertExpectedJobFailures();
          return;
        }
        await new Promise<void>((accept) => setImmediate(accept));
      }
      throw new Error('Owned background jobs failed to become terminal');
    }
    async function enqueue(
      canonicalId: string,
      organizationId: string,
      inputValues: Record<string, unknown> = {},
      expectedStatus: 'COMPLETED' | 'FAILED' = 'COMPLETED',
    ) {
      const { SystemWorkflowDispatchClass } = await import(
        '@genfeedai/contracts/queue'
      );
      await resources.check();
      const queued = await services.runner.enqueueWorkflow(
        {
          canonicalId,
          actionType: canonicalId,
          organizationId,
          inputValues,
          source: 'learning-runtime-owned',
          idempotencyKey: randomUUID(),
        },
        { dispatchClass: SystemWorkflowDispatchClass.BACKGROUND },
      );
      if (expectedStatus === 'FAILED')
        expectedFailureExecutions.set(queued.executionId, {
          organizationId,
          canonicalId,
        });
      await drain();
      const row = await first.prisma.workflowExecution.findFirst({
        where: { id: queued.executionId, organizationId, isDeleted: false },
        include: { nodeResults: true },
      });
      ensure(
        row && row.status === expectedStatus,
        'PERSISTED_WORKFLOW_TERMINAL',
      );
      for (const queue of first.queues)
        if (
          queue.name !== WORKFLOW_BACKGROUND_QUEUE &&
          [
            WORKFLOW_EXECUTION_QUEUE,
            PLATFORM_SYSTEM_WORKFLOW_QUEUE,
            AGENT_TURN_QUEUE,
          ].includes(queue.name)
        ) {
          const jobs = await queue.getJobs(
            [
              'waiting',
              'prioritized',
              'active',
              'delayed',
              'completed',
              'failed',
            ],
            0,
            999,
          );
          ensure(
            !jobs.some(
              (job) =>
                systemJobIdentity(job.data)?.priorExecution?.executionId ===
                queued.executionId,
            ),
            'WRONG_DISPATCH_ROUTE',
          );
        }
      return row;
    }
    return {
      resources,
      transports,
      environment,
      database,
      first,
      second: applications[1],
      services,
      secondServices,
      targets,
      worker,
      events,
      background,
      handledJobs,
      failedJobs,
      workerErrors,
      drain,
      enqueue,
      close,
    };
  } catch (error) {
    try {
      await close();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Learning runtime boot/cleanup failed',
      );
    }
    throw error;
  }
}
export type LearningRuntimeFixture = Awaited<
  ReturnType<typeof openLearningRuntimeFixture>
>;

type RuntimeBarrierTable =
  | 'content_learning_checkpoints'
  | 'content_learning_baselines'
  | 'posts'
  | 'credentials'
  | 'brands'
  | 'organizations';
export async function installLearningRuntimeBarrier(
  fixture: LearningRuntimeFixture,
  table: RuntimeBarrierTable,
  organizationId: string,
  event: 'INSERT' | 'UPDATE',
) {
  ensure(/^[0-9a-f-]{36}$/.test(organizationId), 'BARRIER_SCOPE_IDENTIFIER');
  const name = `barrier_${randomUUID().replaceAll('-', '')}`,
    key = Math.floor(Math.random() * 1000000000) + 1000000000;
  const controlPid = Number(
    (await fixture.database.control.query('SELECT pg_backend_pid() AS pid'))
      .rows[0].pid,
  );
  await fixture.database.control.query('SELECT pg_advisory_lock($1::bigint)', [
    key,
  ]);
  await fixture.database.control.query(
    `CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."organizationId"='${organizationId}' THEN PERFORM pg_advisory_xact_lock(${key}::bigint); END IF; RETURN NEW; END $$`,
  );
  await fixture.database.control.query(
    `CREATE TRIGGER "${name}" AFTER ${event} ON "${table}" FOR EACH ROW EXECUTE FUNCTION "${name}"()`,
  );
  let released = false;
  return {
    key,
    controlPid,
    async wait(index: number) {
      const applicationName = `${fixture.resources.schema}_application_${index}`;
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline) {
        const row = await fixture.database.observer.query<{
          pid: number;
          query: string;
        }>(
          `SELECT pid,query FROM pg_stat_activity WHERE application_name=$1 AND $2::int=ANY(pg_blocking_pids(pid))`,
          [applicationName, controlPid],
        );
        if (row.rows.length === 1) return row.rows[0];
        await new Promise<void>((accept) => setImmediate(accept));
      }
      throw new Error(
        'Real PostgreSQL transaction did not reach the owned barrier',
      );
    },
    async release() {
      if (!released) {
        released = true;
        await fixture.database.control.query(
          'SELECT pg_advisory_unlock($1::bigint)',
          [key],
        );
      }
    },
    async close() {
      await this.release();
      await fixture.database.control.query(
        `DROP TRIGGER "${name}" ON "${table}"`,
      );
      await fixture.database.control.query(`DROP FUNCTION "${name}"()`);
    },
  };
}
export async function waitLearningRuntimeContender(
  fixture: LearningRuntimeFixture,
  index: number,
  holderPid: number,
) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const blocked = await fixture.database.observer.query<{
      pid: number;
      query: string;
    }>(
      `SELECT pid,query FROM pg_stat_activity WHERE application_name=$1 AND $2::int=ANY(pg_blocking_pids(pid))`,
      [`${fixture.resources.schema}_application_${index}`, holderPid],
    );
    if (blocked.rows.length === 1) return blocked.rows[0];
    await new Promise<void>((accept) => setImmediate(accept));
  }
  throw new Error('Real source contender did not block on the selected holder');
}
export async function assertLearningRuntimeFence(
  fixture: LearningRuntimeFixture,
  pid: number,
  mode: 'ShareLock' | 'ExclusiveLock',
) {
  const lock = await fixture.database.observer.query(
    `SELECT mode FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND classid=5728 AND objid=1 AND objsubid=2 AND granted`,
    [pid],
  );
  ensure(
    lock.rows.some((row) => row.mode === mode),
    'ACTUAL_LEARNING_FENCE_NOT_HELD',
  );
}
export async function installLearningRuntimeFailure(
  fixture: LearningRuntimeFixture,
  table:
    | 'content_learning_dependencys'
    | 'content_learning_accounts'
    | 'content_learning_baselines',
  organizationId: string,
  event: 'INSERT' | 'UPDATE',
) {
  ensure(/^[0-9a-f-]{36}$/.test(organizationId), 'FAILURE_SCOPE_IDENTIFIER');
  const name = `failure_${randomUUID().replaceAll('-', '')}`;
  const scopedColumn =
    table === 'content_learning_dependencys'
      ? 'derivedOrganizationId'
      : 'organizationId';
  await fixture.database.control.query(
    `CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."${scopedColumn}"='${organizationId}' THEN RAISE EXCEPTION 'owned_learning_failure'; END IF; RETURN NEW; END $$`,
  );
  await fixture.database.control.query(
    `CREATE TRIGGER "${name}" BEFORE ${event} ON "${table}" FOR EACH ROW EXECUTE FUNCTION "${name}"()`,
  );
  return {
    async close() {
      await fixture.database.control.query(
        `DROP TRIGGER "${name}" ON "${table}"`,
      );
      await fixture.database.control.query(`DROP FUNCTION "${name}"()`);
    },
  };
}
export async function snapshotLearningRuntimeTarget(
  fixture: LearningRuntimeFixture,
  target: RuntimeTarget,
) {
  const prisma = fixture.first.prisma;
  return {
    post: await prisma.post.findMany({
      where: { organizationId: target.organizationId },
      orderBy: { id: 'asc' },
    }),
    associations: await prisma.postPublishFinalization.findMany({
      where: { organizationId: target.organizationId },
      orderBy: { id: 'asc' },
    }),
    approvals: await prisma.publishApproval.findMany({
      where: { organizationId: target.organizationId },
      orderBy: { id: 'asc' },
    }),
    accounts: await prisma.contentLearningAccount.findMany({
      where: { organizationId: target.organizationId },
      orderBy: { id: 'asc' },
    }),
    checkpoints: await prisma.contentLearningCheckpoint.findMany({
      where: { organizationId: target.organizationId },
      orderBy: { id: 'asc' },
    }),
    baselines: await prisma.contentLearningBaseline.findMany({
      where: { organizationId: target.organizationId },
      orderBy: { id: 'asc' },
    }),
    dependencies: await prisma.contentLearningDependency.findMany({
      where: { derivedOrganizationId: target.organizationId },
      orderBy: { id: 'asc' },
    }),
  };
}
export async function disposeLearningRuntimeScenario(
  fixture: LearningRuntimeFixture,
  targets: RuntimeTarget[],
) {
  await fixture.drain();
  for (const target of targets) {
    const organization = await fixture.first.prisma.organization.findUnique({
      where: { id: target.organizationId },
    });
    if (organization && !organization.isDeleted)
      await fixture.services.organizations.patch(target.organizationId, {
        isDeleted: true,
      });
  }
  await fixture.drain();
}

import { existsSync, readFileSync } from 'node:fs';
import {
  isPrismaQueryMetricsEnabled,
  recordPrismaQuery,
} from '@api/helpers/performance/request-performance.context';
import type { Prisma } from '@genfeedai/prisma';
import { PrismaClient } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

const DEFAULT_RDS_CA_FILE = '/certs/rds-ca.pem';
const POSTGRES_CA_FILE_ENV_KEYS = [
  'PRISMA_POSTGRES_CA_FILE',
  'PGSSLROOTCERT',
] as const;

// pg defaults (max 10, idle timeout 10s, unbounded acquisition wait) churn
// connections on bursty traffic: the pool drains between bursts and every
// burst pays a fresh TCP+TLS+auth round trip to RDS (~230ms). Keep a small
// warm floor and prune idle connections slowly instead. Sized against RDS
// max_connections: all backend services share this module, so total worst
// case is services × max × 2 (deploy overlap) — keep that under the ceiling.
const DEFAULT_POOL_MAX = 10;
const DEFAULT_POOL_MIN = 2;
const DEFAULT_POOL_IDLE_TIMEOUT_MS = 300_000;
const DEFAULT_POOL_ACQUIRE_TIMEOUT_MS = 10_000;
const DEFAULT_POOL_MAX_LIFETIME_SECONDS = 1_800;

type PrismaPgConnectionConfig = {
  connectionString: string;
  max: number;
  min: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  maxLifetimeSeconds: number;
  keepAlive: boolean;
  ssl?:
    | boolean
    | {
        ca?: string;
        rejectUnauthorized?: boolean;
      };
};

type PrismaPgPoolConfig = Pick<
  PrismaPgConnectionConfig,
  | 'max'
  | 'min'
  | 'idleTimeoutMillis'
  | 'connectionTimeoutMillis'
  | 'maxLifetimeSeconds'
  | 'keepAlive'
>;

type PrismaPgConfigOptions = {
  caFilePaths?: readonly (string | undefined)[];
};

function parseDatabaseUrl(connectionString: string): URL | undefined {
  try {
    return new URL(connectionString);
  } catch {
    return undefined;
  }
}

/**
 * Remove query params that only carry meaning for this factory once they are
 * resolved into explicit adapter config. node-postgres honours the explicit
 * config we pass, so the URL params are redundant — and leaving `sslmode` in
 * the connection string makes pg emit the `sslmode` deprecation warning and
 * (worse) makes us hostage to pg's upcoming change to `sslmode=require`
 * semantics. `connection_limit`/`pool_timeout` are Prisma-native pooling
 * params that pg would silently ignore.
 */
function stripResolvedParams(
  connectionString: string,
  keys: readonly string[],
): string {
  const databaseUrl = parseDatabaseUrl(connectionString);
  if (!databaseUrl) {
    return connectionString;
  }
  let mutated = false;
  for (const key of keys) {
    if (databaseUrl.searchParams.has(key)) {
      databaseUrl.searchParams.delete(key);
      mutated = true;
    }
  }
  return mutated ? databaseUrl.toString() : connectionString;
}

function parsePositiveInteger(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Pool sizing honours the Prisma URL conventions so ops can tune it from
 * DATABASE_URL alone: `connection_limit` → pool max, `pool_timeout`
 * (seconds) → acquisition timeout.
 */
function resolvePoolConfig(databaseUrl: URL | undefined): PrismaPgPoolConfig {
  const max =
    parsePositiveInteger(
      databaseUrl?.searchParams.get('connection_limit') ?? null,
    ) ?? DEFAULT_POOL_MAX;
  const poolTimeoutSeconds = parsePositiveInteger(
    databaseUrl?.searchParams.get('pool_timeout') ?? null,
  );
  return {
    connectionTimeoutMillis: poolTimeoutSeconds
      ? poolTimeoutSeconds * 1000
      : DEFAULT_POOL_ACQUIRE_TIMEOUT_MS,
    idleTimeoutMillis: DEFAULT_POOL_IDLE_TIMEOUT_MS,
    keepAlive: true,
    max,
    maxLifetimeSeconds: DEFAULT_POOL_MAX_LIFETIME_SECONDS,
    min: Math.min(DEFAULT_POOL_MIN, max),
  };
}

function readConfiguredPostgresCa(
  caFilePaths: readonly (string | undefined)[] = [],
): string | undefined {
  for (const caFilePath of caFilePaths) {
    const caFile = caFilePath?.trim();
    if (!caFile) {
      continue;
    }
    if (!existsSync(caFile)) {
      throw new Error(`Postgres CA file does not exist: ${caFile}`);
    }
    return readFileSync(caFile, 'utf8');
  }

  return undefined;
}

function readBundledRdsCa(databaseUrl: URL | undefined): string | undefined {
  if (!databaseUrl?.hostname.endsWith('.rds.amazonaws.com')) {
    return undefined;
  }
  if (!existsSync(DEFAULT_RDS_CA_FILE)) {
    return undefined;
  }
  return readFileSync(DEFAULT_RDS_CA_FILE, 'utf8');
}

export function createPrismaPgConfig(
  connectionString: string,
  options: PrismaPgConfigOptions = {},
): PrismaPgConnectionConfig {
  const databaseUrl = parseDatabaseUrl(connectionString);
  const sslMode = databaseUrl?.searchParams.get('sslmode')?.toLowerCase();
  const poolConfig = resolvePoolConfig(databaseUrl);
  const poolParamKeys = ['connection_limit', 'pool_timeout'] as const;
  const poolAndSslParamKeys = ['sslmode', 'ssl', ...poolParamKeys] as const;

  if (sslMode === 'disable') {
    return {
      connectionString: stripResolvedParams(connectionString, poolParamKeys),
      ...poolConfig,
    };
  }

  if (sslMode === 'no-verify') {
    return {
      connectionString: stripResolvedParams(
        connectionString,
        poolAndSslParamKeys,
      ),
      ssl: { rejectUnauthorized: false },
      ...poolConfig,
    };
  }

  const ca =
    readConfiguredPostgresCa(options.caFilePaths) ??
    readBundledRdsCa(databaseUrl);
  if (ca) {
    return {
      connectionString: stripResolvedParams(
        connectionString,
        poolAndSslParamKeys,
      ),
      ssl: { ca, rejectUnauthorized: true },
      ...poolConfig,
    };
  }

  if (sslMode === 'verify-ca' || sslMode === 'verify-full') {
    throw new Error(
      'Postgres SSL verification requires a CA file. Set PRISMA_POSTGRES_CA_FILE or PGSSLROOTCERT.',
    );
  }

  if (sslMode === 'require') {
    return {
      connectionString: stripResolvedParams(
        connectionString,
        poolAndSslParamKeys,
      ),
      ssl: { rejectUnauthorized: false },
      ...poolConfig,
    };
  }

  return {
    connectionString: stripResolvedParams(connectionString, poolParamKeys),
    ...poolConfig,
  };
}

type PrismaQueryEventClient = {
  $on(eventType: 'query', callback: (event: Prisma.QueryEvent) => void): void;
};

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private readonly configService: ConfigService) {
    const connectionString = configService.get('DATABASE_URL');
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    const adapter = new PrismaPg(
      createPrismaPgConfig(connectionString, {
        caFilePaths: POSTGRES_CA_FILE_ENV_KEYS.map((key) =>
          configService.get(key),
        ),
      }),
    );
    const enableQueryMetrics = isPrismaQueryMetricsEnabled(configService);
    super({
      adapter,
      ...(enableQueryMetrics
        ? { log: [{ emit: 'event' as const, level: 'query' as const }] }
        : {}),
    });

    if (enableQueryMetrics) {
      (this as unknown as PrismaQueryEventClient).$on('query', (event) => {
        recordPrismaQuery(event, this.configService);
      });
    }
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

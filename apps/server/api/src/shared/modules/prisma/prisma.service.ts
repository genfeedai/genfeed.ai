import { existsSync, readFileSync } from 'node:fs';
import { ConfigService } from '@api/config/config.service';
import {
  isPrismaQueryMetricsEnabled,
  recordPrismaQuery,
} from '@api/helpers/performance/request-performance.context';
import type { Prisma } from '@genfeedai/prisma';
import { PrismaClient } from '@genfeedai/prisma';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

const DEFAULT_RDS_CA_FILE = '/certs/rds-ca.pem';
const POSTGRES_CA_FILE_ENV_KEYS = [
  'PRISMA_POSTGRES_CA_FILE',
  'PGSSLROOTCERT',
] as const;

type PrismaPgConnectionConfig = {
  connectionString: string;
  ssl?:
    | boolean
    | {
        ca?: string;
        rejectUnauthorized?: boolean;
      };
};

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

  if (sslMode === 'disable') {
    return { connectionString };
  }

  if (sslMode === 'no-verify') {
    return { connectionString, ssl: { rejectUnauthorized: false } };
  }

  const ca =
    readConfiguredPostgresCa(options.caFilePaths) ??
    readBundledRdsCa(databaseUrl);
  if (ca) {
    return { connectionString, ssl: { ca, rejectUnauthorized: true } };
  }

  if (sslMode === 'verify-ca' || sslMode === 'verify-full') {
    throw new Error(
      'Postgres SSL verification requires a CA file. Set PRISMA_POSTGRES_CA_FILE or PGSSLROOTCERT.',
    );
  }

  if (sslMode === 'require') {
    return { connectionString, ssl: { rejectUnauthorized: false } };
  }

  return { connectionString };
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

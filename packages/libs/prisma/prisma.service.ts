import { getDeploymentFromReader } from '@genfeedai/config/deployment';
import type { Prisma } from '@genfeedai/prisma';
import { PRISMA_MODEL_METADATA, PrismaClient } from '@genfeedai/prisma';
import type { ConfigService } from '@libs/config/config.service';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { tenantModelsFromMetadata } from './discover-tenant-models';
import {
  createPrismaPgConfig,
  POSTGRES_CA_FILE_ENV_KEYS,
} from './prisma-pg-config';
import { createTenantGuardExtension } from './tenant-guard.extension';

export type PrismaQueryListener = (event: Prisma.QueryEvent) => void;

export type PrismaServiceOptions = {
  /**
   * When provided, Prisma is constructed with query-event logging and the
   * listener is registered. API adds request-scoped performance instrumentation
   * here; the workers runtime leaves it unset (no HTTP request context to
   * attribute queries to), keeping this base service dependency-free of API
   * source.
   */
  onQueryEvent?: PrismaQueryListener;
};

export type TenantGuardEnvReader = (key: string) => string | undefined;

type PrismaQueryEventClient = {
  $on(eventType: 'query', callback: PrismaQueryListener): void;
};

export function isCloudTenantGuardEnabled(
  readEnv: TenantGuardEnvReader,
): boolean {
  return getDeploymentFromReader(readEnv) === 'cloud';
}

type ConfigStringReader = {
  get(key: string): unknown;
};

function readConfigString(
  configService: ConfigStringReader,
  key: string,
): string | undefined {
  const value = configService.get(key);
  return typeof value === 'string' ? value : undefined;
}

/**
 * Runtime-agnostic Prisma client for Genfeed backend services (#1090).
 *
 * Owns connection-string parsing, node-postgres pool sizing, and RDS TLS/CA
 * resolution (see `createPrismaPgConfig`) plus the Nest connection lifecycle.
 * It imports no API source, so both `apps/server/api` (which subclasses it to
 * add request-performance instrumentation) and `apps/server/workers` (which
 * uses it directly) can depend on it without recreating the api↔workers
 * coupling this package exists to remove.
 *
 * In CLOUD mode the constructed client is `$extends` with a tenant-isolation
 * query guard. LOCAL/self-hosted is pass-through.
 */
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(
    configService: ConfigService,
    options: PrismaServiceOptions = {},
  ) {
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
    const enableQueryEvents = Boolean(options.onQueryEvent);
    super({
      adapter,
      ...(enableQueryEvents
        ? { log: [{ emit: 'event' as const, level: 'query' as const }] }
        : {}),
    });

    if (options.onQueryEvent) {
      (this as unknown as PrismaQueryEventClient).$on(
        'query',
        options.onQueryEvent,
      );
    }

    const extended = this.$extends(
      createTenantGuardExtension({
        isCloud: isCloudTenantGuardEnabled((key) =>
          readConfigString(configService, key),
        ),
        tenantModelNames: new Set(
          tenantModelsFromMetadata(PRISMA_MODEL_METADATA).map(
            ({ model }) => model,
          ),
        ),
      }),
    );

    Object.defineProperty(extended, 'onModuleInit', {
      configurable: true,
      value: () => this.onModuleInit(),
    });
    Object.defineProperty(extended, 'onModuleDestroy', {
      configurable: true,
      value: () => this.onModuleDestroy(),
    });

    // Prisma `$extends` returns a wrapped client. Nest holds the constructor
    // result, so returning it is the supported way to intercept every query.
    // biome-ignore lint/correctness/noConstructorReturn: Prisma $extends tenant guard
    return extended as this;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

import type { Prisma } from '@genfeedai/prisma';
import { PrismaClient } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { createPrismaPgConfig } from './prisma-pg-config';

const POSTGRES_CA_FILE_ENV_KEYS = [
  'PRISMA_POSTGRES_CA_FILE',
  'PGSSLROOTCERT',
] as const;

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

type PrismaQueryEventClient = {
  $on(eventType: 'query', callback: PrismaQueryListener): void;
};

/**
 * Runtime-agnostic Prisma client for Genfeed backend services (#1090).
 *
 * Owns connection-string parsing, node-postgres pool sizing, and RDS TLS/CA
 * resolution (see `createPrismaPgConfig`) plus the Nest connection lifecycle.
 * It imports no API source, so both `apps/server/api` (which subclasses it to
 * add request-performance instrumentation) and `apps/server/workers` (which
 * uses it directly) can depend on it without recreating the api↔workers
 * coupling this package exists to remove.
 */
@Injectable()
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
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

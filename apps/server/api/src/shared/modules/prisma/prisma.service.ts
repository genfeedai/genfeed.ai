import process from 'node:process';
import {
  isPrismaQueryMetricsEnabled,
  recordPrismaQuery,
} from '@api/helpers/performance/request-performance.context';
import type { Prisma } from '@genfeedai/prisma';
import { PrismaClient } from '@genfeedai/prisma';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

type PrismaQueryEventClient = {
  $on(eventType: 'query', callback: (event: Prisma.QueryEvent) => void): void;
};

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    const adapter = new PrismaPg({ connectionString });
    const enableQueryMetrics = isPrismaQueryMetricsEnabled();
    super({
      adapter,
      ...(enableQueryMetrics
        ? { log: [{ emit: 'event' as const, level: 'query' as const }] }
        : {}),
    });

    if (enableQueryMetrics) {
      (this as unknown as PrismaQueryEventClient).$on(
        'query',
        recordPrismaQuery,
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

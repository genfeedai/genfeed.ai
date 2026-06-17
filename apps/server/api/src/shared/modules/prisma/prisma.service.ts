import { ConfigService } from '@api/config/config.service';
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
  constructor(private readonly configService: ConfigService) {
    const connectionString = configService.get('DATABASE_URL');
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    const adapter = new PrismaPg({ connectionString });
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

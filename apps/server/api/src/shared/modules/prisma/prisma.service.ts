import {
  isPrismaQueryMetricsEnabled,
  recordPrismaQuery,
} from '@api/helpers/performance/request-performance.context';
import { ConfigService } from '@libs/config/config.service';
import {
  PrismaService as BasePrismaService,
  type PrismaServiceOptions,
} from '@libs/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

/**
 * API-tier Prisma client: the runtime-agnostic `@libs/prisma` service plus
 * request-scoped query-performance instrumentation (AsyncLocalStorage-backed,
 * fed by the HTTP performance interceptor). Registered under the same
 * `PrismaService` token API code already injects, so no consumer changes.
 *
 * Connection-string parsing / pool sizing / RDS TLS now live in
 * `@libs/prisma/prisma-pg-config` (#1090) — import `createPrismaPgConfig` from
 * there.
 */
@Injectable()
export class PrismaService extends BasePrismaService {
  constructor(configService: ConfigService) {
    const options: PrismaServiceOptions = isPrismaQueryMetricsEnabled(
      configService,
    )
      ? { onQueryEvent: (event) => recordPrismaQuery(event, configService) }
      : {};
    super(configService, options);
  }
}

/**
 * API process root. Feature modules are grouped by domain so this file
 * stays the composition root rather than a 200-import registry.
 */

import process from 'node:process';
import { AgentAuthModule } from '@api/agent-auth/agent-auth.module';
import { AppCollectionsModule } from '@api/app-collections.module';
import { AppIntegrationsModule } from '@api/app-integrations.module';
import { AppProductServicesModule } from '@api/app-product-services.module';
import { AuthModule } from '@api/auth/auth.module';
import { BetterAuthModule } from '@api/auth/better-auth/better-auth.module';
import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import { LocalIdentityInterceptor } from '@api/common/interceptors/local-identity.interceptor';
import { OrgPrefixMiddleware } from '@api/common/middleware/org-prefix.middleware';
import { RequestContextMiddleware } from '@api/common/middleware/request-context.middleware';
import { RequestContextModule } from '@api/common/request-context.module';
import { DevModule } from '@api/endpoints/dev/dev.module';
import { DocsModule } from '@api/endpoints/docs/docs.module';
import { SystemModule } from '@api/endpoints/system/system.module';
import { FeatureFlagModule } from '@api/feature-flag/feature-flag.module';
import { ApiKeyAuthGuard } from '@api/helpers/guards/api-key/api-key.guard';
import { CombinedAuthGuard } from '@api/helpers/guards/combined-auth/combined-auth.guard';
import { ActionOriginInterceptor } from '@api/helpers/interceptors/action-origin/action-origin.interceptor';
import { TenantContextInterceptor } from '@api/helpers/interceptors/tenant-context/tenant-context.interceptor';
import { OAuthModule } from '@api/oauth/oauth.module';
import { CacheModule } from '@api/services/cache/cache.module';
import { MicroservicesService } from '@api/services/microservices/microservices.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { RateLimitModule } from '@api/shared/modules/rate-limit/rate-limit.module';
import { SharedModule } from '@api/shared/shared.module';
import { ConfigModule } from '@libs/config/config.module';
import { ConfigService } from '@libs/config/config.service';
import { HealthController } from '@libs/health/health.controller';
import {
  HEALTH_CONTRIBUTOR,
  type HealthContributor,
} from '@libs/health/health-contributor.interface';
import { LoggerModule } from '@libs/logger/logger.module';
import { RedisModule } from '@libs/redis/redis.module';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SentryModule } from '@sentry/nestjs/setup';

@Module({
  // HealthController is registered here rather than through the global
  // HealthModule so it can inject this app's HEALTH_CONTRIBUTOR, which
  // reports peer microservices the API currently cannot reach (#3565).
  controllers: [HealthController],
  imports: [
    ConfigModule,
    LoggerModule,
    CacheModule,
    RateLimitModule,
    RedisModule.forRoot({
      configModule: ConfigModule,
      configService: ConfigService,
    }),
    SharedModule,
    PrismaModule,
    RequestContextModule,
    EventEmitterModule.forRoot({
      delimiter: '.',
      ignoreErrors: false,
      maxListeners: 20,
      verboseMemoryLeak: true,
      wildcard: true,
    }),
    SentryModule.forRoot(),
    FeatureFlagModule,
    SystemModule,
    DocsModule,
    AgentAuthModule,
    AuthModule,
    BetterAuthModule,
    OAuthModule,
    AppCollectionsModule,
    AppIntegrationsModule,
    AppProductServicesModule,
    ...(process.env.NODE_ENV === 'development' ? [DevModule] : []),
  ],
  providers: [
    OrgPrefixMiddleware,
    ApiKeyAuthGuard,
    BetterAuthGuard,
    {
      provide: APP_GUARD,
      useClass: CombinedAuthGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LocalIdentityInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ActionOriginInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantContextInterceptor,
    },
    {
      inject: [MicroservicesService],
      provide: HEALTH_CONTRIBUTOR,
      useFactory: (
        microservicesService: MicroservicesService,
      ): HealthContributor => ({
        getHealthDetails: () => microservicesService.getHealthDetails(),
        getReadiness: () => microservicesService.getReadiness(),
      }),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*path');
    consumer.apply(OrgPrefixMiddleware).forRoutes('*path');
  }
}

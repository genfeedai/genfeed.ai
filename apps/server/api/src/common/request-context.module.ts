import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { SubscriptionsModule } from '@api/collections/subscriptions/subscriptions.module';
import { RequestContextMiddleware } from '@api/common/middleware/request-context.middleware';
import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';

/**
 * Owns request-context hydration so both the HTTP middleware pipeline and the
 * in-process agent generation gateway can depend on it through a module import
 * instead of ad-hoc providers in `AppModule`.
 *
 * Nest resolves middleware tokens in the module that calls `configure()`, so
 * this module registers the middleware whose deps it imports.
 */
@Module({
  exports: [RequestContextMiddleware, RequestContextCacheService],
  imports: [OrganizationSettingsModule, SubscriptionsModule],
  providers: [RequestContextMiddleware, RequestContextCacheService],
})
export class RequestContextModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*path');
  }
}

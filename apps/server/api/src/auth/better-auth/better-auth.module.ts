import { BrandsModule } from '@api/collections/brands/brands.module';
import { MembersModule } from '@api/collections/members/members.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { UserSetupModule } from '@api/collections/users/user-setup.module';
import { UsersModule } from '@api/collections/users/users.module';
import { CommonModule } from '@api/common/common.module';
import { CacheModule } from '@api/services/cache/cache.module';
import { LifecycleEmailsModule } from '@api/services/lifecycle-emails/lifecycle-emails.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { SignupPrefillModule } from '@api/services/signup-prefill/signup-prefill.module';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { isBetterAuthEnabled } from '@genfeedai/auth-client/server';
import { ConfigService } from '@libs/config/config.service';
// Value import: consumed through the `inject` array below, not just as a type.
import { LoggerService } from '@libs/logger/logger.service';
import { Module } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PassportModule } from '@nestjs/passport';

import { resolveBetterAuthRuntimeConfig } from './better-auth.config';
import {
  BETTER_AUTH_INSTANCE,
  BETTER_AUTH_RATE_LIMIT_LOG_SERVICE,
  BETTER_AUTH_USER_CREATED_EVENT,
} from './better-auth.constants';
import {
  type BetterAuthInstance,
  createBetterAuthInstance,
} from './better-auth.factory';
import { BetterAuthService } from './better-auth.service';
import { buildRedisRateLimitStore } from './better-auth-rate-limit.util';
import { UserProvisioningListener } from './listeners/user-provisioning.listener';
import { BetterAuthStrategy } from './passport/better-auth.strategy';
import { BetterAuthIdentityResolverService } from './services/better-auth-identity-resolver.service';
import { BetterAuthMailerService } from './services/better-auth-mailer.service';
import { RateLimitClientService } from './services/rate-limit-client.service';

/**
 * Better Auth module (epic #735).
 *
 * Constructs the in-process Better Auth instance (flag-gated; `null` when off),
 * the JWT/JWKS Passport strategy, the identity resolver, and the magic-link
 * mailer. The {@link BetterAuthGuard} that wraps the strategy is provided in
 * AppModule so CombinedAuthGuard can delegate to it.
 */
@Module({
  exports: [BetterAuthService, BetterAuthStrategy, PassportModule],
  imports: [
    PassportModule,
    UsersModule,
    OrganizationsModule,
    BrandsModule,
    MembersModule,
    UserSetupModule,
    CacheModule,
    CommonModule,
    LifecycleEmailsModule,
    NotificationsModule,
    SignupPrefillModule,
  ],
  providers: [
    BetterAuthMailerService,
    BetterAuthIdentityResolverService,
    BetterAuthStrategy,
    BetterAuthService,
    RateLimitClientService,
    UserProvisioningListener,
    {
      inject: [
        PrismaService,
        ConfigService,
        BetterAuthMailerService,
        EventEmitter2,
        RateLimitClientService,
        LoggerService,
      ],
      provide: BETTER_AUTH_INSTANCE,
      useFactory: (
        prisma: PrismaService,
        config: ConfigService,
        mailer: BetterAuthMailerService,
        eventEmitter: EventEmitter2,
        rateLimitClient: RateLimitClientService,
        logger: LoggerService,
      ): BetterAuthInstance | null => {
        // Enabled by default; explicit offline/local runs can set
        // BETTER_AUTH_ENABLED=false to skip the auth handler.
        if (!isBetterAuthEnabled()) {
          return null;
        }

        const runtime = resolveBetterAuthRuntimeConfig({
          BETTER_AUTH_API_KEY: config.get('BETTER_AUTH_API_KEY'),
          BETTER_AUTH_COOKIE_DOMAIN: config.get('BETTER_AUTH_COOKIE_DOMAIN'),
          BETTER_AUTH_EXPERIMENTAL_JOINS: config.get(
            'BETTER_AUTH_EXPERIMENTAL_JOINS',
          ),
          BETTER_AUTH_IP_HEADERS: config.get('BETTER_AUTH_IP_HEADERS'),
          BETTER_AUTH_REQUIRE_EMAIL_VERIFICATION: config.get(
            'BETTER_AUTH_REQUIRE_EMAIL_VERIFICATION',
          ),
          BETTER_AUTH_SECRET: config.get('BETTER_AUTH_SECRET'),
          BETTER_AUTH_TRUSTED_ORIGINS: config.get(
            'BETTER_AUTH_TRUSTED_ORIGINS',
          ),
          BETTER_AUTH_URL: config.get('BETTER_AUTH_URL'),
          GITHUB_CLIENT_ID: config.get('GITHUB_CLIENT_ID'),
          GITHUB_CLIENT_SECRET: config.get('GITHUB_CLIENT_SECRET'),
          GOOGLE_OAUTH_CLIENT_ID: config.get('GOOGLE_OAUTH_CLIENT_ID'),
          GOOGLE_OAUTH_CLIENT_SECRET: config.get('GOOGLE_OAUTH_CLIENT_SECRET'),
          NODE_ENV: config.get('NODE_ENV'),
          PORT: config.get('PORT'),
        });

        // Isolated Redis KV for rate-limit counters (#1186) — its own logical DB
        // (or dedicated instance) so a queue backlog or cache-invalidation storm
        // can't add latency to the hot auth path. Fails open — a Redis outage
        // degrades cross-instance limiting rather than breaking authentication.
        //
        // That fail-open is deliberate (#738 criterion 7) and silent, which is
        // exactly why it needs a voice: while it is engaged, `/auth/*` keeps
        // answering 200 with brute-force throttling switched off, so nothing
        // else in the system reports the outage. Signals are throttled inside
        // the store — one line per minute, carrying how many were suppressed —
        // because every auth request degrades during an outage.
        const rateLimitStore = buildRedisRateLimitStore(rateLimitClient, {
          onDegraded: ({ error, operation, reason, suppressedCount }) => {
            logger.error(
              'Better Auth rate-limit store degraded: failing open, cross-instance brute-force throttling is NOT being enforced',
              error,
              {
                operation,
                reason,
                service: BETTER_AUTH_RATE_LIMIT_LOG_SERVICE,
                suppressedCount,
              },
            );
          },
          onRecovered: ({ degradedCount, operation }) => {
            logger.log(
              'Better Auth rate-limit store recovered: brute-force throttling is enforcing again',
              {
                degradedCount,
                operation,
                service: BETTER_AUTH_RATE_LIMIT_LOG_SERVICE,
              },
            );
          },
        });

        return createBetterAuthInstance({
          ...runtime,
          // Awaited so provisioning completes before the create resolves; the
          // UserProvisioningListener (@OnEvent) runs under Nest DI.
          onUserCreated: async (event) => {
            await eventEmitter.emitAsync(BETTER_AUTH_USER_CREATED_EVENT, event);
          },
          prisma,
          rateLimitStore,
          sendMagicLink: (params) => mailer.sendMagicLink(params),
          sendResetPassword: (params) => mailer.sendResetPassword(params),
          sendVerificationEmail: (params) =>
            mailer.sendVerificationEmail(params),
        });
      },
    },
  ],
})
export class BetterAuthModule {}

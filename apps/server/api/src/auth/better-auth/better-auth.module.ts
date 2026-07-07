import { BrandsModule } from '@api/collections/brands/brands.module';
import { MembersModule } from '@api/collections/members/members.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { UserSetupModule } from '@api/collections/users/user-setup.module';
import { UsersModule } from '@api/collections/users/users.module';
import { CommonModule } from '@api/common/common.module';
import { CacheModule } from '@api/services/cache/cache.module';
import { LifecycleEmailsModule } from '@api/services/lifecycle-emails/lifecycle-emails.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IS_BETTER_AUTH_ENABLED } from '@genfeedai/config';
import { ConfigService } from '@libs/config/config.service';
import { forwardRef, Module } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PassportModule } from '@nestjs/passport';

import {
  parseCommaSeparated,
  parseTrustedOrigins,
  resolveBetterAuthBaseUrl,
  resolveBooleanFlag,
  resolveCookieDomain,
  resolveExperimentalJoins,
  resolveSocialProviderConfig,
} from './better-auth.config';
import {
  BETTER_AUTH_INSTANCE,
  BETTER_AUTH_USER_CREATED_EVENT,
} from './better-auth.constants';
import {
  type BetterAuthInstance,
  createBetterAuthInstance,
} from './better-auth.factory';
import { BetterAuthService } from './better-auth.service';
import type { IBetterAuthRateLimitStore } from './better-auth.types';
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
    forwardRef(() => PassportModule),
    forwardRef(() => UsersModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => BrandsModule),
    forwardRef(() => MembersModule),
    forwardRef(() => UserSetupModule),
    CacheModule,
    CommonModule,
    LifecycleEmailsModule,
    NotificationsModule,
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
      ],
      provide: BETTER_AUTH_INSTANCE,
      useFactory: (
        prisma: PrismaService,
        config: ConfigService,
        mailer: BetterAuthMailerService,
        eventEmitter: EventEmitter2,
        rateLimitClient: RateLimitClientService,
      ): BetterAuthInstance | null => {
        // Enabled by default; explicit offline/local runs can set
        // BETTER_AUTH_ENABLED=false to skip the auth handler.
        if (!IS_BETTER_AUTH_ENABLED) {
          return null;
        }

        const secret = config.get('BETTER_AUTH_SECRET');
        if (!secret) {
          // Fail fast at boot (surfaced by the deploy boot-smoke gate) rather
          // than at first sign-in: a missing secret would silently break auth.
          throw new Error(
            'BETTER_AUTH_SECRET is required when BETTER_AUTH_ENABLED=true',
          );
        }

        // Isolated Redis KV for rate-limit counters (#1186) — its own logical DB
        // (or dedicated instance) so a queue backlog or cache-invalidation storm
        // can't add latency to the hot auth path. Fails open — a Redis outage
        // degrades cross-instance limiting rather than breaking authentication.
        const rateLimitStore: IBetterAuthRateLimitStore = {
          get: async (key) => {
            if (!rateLimitClient.isReady) {
              return null;
            }
            try {
              return (await rateLimitClient.instance.get(key)) ?? null;
            } catch {
              return null;
            }
          },
          set: async (key, value, ttlSeconds) => {
            if (!rateLimitClient.isReady) {
              return;
            }
            try {
              if (ttlSeconds === undefined) {
                await rateLimitClient.instance.set(key, value);
              } else {
                await rateLimitClient.instance.set(
                  key,
                  value,
                  'EX',
                  ttlSeconds,
                );
              }
            } catch {
              // Fail open: never let a Redis error break auth rate limiting.
              return;
            }
          },
        };

        return createBetterAuthInstance({
          apiKey: config.get('BETTER_AUTH_API_KEY'),
          baseURL: resolveBetterAuthBaseUrl(
            config.get('BETTER_AUTH_URL'),
            config.get('PORT'),
          ),
          cookieDomain: resolveCookieDomain(
            config.get('BETTER_AUTH_COOKIE_DOMAIN'),
          ),
          experimentalJoins: resolveExperimentalJoins(
            config.get('BETTER_AUTH_EXPERIMENTAL_JOINS'),
          ),
          github: resolveSocialProviderConfig(
            config.get('GITHUB_CLIENT_ID'),
            config.get('GITHUB_CLIENT_SECRET'),
          ),
          google: resolveSocialProviderConfig(
            config.get('GOOGLE_CLIENT_ID'),
            config.get('GOOGLE_CLIENT_SECRET'),
          ),
          ipAddressHeaders: parseCommaSeparated(
            config.get('BETTER_AUTH_IP_HEADERS'),
          ),
          rateLimitStore,
          requireEmailVerification: resolveBooleanFlag(
            config.get('BETTER_AUTH_REQUIRE_EMAIL_VERIFICATION'),
            false,
          ),
          // Awaited so provisioning completes before the create resolves; the
          // UserProvisioningListener (@OnEvent) runs under Nest DI.
          onUserCreated: async (event) => {
            await eventEmitter.emitAsync(BETTER_AUTH_USER_CREATED_EVENT, event);
          },
          prisma,
          secret,
          sendMagicLink: (params) => mailer.sendMagicLink(params),
          sendResetPassword: (params) => mailer.sendResetPassword(params),
          sendVerificationEmail: (params) =>
            mailer.sendVerificationEmail(params),
          trustedOrigins: parseTrustedOrigins(
            config.get('BETTER_AUTH_TRUSTED_ORIGINS'),
          ),
        });
      },
    },
  ],
})
export class BetterAuthModule {}

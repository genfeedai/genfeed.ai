import { BrandsModule } from '@api/collections/brands/brands.module';
import { MembersModule } from '@api/collections/members/members.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { UserSetupModule } from '@api/collections/users/user-setup.module';
import { UsersModule } from '@api/collections/users/users.module';
import { ConfigService } from '@api/config/config.service';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IS_BETTER_AUTH_ENABLED } from '@genfeedai/config';
import { forwardRef, Module } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PassportModule } from '@nestjs/passport';

import {
  parseTrustedOrigins,
  resolveBetterAuthBaseUrl,
  resolveGoogleConfig,
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
import { UserProvisioningListener } from './listeners/user-provisioning.listener';
import { BetterAuthStrategy } from './passport/better-auth.strategy';
import { BetterAuthIdentityResolverService } from './services/better-auth-identity-resolver.service';
import { BetterAuthMailerService } from './services/better-auth-mailer.service';

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
    NotificationsModule,
  ],
  providers: [
    BetterAuthMailerService,
    BetterAuthIdentityResolverService,
    BetterAuthStrategy,
    BetterAuthService,
    UserProvisioningListener,
    {
      inject: [
        PrismaService,
        ConfigService,
        BetterAuthMailerService,
        EventEmitter2,
      ],
      provide: BETTER_AUTH_INSTANCE,
      useFactory: (
        prisma: PrismaService,
        config: ConfigService,
        mailer: BetterAuthMailerService,
        eventEmitter: EventEmitter2,
      ): BetterAuthInstance | null => {
        // Enabled by default; explicit offline/local runs can set
        // BETTER_AUTH_ENABLED=false to skip the auth handler.
        if (!IS_BETTER_AUTH_ENABLED) {
          return null;
        }

        const secret = config.get('BETTER_AUTH_SECRET');
        if (!secret) {
          // Fail fast at boot (surfaced by BOOT_SMOKE) rather than at first
          // sign-in: a missing secret would silently break auth.
          throw new Error(
            'BETTER_AUTH_SECRET is required when BETTER_AUTH_ENABLED=true',
          );
        }

        return createBetterAuthInstance({
          apiKey: config.get('BETTER_AUTH_API_KEY'),
          baseURL: resolveBetterAuthBaseUrl(
            config.get('BETTER_AUTH_URL'),
            config.get('PORT'),
          ),
          google: resolveGoogleConfig(
            config.get('GOOGLE_CLIENT_ID'),
            config.get('GOOGLE_CLIENT_SECRET'),
          ),
          // Awaited so provisioning completes before the create resolves; the
          // UserProvisioningListener (@OnEvent) runs under Nest DI.
          onUserCreated: async (event) => {
            await eventEmitter.emitAsync(BETTER_AUTH_USER_CREATED_EVENT, event);
          },
          prisma,
          secret,
          sendMagicLink: (params) => mailer.sendMagicLink(params),
          trustedOrigins: parseTrustedOrigins(
            config.get('BETTER_AUTH_TRUSTED_ORIGINS'),
          ),
        });
      },
    },
  ],
})
export class BetterAuthModule {}

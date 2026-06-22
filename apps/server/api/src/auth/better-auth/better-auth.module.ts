import { BrandsModule } from '@api/collections/brands/brands.module';
import { MembersModule } from '@api/collections/members/members.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { UsersModule } from '@api/collections/users/users.module';
import { ConfigService } from '@api/config/config.service';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IS_BETTER_AUTH_ENABLED } from '@genfeedai/config';
import { forwardRef, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import {
  parseTrustedOrigins,
  resolveBetterAuthBaseUrl,
  resolveGoogleConfig,
} from './better-auth.config';
import { BETTER_AUTH_INSTANCE } from './better-auth.constants';
import {
  type BetterAuthInstance,
  createBetterAuthInstance,
} from './better-auth.factory';
import { BetterAuthService } from './better-auth.service';
import { BetterAuthStrategy } from './passport/better-auth.strategy';
import { BetterAuthIdentityResolverService } from './services/better-auth-identity-resolver.service';
import { BetterAuthMailerService } from './services/better-auth-mailer.service';

/**
 * Better Auth dual-run module (epic #735, Phase 1 — #736).
 *
 * Constructs the in-process Better Auth instance (flag-gated; `null` when off),
 * the JWT/JWKS Passport strategy that validates beside ClerkStrategy, the
 * identity resolver, and the magic-link mailer. The {@link BetterAuthGuard} that
 * wraps the strategy is provided in AppModule alongside ClerkGuard so
 * CombinedAuthGuard can delegate to it.
 */
@Module({
  exports: [BetterAuthService, BetterAuthStrategy, PassportModule],
  imports: [
    forwardRef(() => PassportModule),
    forwardRef(() => UsersModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => BrandsModule),
    forwardRef(() => MembersModule),
    NotificationsModule,
  ],
  providers: [
    BetterAuthMailerService,
    BetterAuthIdentityResolverService,
    BetterAuthStrategy,
    BetterAuthService,
    {
      inject: [PrismaService, ConfigService, BetterAuthMailerService],
      provide: BETTER_AUTH_INSTANCE,
      useFactory: (
        prisma: PrismaService,
        config: ConfigService,
        mailer: BetterAuthMailerService,
      ): BetterAuthInstance | null => {
        // Off by default — the instance stays null and the Clerk path is the
        // only one wired. Flip BETTER_AUTH_ENABLED per-environment to light up.
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
          baseURL: resolveBetterAuthBaseUrl(
            config.get('BETTER_AUTH_URL'),
            config.get('PORT'),
          ),
          google: resolveGoogleConfig(
            config.get('GOOGLE_CLIENT_ID'),
            config.get('GOOGLE_CLIENT_SECRET'),
          ),
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

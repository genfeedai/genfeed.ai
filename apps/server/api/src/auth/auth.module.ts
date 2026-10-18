import { BetterAuthModule } from '@api/auth/better-auth/better-auth.module';
import { AuthBootstrapController } from '@api/auth/controllers/auth-bootstrap.controller';
import { AuthDesktopController } from '@api/auth/controllers/auth-desktop.controller';
import { AuthSwitchOrganizationController } from '@api/auth/controllers/auth-switch-organization.controller';
import { AuthWhoamiController } from '@api/auth/controllers/auth-whoami.controller';
import { AuthBootstrapService } from '@api/auth/services/auth-bootstrap.service';
import { AuthDesktopService } from '@api/auth/services/auth-desktop.service';
import { ApiKeysModule } from '@api/collections/api-keys/api-keys.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { MembersModule } from '@api/collections/members/members.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { StreaksModule } from '@api/collections/streaks/streaks.module';
import { SubscriptionsModule } from '@api/collections/subscriptions/subscriptions.module';
import { UserSetupModule } from '@api/collections/users/user-setup.module';
import { UsersModule } from '@api/collections/users/users.module';
import { CommonModule } from '@api/common/common.module';
import { LowCreditThresholdModule } from '@api/services/low-credit-threshold/low-credit-threshold.module';
import { RouterModule } from '@api/services/router/router.module';
import { TurboRunModule } from '@api/services/turbo-run/turbo-run.module';
import { ConfigModule } from '@libs/config/config.module';
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

@Module({
  controllers: [
    AuthBootstrapController,
    AuthWhoamiController,
    AuthSwitchOrganizationController,
    AuthDesktopController,
  ],
  exports: [PassportModule],
  imports: [
    PassportModule,
    ApiKeysModule,
    TurboRunModule,
    BetterAuthModule,
    BrandsModule,
    CommonModule,
    ConfigModule,
    CredentialsCoreModule,
    CreditsModule,
    MembersModule,
    OrganizationsModule,
    OrganizationSettingsModule,
    LowCreditThresholdModule,
    PostsModule,
    RouterModule,
    StreaksModule,
    SubscriptionsModule,
    UserSetupModule,
    UsersModule,
  ],
  providers: [AuthBootstrapService, AuthDesktopService],
})
export class AuthModule {}

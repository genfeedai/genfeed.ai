import { BetterAuthModule } from '@api/auth/better-auth/better-auth.module';
import { AuthBootstrapController } from '@api/auth/controllers/auth-bootstrap.controller';
import { AuthDesktopController } from '@api/auth/controllers/auth-desktop.controller';
import { AuthWhoamiController } from '@api/auth/controllers/auth-whoami.controller';
import { AuthBootstrapService } from '@api/auth/services/auth-bootstrap.service';
import { AuthDesktopService } from '@api/auth/services/auth-desktop.service';
import { AgentRunsModule } from '@api/collections/agent-runs/agent-runs.module';
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
import { BatchGenerationModule } from '@api/services/batch-generation/batch-generation.module';
import { ConfigModule } from '@libs/config/config.module';
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

@Module({
  controllers: [
    AuthBootstrapController,
    AuthWhoamiController,
    AuthDesktopController,
  ],
  exports: [PassportModule],
  imports: [
    PassportModule,
    AgentRunsModule,
    ApiKeysModule,
    BatchGenerationModule,
    BetterAuthModule,
    BrandsModule,
    CommonModule,
    ConfigModule,
    CredentialsCoreModule,
    CreditsModule,
    MembersModule,
    OrganizationsModule,
    OrganizationSettingsModule,
    PostsModule,
    StreaksModule,
    SubscriptionsModule,
    UserSetupModule,
    UsersModule,
  ],
  providers: [AuthBootstrapService, AuthDesktopService],
})
export class AuthModule {}

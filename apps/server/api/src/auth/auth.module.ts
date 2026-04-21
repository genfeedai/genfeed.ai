import { AuthBootstrapController } from '@api/auth/controllers/auth-bootstrap.controller';
import { AuthCliController } from '@api/auth/controllers/auth-cli.controller';
import { AuthWhoamiController } from '@api/auth/controllers/auth-whoami.controller';
import { ClerkStrategy } from '@api/auth/passport/clerk.strategy';
import { AuthBootstrapService } from '@api/auth/services/auth-bootstrap.service';
import { AuthIdentityResolverService } from '@api/auth/services/auth-identity-resolver.service';
import { AgentRunsModule } from '@api/collections/agent-runs/agent-runs.module';
import { ApiKeysModule } from '@api/collections/api-keys/api-keys.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { MembersModule } from '@api/collections/members/members.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { StreaksModule } from '@api/collections/streaks/streaks.module';
import { SubscriptionsModule } from '@api/collections/subscriptions/subscriptions.module';
import { UsersModule } from '@api/collections/users/users.module';
import { CommonModule } from '@api/common/common.module';
import { ConfigModule } from '@api/config/config.module';
import { ClerkClientProvider } from '@api/providers/clerk.provider';
import { BatchGenerationModule } from '@api/services/batch-generation/batch-generation.module';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { FleetModule } from '@api/services/integrations/fleet/fleet.module';
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

@Module({
  controllers: [
    AuthBootstrapController,
    AuthWhoamiController,
    AuthCliController,
  ],
  exports: [PassportModule],
  imports: [
    PassportModule,
    AgentRunsModule,
    ApiKeysModule,
    BatchGenerationModule,
    BrandsModule,
    CommonModule,
    ConfigModule,
    CredentialsModule,
    CreditsModule,
    FleetModule,
    MembersModule,
    OrganizationsModule,
    OrganizationSettingsModule,
    PostsModule,
    StreaksModule,
    SubscriptionsModule,
    UsersModule,
  ],
  providers: [
    AuthBootstrapService,
    ClerkStrategy,
    ClerkClientProvider,
    ClerkService,
    AuthIdentityResolverService,
  ],
})
export class AuthModule {}

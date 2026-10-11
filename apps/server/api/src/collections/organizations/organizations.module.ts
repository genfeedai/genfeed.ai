import { BrandAccessModule } from '@api/authorization/brand-access/brand-access.module';
/**
 * Organizations Module
 * Multi-tenant organization management: org profiles, settings, billing,
and member access control.
 */
import { AssetsModule } from '@api/collections/assets/assets.module';
import { BillingAccountsModule } from '@api/collections/billing-accounts/billing-accounts.module';
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MembersModule } from '@api/collections/members/members.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { OrganizationsController } from '@api/collections/organizations/controllers/organizations.controller';
import { OrganizationsIntegrationsController } from '@api/collections/organizations/controllers/organizations-integrations.controller';
import { OrganizationsLogoController } from '@api/collections/organizations/controllers/organizations-logo.controller';
import { OrganizationsMembersController } from '@api/collections/organizations/controllers/organizations-members.controller';
import { OrganizationsOperationsController } from '@api/collections/organizations/controllers/organizations-operations.controller';
import { OrganizationsRelationshipsController } from '@api/collections/organizations/controllers/organizations-relationships.controller';
import { OrganizationsSettingsController } from '@api/collections/organizations/controllers/organizations-settings.controller';
import { OrganizationsCoreModule } from '@api/collections/organizations/organizations-core.module';
import { AgentPolicyOverridesService } from '@api/collections/organizations/services/agent-policy-overrides.service';
import { OrganizationLogoService } from '@api/collections/organizations/services/organization-logo.service';
import { OrganizationLogoGenerationService } from '@api/collections/organizations/services/organization-logo-generation.service';
import { OrganizationsOperationsService } from '@api/collections/organizations/services/organizations-operations.service';
import { PlatformSettingsModule } from '@api/collections/platform-settings/platform-settings.module';
import { PostsCoreModule } from '@api/collections/posts/posts-core.module';
import { RolesModule } from '@api/collections/roles/roles.module';
import { SettingsModule } from '@api/collections/settings/settings.module';
import { SkillsCoreModule } from '@api/collections/skills/skills-core.module';
import { SubscriptionsModule } from '@api/collections/subscriptions/subscriptions.module';
import { TagsModule } from '@api/collections/tags/tags.module';
import { UsersCoreModule } from '@api/collections/users/users-core.module';
import { VideosCoreModule } from '@api/collections/videos/videos-core.module';
import { CommonModule } from '@api/common/common.module';
import { IntegrationsModule } from '@api/endpoints/integrations/integrations.module';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { MemberCreditsGuard } from '@api/helpers/guards/member-credits/member-credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { PromptBuilderModule } from '@api/services/prompt-builder/prompt-builder.module';
import { WebhookClientModule } from '@api/services/webhook-client/webhook-client.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
    OrganizationsIntegrationsController,
    OrganizationsLogoController,
    OrganizationsMembersController,
    OrganizationsOperationsController,
    OrganizationsRelationshipsController,
    OrganizationsSettingsController,
    OrganizationsController,
  ],
  exports: [OrganizationsCoreModule],
  imports: [
    AssetsModule,
    BrandAccessModule,
    PlatformSettingsModule,
    OrganizationsCoreModule,
    BillingAccountsModule,
    BrandsCoreModule,
    ByokModule,
    CommonModule,
    CredentialsCoreModule,
    CreditsModule,
    IngredientsModule,
    IntegrationsModule,
    LoggerModule,
    MembersModule,
    ModelsModule,
    OrganizationSettingsModule,
    // PostsModule exports AnalyticsAggregationService for org analytics duals
    PostsCoreModule,
    PromptBuilderModule,
    ReplicateModule,
    RolesModule,
    SettingsModule,
    SkillsCoreModule,
    SubscriptionsModule,
    TagsModule,
    UsersCoreModule,
    VideosCoreModule,
    WebhookClientModule,
  ],
  providers: [
    AgentPolicyOverridesService,
    CreditsGuard,
    CreditsInterceptor,
    MemberCreditsGuard,
    OrganizationLogoGenerationService,
    OrganizationLogoService,
    OrganizationsOperationsService,
  ],
})
export class OrganizationsModule {}

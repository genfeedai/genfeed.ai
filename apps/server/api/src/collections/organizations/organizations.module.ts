/**
 * Organizations Module
 * Multi-tenant organization management: org profiles, settings, billing,
and member access control.
 */
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MembersModule } from '@api/collections/members/members.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { OrganizationsController } from '@api/collections/organizations/controllers/organizations.controller';
import { OrganizationsIntegrationsController } from '@api/collections/organizations/controllers/organizations-integrations.controller';
import { OrganizationsMembersController } from '@api/collections/organizations/controllers/organizations-members.controller';
import { OrganizationsRelationshipsController } from '@api/collections/organizations/controllers/organizations-relationships.controller';
import { OrganizationsSettingsController } from '@api/collections/organizations/controllers/organizations-settings.controller';
import { OrganizationsCoreModule } from '@api/collections/organizations/organizations-core.module';
import { PostsCoreModule } from '@api/collections/posts/posts-core.module';
import { RolesModule } from '@api/collections/roles/roles.module';
import { SettingsModule } from '@api/collections/settings/settings.module';
import { SubscriptionsModule } from '@api/collections/subscriptions/subscriptions.module';
import { TagsModule } from '@api/collections/tags/tags.module';
import { UsersCoreModule } from '@api/collections/users/users-core.module';
import { VideosCoreModule } from '@api/collections/videos/videos-core.module';
import { CommonModule } from '@api/common/common.module';
import { IntegrationsModule } from '@api/endpoints/integrations/integrations.module';
import { MemberCreditsGuard } from '@api/helpers/guards/member-credits/member-credits.guard';
import { ByokModule } from '@api/services/byok/byok.module';
import { WebhookClientModule } from '@api/services/webhook-client/webhook-client.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
    OrganizationsController,
    OrganizationsIntegrationsController,
    OrganizationsMembersController,
    OrganizationsRelationshipsController,
    OrganizationsSettingsController,
  ],
  exports: [OrganizationsCoreModule],
  imports: [
    OrganizationsCoreModule,
    BrandsCoreModule,
    ByokModule,
    CommonModule,
    CredentialsCoreModule,
    IngredientsModule,
    IntegrationsModule,
    LoggerModule,
    MembersModule,
    ModelsModule,
    OrganizationSettingsModule,
    // PostsModule exports AnalyticsAggregationService for org analytics duals
    PostsCoreModule,
    RolesModule,
    SettingsModule,
    SubscriptionsModule,
    TagsModule,
    UsersCoreModule,
    VideosCoreModule,
    WebhookClientModule,
  ],
  providers: [MemberCreditsGuard],
})
export class OrganizationsModule {}

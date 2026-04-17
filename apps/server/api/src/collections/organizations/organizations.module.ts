/**
 * Organizations Module
 * Multi-tenant organization management: org profiles, settings, billing,
and member access control.
 */
import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MembersModule } from '@api/collections/members/members.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { OrganizationsController } from '@api/collections/organizations/controllers/organizations.controller';
import { OrganizationsIntegrationsController } from '@api/collections/organizations/controllers/organizations-integrations.controller';
import { OrganizationsMembersController } from '@api/collections/organizations/controllers/organizations-members.controller';
import { OrganizationsRelationshipsController } from '@api/collections/organizations/controllers/organizations-relationships.controller';
import { OrganizationsSettingsController } from '@api/collections/organizations/controllers/organizations-settings.controller';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { PostsModule } from '@api/collections/posts/posts.module';
import { RolesModule } from '@api/collections/roles/roles.module';
import { SettingsModule } from '@api/collections/settings/settings.module';
import { SubscriptionsModule } from '@api/collections/subscriptions/subscriptions.module';
import { TagsModule } from '@api/collections/tags/tags.module';
import { UsersModule } from '@api/collections/users/users.module';
import { VideosModule } from '@api/collections/videos/videos.module';
import { CommonModule } from '@api/common/common.module';
import { IntegrationsModule } from '@api/endpoints/integrations/integrations.module';
import { MemberCreditsGuard } from '@api/helpers/guards/member-credits/member-credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { ClerkModule } from '@api/services/integrations/clerk/clerk.module';
import { FleetModule } from '@api/services/integrations/fleet/fleet.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [
    OrganizationsController,
    OrganizationsIntegrationsController,
    OrganizationsMembersController,
    OrganizationsRelationshipsController,
    OrganizationsSettingsController,
  ],
  exports: [OrganizationsService],
  imports: [
    // Core modules
    forwardRef(() => ActivitiesModule),
    forwardRef(() => BrandsModule),
    ByokModule,
    forwardRef(() => ClerkModule),
    CommonModule,
    forwardRef(() => CredentialsModule),
    forwardRef(() => CreditsModule),
    FleetModule,
    forwardRef(() => IngredientsModule),
    IntegrationsModule,
    LoggerModule,
    forwardRef(() => MembersModule),
    forwardRef(() => ModelsModule),
    forwardRef(() => OrganizationSettingsModule),
    forwardRef(() => PostsModule),
    forwardRef(() => RolesModule),
    forwardRef(() => SettingsModule),
    forwardRef(() => SubscriptionsModule),
    forwardRef(() => TagsModule),
    forwardRef(() => UsersModule),
    forwardRef(() => VideosModule),
  ],
  providers: [
    OrganizationsService,
    MemberCreditsGuard,
    CreditsInterceptor,
    CreditsUtilsService,
  ],
})
export class OrganizationsModule {}

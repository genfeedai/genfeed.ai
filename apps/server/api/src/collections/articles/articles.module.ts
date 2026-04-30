/**
 * Articles Module
 * SEO-optimized long-form content: AI generation, conversational editing, version control,
Twitter thread conversion, virality analysis, and public link sharing.
 */
import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { ArticlesController } from '@api/collections/articles/controllers/articles.controller';
import { ArticleAnalyticsService } from '@api/collections/articles/services/article-analytics.service';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { ArticlesAnalyticsService } from '@api/collections/articles/services/articles-analytics.service';
import { ArticlesContentService } from '@api/collections/articles/services/articles-content.service';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { HarnessProfilesModule } from '@api/collections/harness-profiles/harness-profiles.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { PersonasModule } from '@api/collections/personas/personas.module';
import { PromptsModule } from '@api/collections/prompts/prompts.module';
import { TemplatesModule } from '@api/collections/templates/templates.module';
import { UsersModule } from '@api/collections/users/users.module';
import { ConfigModule } from '@api/config/config.module';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { ContentHarnessModule } from '@api/services/harness/harness.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { PromptBuilderModule } from '@api/services/prompt-builder/prompt-builder.module';
import { RouterModule } from '@api/services/router/router.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [ArticlesController],
  exports: [
    ArticleAnalyticsService,
    ArticlesAnalyticsService,
    ArticlesContentService,
    ArticlesService,
  ],
  imports: [
    forwardRef(() => ActivitiesModule),
    forwardRef(() => BrandsModule),
    ByokModule,
    forwardRef(() => ConfigModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => ModelsModule),
    HarnessProfilesModule,
    forwardRef(() => NotificationsModule),
    forwardRef(() => OrganizationSettingsModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => PersonasModule),
    forwardRef(() => PromptBuilderModule),
    forwardRef(() => PromptsModule),
    forwardRef(() => ReplicateModule),
    forwardRef(() => RouterModule),
    forwardRef(() => TemplatesModule),
    forwardRef(() => UsersModule),
    ContentHarnessModule,
  ],
  providers: [
    ArticleAnalyticsService,
    ArticlesAnalyticsService,
    ArticlesContentService,
    ArticlesService,
    CreditsGuard,
    CreditsInterceptor,
  ],
})
export class ArticlesModule {}

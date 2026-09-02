/**
 * Articles Module
 * SEO-optimized long-form content: AI generation, conversational editing, version control,
Twitter thread conversion, virality analysis, and public link sharing.
 */
import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { ArticlesController } from '@api/collections/articles/controllers/articles.controller';
import { ArticlesOperationsController } from '@api/collections/articles/controllers/operations/articles-operations.controller';
import { ArticlesTransformationsController } from '@api/collections/articles/controllers/transformations/articles-transformations.controller';
import { ArticleAnalyticsService } from '@api/collections/articles/services/article-analytics.service';
import { ArticleContentPersistenceService } from '@api/collections/articles/services/article-content-persistence.service';
import { ArticleInsightsService } from '@api/collections/articles/services/article-insights.service';
import { ArticleRemixService } from '@api/collections/articles/services/article-remix.service';
import { ArticleReviewService } from '@api/collections/articles/services/article-review.service';
import { ArticleTextGenerationService } from '@api/collections/articles/services/article-text-generation.service';
import { ArticleVersionService } from '@api/collections/articles/services/article-version.service';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { ArticlesContentService } from '@api/collections/articles/services/articles-content.service';
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { HarnessProfilesModule } from '@api/collections/harness-profiles/harness-profiles.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { OrganizationsCoreModule } from '@api/collections/organizations/organizations-core.module';
import { PersonasCoreModule } from '@api/collections/personas/personas-core.module';
import { PromptsModule } from '@api/collections/prompts/prompts.module';
import { TagsModule } from '@api/collections/tags/tags.module';
import { TemplatesModule } from '@api/collections/templates/templates.module';
import { UsersModule } from '@api/collections/users/users.module';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { ContentHarnessModule } from '@api/services/harness/harness.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { PromptBuilderModule } from '@api/services/prompt-builder/prompt-builder.module';
import { RouterModule } from '@api/services/router/router.module';
import { SeoModule } from '@api/services/seo/seo.module';
import { ConfigModule } from '@libs/config/config.module';
import { Module } from '@nestjs/common';

@Module({
  // `ArticlesOperationsController` and `ArticlesTransformationsController` must
  // register before `ArticlesController`: their static path segments would
  // otherwise be shadowed by the inherited BaseCRUD `:id` routes.
  controllers: [
    ArticlesOperationsController,
    ArticlesTransformationsController,
    ArticlesController,
  ],
  exports: [ArticleAnalyticsService, ArticlesContentService, ArticlesService],
  imports: [
    ActivitiesModule,
    BrandsCoreModule,
    ByokModule,
    ConfigModule,
    CreditsModule,
    CredentialsCoreModule,
    ModelsModule,
    HarnessProfilesModule,
    NotificationsModule,
    OrganizationSettingsModule,
    OrganizationsCoreModule,
    PersonasCoreModule,
    PromptBuilderModule,
    PromptsModule,
    ReplicateModule,
    RouterModule,
    SeoModule,
    TagsModule,
    TemplatesModule,
    UsersModule,
    ContentHarnessModule,
  ],
  providers: [
    ArticleAnalyticsService,
    ArticleContentPersistenceService,
    ArticleInsightsService,
    ArticleRemixService,
    ArticleReviewService,
    ArticleTextGenerationService,
    ArticleVersionService,
    ArticlesContentService,
    ArticlesService,
    CreditsGuard,
    CreditsInterceptor,
  ],
})
export class ArticlesModule {}

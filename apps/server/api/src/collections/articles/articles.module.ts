/**
 * Articles Module
 * SEO-optimized long-form content: AI generation, conversational editing, version control,
Twitter thread conversion, virality analysis, and public link sharing.
 */
import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { ArticlesController } from '@api/collections/articles/controllers/articles.controller';
import { ArticleAnalyticsService } from '@api/collections/articles/services/article-analytics.service';
import { ArticleContentPersistenceService } from '@api/collections/articles/services/article-content-persistence.service';
import { ArticleInsightsService } from '@api/collections/articles/services/article-insights.service';
import { ArticleRemixService } from '@api/collections/articles/services/article-remix.service';
import { ArticleReviewService } from '@api/collections/articles/services/article-review.service';
import { ArticleTextGenerationService } from '@api/collections/articles/services/article-text-generation.service';
import { ArticleTranscriptService } from '@api/collections/articles/services/article-transcript.service';
import { ArticleVersionService } from '@api/collections/articles/services/article-version.service';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { ArticlesContentService } from '@api/collections/articles/services/articles-content.service';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { HarnessProfilesModule } from '@api/collections/harness-profiles/harness-profiles.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { PersonasModule } from '@api/collections/personas/personas.module';
import { PromptsModule } from '@api/collections/prompts/prompts.module';
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
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [ArticlesController],
  exports: [ArticleAnalyticsService, ArticlesContentService, ArticlesService],
  imports: [
    forwardRef(() => ActivitiesModule),
    forwardRef(() => BrandsModule),
    forwardRef(() => ByokModule),
    forwardRef(() => ConfigModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => CredentialsCoreModule),
    forwardRef(() => ModelsModule),
    forwardRef(() => HarnessProfilesModule),
    forwardRef(() => NotificationsModule),
    forwardRef(() => OrganizationSettingsModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => PersonasModule),
    forwardRef(() => PromptBuilderModule),
    forwardRef(() => PromptsModule),
    forwardRef(() => ReplicateModule),
    forwardRef(() => RouterModule),
    forwardRef(() => SeoModule),
    forwardRef(() => TemplatesModule),
    forwardRef(() => UsersModule),
    forwardRef(() => ContentHarnessModule),
  ],
  providers: [
    ArticleAnalyticsService,
    ArticleContentPersistenceService,
    ArticleInsightsService,
    ArticleRemixService,
    ArticleReviewService,
    ArticleTextGenerationService,
    ArticleTranscriptService,
    ArticleVersionService,
    ArticlesContentService,
    ArticlesService,
    CreditsGuard,
    CreditsInterceptor,
  ],
})
export class ArticlesModule {}

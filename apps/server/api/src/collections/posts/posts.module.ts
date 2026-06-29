/**
 * Posts Module
 * Published content tracking: schedule posts, track post status, manage recurring posts,
store platform post IDs/URLs, and multi-platform publishing.
 */

import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { PostsAnalyticsController } from '@api/collections/posts/controllers/analytics/posts-analytics.controller';
import { PostsOperationsController } from '@api/collections/posts/controllers/operations/posts-operations.controller';
import { PostsController } from '@api/collections/posts/controllers/posts.controller';
import { AnalyticsAggregationService } from '@api/collections/posts/services/analytics-aggregation.service';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostGenerationService } from '@api/collections/posts/services/post-generation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { TemplatesModule } from '@api/collections/templates/templates.module';
import { TrendsModule } from '@api/collections/trends/trends.module';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { PromptBuilderModule } from '@api/services/prompt-builder/prompt-builder.module';
import { QuotaModule } from '@api/services/quota/quota.module';
import { SeoModule } from '@api/services/seo/seo.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [
    PostsAnalyticsController,
    PostsController,
    PostsOperationsController,
  ],
  exports: [AnalyticsAggregationService, PostAnalyticsService, PostsService],
  imports: [
    forwardRef(() => ActivitiesModule),
    forwardRef(() => ByokModule),
    forwardRef(() => CredentialsCoreModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => IngredientsModule),
    forwardRef(() => ModelsModule),
    forwardRef(() => NotificationsPublisherModule),
    forwardRef(() => OrganizationSettingsModule),
    forwardRef(() => PromptBuilderModule),
    forwardRef(() => QuotaModule),
    forwardRef(() => ReplicateModule),
    forwardRef(() => SeoModule),
    forwardRef(() => TemplatesModule),
    forwardRef(() => TrendsModule),
  ],
  providers: [
    AnalyticsAggregationService,
    CreditsGuard,
    CreditsInterceptor,
    PostAnalyticsService,
    PostGenerationService,
    PostsService,
  ],
})
export class PostsModule {}

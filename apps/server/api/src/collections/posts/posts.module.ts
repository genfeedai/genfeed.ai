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
import { ContentMentionsController } from '@api/collections/posts/controllers/content-mentions.controller';
import { PostsOperationsController } from '@api/collections/posts/controllers/operations/posts-operations.controller';
import { PostsController } from '@api/collections/posts/controllers/posts.controller';
import { AnalyticsAggregationService } from '@api/collections/posts/services/analytics-aggregation.service';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostGenerationService } from '@api/collections/posts/services/post-generation.service';
import { PostThreadGenerationService } from '@api/collections/posts/services/post-thread-generation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { PublishApprovalsModule } from '@api/collections/publish-approvals/publish-approvals.module';
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
  // PostsOperationsController must register before PostsController: its static
  // `PATCH /posts/batch` route has to be matched ahead of the inherited
  // `PATCH /posts/:id` on the BaseCRUD PostsController, which otherwise
  // captures `batch` as an :id and 404s the bulk endpoint.
  controllers: [
    ContentMentionsController,
    PostsAnalyticsController,
    PostsOperationsController,
    PostsController,
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
    PublishApprovalsModule,
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
    PostThreadGenerationService,
    PostsService,
  ],
})
export class PostsModule {}

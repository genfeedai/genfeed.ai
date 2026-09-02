/**
 * Posts Module
 * Published content tracking: schedule posts, track post status, manage recurring posts,
store platform post IDs/URLs, and multi-platform publishing.
 */

import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { ContentIntelligenceModule } from '@api/collections/content-intelligence/content-intelligence.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { PostGroupsModule } from '@api/collections/post-groups/post-groups.module';
import { AnalyticsCollectionModule } from '@api/collections/posts/analytics-collection.module';
import { PostsAnalyticsController } from '@api/collections/posts/controllers/analytics/posts-analytics.controller';
import { ContentMentionsController } from '@api/collections/posts/controllers/content-mentions.controller';
import { PostsGenerationController } from '@api/collections/posts/controllers/operations/posts-generation.controller';
import { PostsOperationsController } from '@api/collections/posts/controllers/operations/posts-operations.controller';
import { PostsRetryController } from '@api/collections/posts/controllers/operations/posts-retry.controller';
import { PostsController } from '@api/collections/posts/controllers/posts.controller';
import { PostVariationSourceGuard } from '@api/collections/posts/guards/post-variation-source.guard';
import { PostAccountFanoutModule } from '@api/collections/posts/post-account-fanout.module';
import { PostLifecycleModule } from '@api/collections/posts/post-lifecycle.module';
import { PostsCoreModule } from '@api/collections/posts/posts-core.module';
import { PostGenerationService } from '@api/collections/posts/services/post-generation.service';
import { PostRepurposeService } from '@api/collections/posts/services/post-repurpose.service';
import { PostRetryService } from '@api/collections/posts/services/post-retry.service';
import { PostThreadGenerationService } from '@api/collections/posts/services/post-thread-generation.service';
import { PostVariationService } from '@api/collections/posts/services/post-variation.service';
import { ReviewablePostsService } from '@api/collections/posts/services/reviewable-posts.service';
import { PublishApprovalsModule } from '@api/collections/publish-approvals/publish-approvals.module';
import { TemplatesModule } from '@api/collections/templates/templates.module';
import { TrendsModule } from '@api/collections/trends/trends.module';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { QueuesModule } from '@api/queues/core/queues.module';
import { BatchGenerationModule } from '@api/services/batch-generation/batch-generation.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { PromptBuilderModule } from '@api/services/prompt-builder/prompt-builder.module';
import { QuotaModule } from '@api/services/quota/quota.module';
import { SeoModule } from '@api/services/seo/seo.module';
import { Module } from '@nestjs/common';

@Module({
  // PostsOperationsController must register before PostsController: its static
  // `PATCH /posts/batch` route has to be matched ahead of the inherited
  // `PATCH /posts/:id` on the BaseCRUD PostsController, which otherwise
  // captures `batch` as an :id and 404s the bulk endpoint.
  controllers: [
    ContentMentionsController,
    PostsAnalyticsController,
    PostsGenerationController,
    PostsOperationsController,
    PostsRetryController,
    PostsController,
  ],
  exports: [
    AnalyticsCollectionModule,
    PostAccountFanoutModule,
    PostLifecycleModule,
    PostRepurposeService,
    PostsCoreModule,
    ReviewablePostsService,
  ],
  imports: [
    AnalyticsCollectionModule,
    QueuesModule,
    ActivitiesModule,
    PostsCoreModule,
    BatchGenerationModule,
    ByokModule,
    ContentIntelligenceModule,
    CredentialsCoreModule,
    CreditsModule,
    IngredientsModule,
    ModelsModule,
    NotificationsPublisherModule,
    OrganizationSettingsModule,
    PostAccountFanoutModule,
    PostGroupsModule,
    PostLifecycleModule,
    PromptBuilderModule,
    PublishApprovalsModule,
    QuotaModule,
    ReplicateModule,
    SeoModule,
    TemplatesModule,
    TrendsModule,
  ],
  providers: [
    CreditsGuard,
    CreditsInterceptor,
    PostGenerationService,
    PostRetryService,
    PostRepurposeService,
    PostThreadGenerationService,
    PostVariationService,
    PostVariationSourceGuard,
    ReviewablePostsService,
  ],
})
export class PostsModule {}

/**
 * Posts Module
 * Published content tracking: schedule posts, track post status, manage recurring posts,
store platform post IDs/URLs, and multi-platform publishing.
 */

import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { PostsAnalyticsController } from '@api/collections/posts/controllers/analytics/posts-analytics.controller';
import { PostsOperationsController } from '@api/collections/posts/controllers/operations/posts-operations.controller';
import { PostsController } from '@api/collections/posts/controllers/posts.controller';
import { Post, PostSchema } from '@api/collections/posts/schemas/post.schema';
import {
  PostAnalytics,
  PostAnalyticsSchema,
} from '@api/collections/posts/schemas/post-analytics.schema';
import { AnalyticsAggregationService } from '@api/collections/posts/services/analytics-aggregation.service';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { TemplatesModule } from '@api/collections/templates/templates.module';
import { TrendsModule } from '@api/collections/trends/trends.module';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { PromptBuilderModule } from '@api/services/prompt-builder/prompt-builder.module';
import { QuotaModule } from '@api/services/quota/quota.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [
    PostsAnalyticsController,
    PostsController,
    PostsOperationsController,
  ],
  exports: [
    AnalyticsAggregationService,
    MongooseModule,
    PostAnalyticsService,
    PostsService,
  ],
  imports: [
    forwardRef(() => ActivitiesModule),
    ByokModule,
    forwardRef(() => CredentialsModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => IngredientsModule),
    forwardRef(() => ModelsModule),
    forwardRef(() => NotificationsPublisherModule),
    forwardRef(() => OrganizationSettingsModule),
    forwardRef(() => PromptBuilderModule),
    forwardRef(() => QuotaModule),
    forwardRef(() => ReplicateModule),
    forwardRef(() => TemplatesModule),
    TrendsModule,
    // Post schema on default (cloud) connection
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: Post.name,
          useFactory: () => {
            const schema = PostSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Status-based queries for publishing workflow
            schema.index(
              { isDeleted: 1, organization: 1, status: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Platform-specific publishing
            schema.index(
              { isDeleted: 1, organization: 1, platform: 1, status: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index(
              {
                createdAt: -1,
                ingredients: 1,
                isDeleted: 1,
                user: 1,
              },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Virtual populate for children posts
            schema.virtual('children', {
              foreignField: 'parent',
              localField: '_id',
              match: { isDeleted: false },
              options: { sort: { order: 1 } },
              ref: 'Post',
            });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
    // PostAnalytics schema on analytics connection
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: PostAnalytics.name,
          useFactory: () => {
            const schema = PostAnalyticsSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.ANALYTICS,
    ),
  ],
  providers: [
    AnalyticsAggregationService,
    CreditsGuard,
    CreditsInterceptor,
    PostAnalyticsService,
    PostsService,
  ],
})
export class PostsModule {}

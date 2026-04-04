/**
 * Analytics Module
 * Platform-agnostic analytics aggregation, leaderboards, time series data,
 * and export functionality.
 */
import { BotsModule } from '@api/collections/bots/bots.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import {
  PostAnalytics,
  PostAnalyticsSchema,
} from '@api/collections/posts/schemas/post-analytics.schema';
import { SubscriptionsModule } from '@api/collections/subscriptions/subscriptions.module';
import { UsersModule } from '@api/collections/users/users.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { AnalyticsController } from '@api/endpoints/analytics/analytics.controller';
import { AnalyticsService } from '@api/endpoints/analytics/analytics.service';
import { BusinessAnalyticsService } from '@api/endpoints/analytics/business-analytics.service';
import {
  Analytic,
  AnalyticSchema,
} from '@api/endpoints/analytics/schemas/analytic.schema';
import { CacheModule } from '@api/services/cache/cache.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { PinterestModule } from '@api/services/integrations/pinterest/pinterest.module';
import { TiktokModule } from '@api/services/integrations/tiktok/tiktok.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { YoutubeModule } from '@api/services/integrations/youtube/youtube.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginate from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [AnalyticsController],
  exports: [MongooseModule, AnalyticsService],
  imports: [
    // Core modules
    forwardRef(() => CacheModule),

    // Data modules (needed for controller and service)
    forwardRef(() => BotsModule),
    forwardRef(() => BrandsModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => IngredientsModule),
    forwardRef(() => ModelsModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => PostsModule),
    forwardRef(() => SubscriptionsModule),
    forwardRef(() => UsersModule),
    forwardRef(() => WorkflowsModule),

    // Platform integration modules (needed for external API analytics)
    forwardRef(() => InstagramModule),
    forwardRef(() => PinterestModule),
    forwardRef(() => TiktokModule),
    forwardRef(() => TwitterModule),
    forwardRef(() => YoutubeModule),

    // Analytic schema on analytics connection
    MongooseModule.forFeatureAsync(
      [
        {
          name: Analytic.name,
          useFactory: () => {
            const schema = AnalyticSchema;

            schema.plugin(mongooseAggregatePaginate);

            return schema;
          },
        },
        {
          name: PostAnalytics.name,
          useFactory: () => {
            const schema = PostAnalyticsSchema;

            schema.plugin(mongooseAggregatePaginate);

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.ANALYTICS,
    ),
  ],
  providers: [AnalyticsService, BusinessAnalyticsService],
})
export class AnalyticsModule {}

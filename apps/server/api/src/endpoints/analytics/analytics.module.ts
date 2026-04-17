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
import { SubscriptionsModule } from '@api/collections/subscriptions/subscriptions.module';
import { UsersModule } from '@api/collections/users/users.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { AnalyticsController } from '@api/endpoints/analytics/analytics.controller';
import { AnalyticsService } from '@api/endpoints/analytics/analytics.service';
import { BusinessAnalyticsService } from '@api/endpoints/analytics/business-analytics.service';
import { CacheModule } from '@api/services/cache/cache.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { PinterestModule } from '@api/services/integrations/pinterest/pinterest.module';
import { TiktokModule } from '@api/services/integrations/tiktok/tiktok.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { YoutubeModule } from '@api/services/integrations/youtube/youtube.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [AnalyticsController],
  exports: [AnalyticsService],
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
  ],
  providers: [AnalyticsService, BusinessAnalyticsService],
})
export class AnalyticsModule {}

/**
 * Analytics Module
 * Platform-agnostic analytics aggregation, leaderboards, time series data,
 * and export functionality.
 */
import { BotsModule } from '@api/collections/bots/bots.module';
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { OrganizationsCoreModule } from '@api/collections/organizations/organizations-core.module';
import { PostsCoreModule } from '@api/collections/posts/posts-core.module';
import { SubscriptionsModule } from '@api/collections/subscriptions/subscriptions.module';
import { UsersModule } from '@api/collections/users/users.module';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { AnalyticsController } from '@api/endpoints/analytics/analytics.controller';
import { AnalyticsService } from '@api/endpoints/analytics/analytics.service';
import { AnalyticsAdminController } from '@api/endpoints/analytics/analytics-admin.controller';
import { AnalyticsAdminSummaryService } from '@api/endpoints/analytics/analytics-admin-summary.service';
import { AnalyticsExportService } from '@api/endpoints/analytics/analytics-export.service';
import { BusinessAnalyticsService } from '@api/endpoints/analytics/business-analytics.service';
import { EntityLeaderboardService } from '@api/endpoints/analytics/entity-leaderboard.service';
import { CacheModule } from '@api/services/cache/cache.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { PinterestModule } from '@api/services/integrations/pinterest/pinterest.module';
import { StripeCoreModule } from '@api/services/integrations/stripe/stripe-core.module';
import { TiktokModule } from '@api/services/integrations/tiktok/tiktok.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { YoutubeModule } from '@api/services/integrations/youtube/youtube.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AnalyticsAdminController, AnalyticsController],
  exports: [AnalyticsService],
  imports: [
    // Core modules
    CacheModule,

    // Data modules (needed for controller and service)
    BotsModule,
    BrandsCoreModule,
    CreditsModule,
    IngredientsModule,
    ModelsModule,
    OrganizationsCoreModule,
    PostsCoreModule,
    SubscriptionsModule,
    UsersModule,
    WorkflowsCoreModule,

    // Platform integration modules (needed for external API analytics)
    InstagramModule,
    PinterestModule,
    // Stripe is read-only here: BusinessAnalyticsService prefers real charge
    // data for revenue when a Stripe client is configured. Use the leaf
    // client module so analytics does not close a StripeModule ring.
    StripeCoreModule,
    TiktokModule,
    TwitterModule,
    YoutubeModule,
  ],
  providers: [
    AnalyticsAdminSummaryService,
    AnalyticsService,
    AnalyticsExportService,
    BusinessAnalyticsService,
    EntityLeaderboardService,
  ],
})
export class AnalyticsModule {}

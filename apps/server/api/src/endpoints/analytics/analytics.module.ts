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
import { OrganizationLogoService } from '@api/collections/organizations/services/organization-logo.service';
import { OutliersCoreModule } from '@api/collections/outliers/outliers-core.module';
import { PostsCoreModule } from '@api/collections/posts/posts-core.module';
import { SubscriptionsModule } from '@api/collections/subscriptions/subscriptions.module';
import { UsersModule } from '@api/collections/users/users.module';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { AccountAnalyticsController } from '@api/endpoints/analytics/account-analytics.controller';
import { AccountAnalyticsService } from '@api/endpoints/analytics/account-analytics.service';
import { AccountAnalyticsSnapshotService } from '@api/endpoints/analytics/account-analytics-snapshot.service';
import { AnalyticsController } from '@api/endpoints/analytics/analytics.controller';
import { AnalyticsService } from '@api/endpoints/analytics/analytics.service';
import { AnalyticsAdminController } from '@api/endpoints/analytics/analytics-admin.controller';
import { AnalyticsAdminSummaryService } from '@api/endpoints/analytics/analytics-admin-summary.service';
import { AnalyticsExportService } from '@api/endpoints/analytics/analytics-export.service';
import { AnalyticsWinnersController } from '@api/endpoints/analytics/analytics-winners.controller';
import { BusinessAnalyticsService } from '@api/endpoints/analytics/business-analytics.service';
import { EntityLeaderboardService } from '@api/endpoints/analytics/entity-leaderboard.service';
import { XGrowthReportService } from '@api/endpoints/analytics/x-growth-report/x-growth-report.service';
import { CacheModule } from '@api/services/cache/cache.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { PinterestModule } from '@api/services/integrations/pinterest/pinterest.module';
import { StripeCoreModule } from '@api/services/integrations/stripe/stripe-core.module';
import { TiktokModule } from '@api/services/integrations/tiktok/tiktok.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { YoutubeModule } from '@api/services/integrations/youtube/youtube.module';
import { MediaUrlsModule } from '@api/services/media-urls/media-urls.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
    AccountAnalyticsController,
    AnalyticsWinnersController,
    AnalyticsAdminController,
    AnalyticsController,
  ],
  exports: [AccountAnalyticsService, AnalyticsService],
  imports: [
    // Core modules
    CacheModule,

    // Data modules (needed for controller and service)
    BotsModule,
    BrandsCoreModule,
    CreditsModule,
    IngredientsModule,
    MediaUrlsModule,
    ModelsModule,
    OrganizationsCoreModule,
    OutliersCoreModule,
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
    AccountAnalyticsService,
    AccountAnalyticsSnapshotService,
    XGrowthReportService,
    AnalyticsAdminSummaryService,
    AnalyticsService,
    AnalyticsExportService,
    BusinessAnalyticsService,
    EntityLeaderboardService,
    // Org logos are Asset rows; the admin organizations list resolves them in
    // one batched read per page.
    OrganizationLogoService,
  ],
})
export class AnalyticsModule {}

/**
 * Business Analytics Module
 * Superadmin-only business metrics: Stripe revenue, credit consumption,
 * and ingredient generation aggregations.
 */
import { BusinessAnalyticsController } from '@api/collections/business-analytics/controllers/business-analytics.controller';
import { BusinessAnalyticsService } from '@api/collections/business-analytics/services/business-analytics.service';
import { CommonModule } from '@api/common/common.module';
import { CacheModule } from '@api/services/cache/cache.module';
import { StripeModule } from '@api/services/integrations/stripe/stripe.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [BusinessAnalyticsController],
  exports: [BusinessAnalyticsService],
  imports: [CacheModule, CommonModule, StripeModule],
  providers: [BusinessAnalyticsService],
})
export class BusinessAnalyticsModule {}

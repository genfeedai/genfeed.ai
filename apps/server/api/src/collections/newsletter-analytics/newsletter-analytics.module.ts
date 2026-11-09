import { BrandAccessModule } from '@api/authorization/brand-access/brand-access.module';
import { NewsletterAnalyticsController } from '@api/collections/newsletter-analytics/controllers/newsletter-analytics.controller';
import { NewsletterAnalyticsService } from '@api/collections/newsletter-analytics/services/newsletter-analytics.service';
import { Module } from '@nestjs/common';

/** Newsletter results read from stored receipts and clicks (#9727). */
@Module({
  controllers: [NewsletterAnalyticsController],
  imports: [BrandAccessModule],
  providers: [NewsletterAnalyticsService],
})
export class NewsletterAnalyticsModule {}

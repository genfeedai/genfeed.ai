import { BrandAccessModule } from '@api/authorization/brand-access/brand-access.module';
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { NewsletterSendsController } from '@api/collections/newsletter-sends/controllers/newsletter-sends.controller';
import { NewsletterSettingsController } from '@api/collections/newsletter-sends/controllers/newsletter-settings.controller';
import { PublicNewsletterController } from '@api/collections/newsletter-sends/controllers/public-newsletter.controller';
import { NewsletterEmailService } from '@api/collections/newsletter-sends/services/newsletter-email.service';
import { NewsletterProviderEventsService } from '@api/collections/newsletter-sends/services/newsletter-provider-events.service';
import { NewsletterPublicService } from '@api/collections/newsletter-sends/services/newsletter-public.service';
import { NewsletterRecipientAccessService } from '@api/collections/newsletter-sends/services/newsletter-recipient-access.service';
import { NewsletterSendsService } from '@api/collections/newsletter-sends/services/newsletter-sends.service';
import { NewsletterSettingsService } from '@api/collections/newsletter-sends/services/newsletter-settings.service';
import { NewsletterUsageService } from '@api/collections/newsletter-sends/services/newsletter-usage.service';
import { NewslettersModule } from '@api/collections/newsletters/newsletters.module';
import { OrganizationPaidAccessModule } from '@api/common/subscriptions/organization-paid-access.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

/**
 * Newsletter delivery (#9726): settings, the brand email layout, the send
 * engine the workers app drives, provider receipts and public email links.
 */
@Module({
  controllers: [
    NewsletterSendsController,
    NewsletterSettingsController,
    PublicNewsletterController,
  ],
  exports: [
    NewsletterEmailService,
    NewsletterSendsService,
    NewsletterSettingsService,
    NewsletterUsageService,
  ],
  imports: [
    BrandAccessModule,
    BrandsCoreModule,
    ConfigModule,
    LoggerModule,
    NewslettersModule,
    NotificationsModule,
    OrganizationPaidAccessModule,
  ],
  providers: [
    NewsletterEmailService,
    NewsletterProviderEventsService,
    NewsletterPublicService,
    NewsletterRecipientAccessService,
    NewsletterSendsService,
    NewsletterSettingsService,
    NewsletterUsageService,
  ],
})
export class NewsletterSendsModule {}

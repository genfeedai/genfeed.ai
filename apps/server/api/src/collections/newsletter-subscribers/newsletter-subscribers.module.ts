import { BrandAccessModule } from '@api/authorization/brand-access/brand-access.module';
import { NewsletterSendsModule } from '@api/collections/newsletter-sends/newsletter-sends.module';
import { BrandSubscribersController } from '@api/collections/newsletter-subscribers/controllers/brand-subscribers.controller';
import { PublicNewsletterSubscribeController } from '@api/collections/newsletter-subscribers/controllers/public-newsletter-subscribe.controller';
import { BrandSubscribersService } from '@api/collections/newsletter-subscribers/services/brand-subscribers.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

/** A brand's newsletter audience (#9665, #9724). */
@Module({
  controllers: [
    BrandSubscribersController,
    PublicNewsletterSubscribeController,
  ],
  exports: [BrandSubscribersService],
  imports: [BrandAccessModule, LoggerModule, NewsletterSendsModule],
  providers: [BrandSubscribersService],
})
export class NewsletterSubscribersModule {}

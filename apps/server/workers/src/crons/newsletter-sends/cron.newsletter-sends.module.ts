import { NewsletterSendsModule } from '@api/collections/newsletter-sends/newsletter-sends.module';
import { Module } from '@nestjs/common';
import { CronNewsletterSendsService } from '@workers/crons/newsletter-sends/cron.newsletter-sends.service';

@Module({
  exports: [CronNewsletterSendsService],
  imports: [NewsletterSendsModule],
  providers: [CronNewsletterSendsService],
})
export class CronNewsletterSendsModule {}

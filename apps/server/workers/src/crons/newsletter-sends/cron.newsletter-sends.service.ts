import { NewsletterSendsService } from '@api/collections/newsletter-sends/services/newsletter-sends.service';
import { Injectable } from '@nestjs/common';

/** Every-minute tick of the newsletter delivery engine (#9726). */
export const NEWSLETTER_SENDS_SCHEDULE = '* * * * *';

@Injectable()
export class CronNewsletterSendsService {
  constructor(private readonly sends: NewsletterSendsService) {}

  /**
   * Claims due or stalled sends and delivers the next batches. Each send is
   * locked while a worker holds it and every recipient is idempotent, so an
   * overlapping tick or a crashed worker never double-sends.
   */
  async processDueSends(): Promise<void> {
    await this.sends.processDueSends();
  }
}

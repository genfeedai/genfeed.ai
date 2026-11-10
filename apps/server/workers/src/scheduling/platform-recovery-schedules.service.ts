import { BrandRelocationJobsService } from '@api/collections/brands/services/brand-relocation-jobs.service';
import { ContextEmbeddingSweepService } from '@api/collections/contexts/services/context-embedding-sweep.service';
import { KnowledgeConflictDetectionService } from '@api/collections/contexts/services/knowledge-conflict-detection.service';
import { Injectable } from '@nestjs/common';
import { CronMediaDeliveryRecoveryService } from '@workers/crons/media-delivery-recovery/cron.media-delivery-recovery.service';
import { CronNewsletterSendsService } from '@workers/crons/newsletter-sends/cron.newsletter-sends.service';
import { NotificationDeliveryRecoveryService } from '@workers/processors/api/queues/notification-delivery/notification-delivery-recovery.service';

@Injectable()
export class PlatformRecoverySchedulesService {
  constructor(
    private readonly notifications: NotificationDeliveryRecoveryService,
    private readonly brandRelocations: BrandRelocationJobsService,
    private readonly contextEmbeddings: ContextEmbeddingSweepService,
    private readonly mediaDelivery: CronMediaDeliveryRecoveryService,
    private readonly knowledgeConflicts: KnowledgeConflictDetectionService,
    private readonly newsletterSends: CronNewsletterSendsService,
  ) {}

  async recoverContextEmbeddings(): Promise<void> {
    await this.contextEmbeddings.sweep();
  }

  async scanKnowledgeConflicts(): Promise<void> {
    await this.knowledgeConflicts.sweep();
  }

  async recoverMediaDelivery(): Promise<void> {
    await this.mediaDelivery.recoverMedia();
  }

  /** Claims due or stalled newsletter sends and delivers their next batches. */
  async deliverDueNewsletters(): Promise<void> {
    await this.newsletterSends.processDueSends();
  }

  async recoverNotifications(): Promise<void> {
    await this.notifications.recover();
  }
  async recoverBrandRelocations(): Promise<void> {
    await this.brandRelocations.recover();
  }
}

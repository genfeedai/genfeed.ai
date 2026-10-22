import { BrandRelocationJobsService } from '@api/collections/brands/services/brand-relocation-jobs.service';
import { ContextEmbeddingSweepService } from '@api/collections/contexts/services/context-embedding-sweep.service';
import { Injectable } from '@nestjs/common';
import { NotificationDeliveryRecoveryService } from '@workers/processors/api/queues/notification-delivery/notification-delivery-recovery.service';

@Injectable()
export class PlatformRecoverySchedulesService {
  constructor(
    private readonly notifications: NotificationDeliveryRecoveryService,
    private readonly brandRelocations: BrandRelocationJobsService,
    private readonly contextEmbeddings: ContextEmbeddingSweepService,
  ) {}

  async recoverContextEmbeddings(): Promise<void> {
    await this.contextEmbeddings.sweep();
  }

  async recoverNotifications(): Promise<void> {
    await this.notifications.recover();
  }
  async recoverBrandRelocations(): Promise<void> {
    await this.brandRelocations.recover();
  }
}

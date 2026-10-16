import { BrandRelocationJobsService } from '@api/collections/brands/services/brand-relocation-jobs.service';
import { Injectable } from '@nestjs/common';
import { NotificationDeliveryRecoveryService } from '@workers/processors/api/queues/notification-delivery/notification-delivery-recovery.service';

@Injectable()
export class PlatformRecoverySchedulesService {
  constructor(
    private readonly notifications: NotificationDeliveryRecoveryService,
    private readonly brandRelocations: BrandRelocationJobsService,
  ) {}

  async recoverNotifications(): Promise<void> {
    await this.notifications.recover();
  }
  async recoverBrandRelocations(): Promise<void> {
    await this.brandRelocations.recover();
  }
}

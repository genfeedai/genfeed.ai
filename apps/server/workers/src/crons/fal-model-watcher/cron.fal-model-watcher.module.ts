import { ModelsModule } from '@api/collections/models/models.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@workers/config/config.module';
import { CronFalModelWatcherService } from '@workers/crons/fal-model-watcher/cron.fal-model-watcher.service';
import { FalPlatformClient } from '@workers/crons/fal-model-watcher/fal-platform.client';
import { FalModelContractSyncService } from '@workers/services/fal-model-contract-sync.service';
import { ModelDiscoveryService } from '@workers/services/model-discovery.service';
import { ModelPricingService } from '@workers/services/model-pricing.service';

@Module({
  exports: [CronFalModelWatcherService],
  imports: [forwardRef(() => ModelsModule), NotificationsModule, ConfigModule],
  providers: [
    CronFalModelWatcherService,
    FalModelContractSyncService,
    FalPlatformClient,
    ModelDiscoveryService,
    ModelPricingService,
  ],
})
export class CronFalModelWatcherModule {}

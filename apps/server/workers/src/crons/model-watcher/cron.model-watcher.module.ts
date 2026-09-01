import { ModelsModule } from '@api/collections/models/models.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@workers/config/config.module';
import { CronModelWatcherService } from '@workers/crons/model-watcher/cron.model-watcher.service';
import { ModelDiscoveryService } from '@workers/services/model-discovery.service';
import { ModelPricingService } from '@workers/services/model-pricing.service';
import { PlatformMarginService } from '@workers/services/platform-margin.service';
import { ReplicateModelContractSyncService } from '@workers/services/replicate-model-contract-sync.service';

@Module({
  imports: [forwardRef(() => ModelsModule), NotificationsModule, ConfigModule],
  providers: [
    CronModelWatcherService,
    ModelDiscoveryService,
    ModelPricingService,
    PlatformMarginService,
    ReplicateModelContractSyncService,
  ],
})
export class CronModelWatcherModule {}

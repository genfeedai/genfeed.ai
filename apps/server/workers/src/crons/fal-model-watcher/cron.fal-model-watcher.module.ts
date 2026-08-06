import { ModelsModule } from '@api/collections/models/models.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@workers/config/config.module';
import { CronFalModelWatcherService } from '@workers/crons/fal-model-watcher/cron.fal-model-watcher.service';
import { ModelDiscoveryService } from '@workers/services/model-discovery.service';
import { ModelPricingService } from '@workers/services/model-pricing.service';

@Module({
  imports: [forwardRef(() => ModelsModule), ConfigModule, NotificationsModule],
  providers: [
    CronFalModelWatcherService,
    ModelDiscoveryService,
    ModelPricingService,
  ],
})
export class CronFalModelWatcherModule {}

import { ModelsModule } from '@api/collections/models/models.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@workers/config/config.module';
import { CronModelWatcherService } from '@workers/crons/model-watcher/cron.model-watcher.service';
import { FalDiscoveryService } from '@workers/services/fal-discovery.service';
import { HuggingFaceDiscoveryService } from '@workers/services/hugging-face-discovery.service';
import { ModelDiscoveryService } from '@workers/services/model-discovery.service';
import { ModelPricingService } from '@workers/services/model-pricing.service';

@Module({
  imports: [forwardRef(() => ModelsModule), ConfigModule, NotificationsModule],
  providers: [
    CronModelWatcherService,
    FalDiscoveryService,
    HuggingFaceDiscoveryService,
    ModelDiscoveryService,
    ModelPricingService,
  ],
})
export class CronModelWatcherModule {}

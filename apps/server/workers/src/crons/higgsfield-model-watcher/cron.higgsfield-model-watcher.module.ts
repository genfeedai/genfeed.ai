import { ModelsModule } from '@api/collections/models/models.module';
import { PlatformSettingsModule } from '@api/collections/platform-settings/platform-settings.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { TypedDecisionsModule } from '@api/services/typed-decisions/typed-decisions.module';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@workers/config/config.module';
import { CronHiggsfieldModelWatcherService } from '@workers/crons/higgsfield-model-watcher/cron.higgsfield-model-watcher.service';
import { HiggsfieldDocsCatalogClient } from '@workers/crons/higgsfield-model-watcher/higgsfield-docs-catalog.client';
import { ModelDiscoveryService } from '@workers/services/model-discovery.service';

@Module({
  exports: [CronHiggsfieldModelWatcherService],
  imports: [
    forwardRef(() => ModelsModule),
    NotificationsModule,
    ConfigModule,
    PlatformSettingsModule,
    TypedDecisionsModule,
  ],
  providers: [
    CronHiggsfieldModelWatcherService,
    HiggsfieldDocsCatalogClient,
    ModelDiscoveryService,
  ],
})
export class CronHiggsfieldModelWatcherModule {}

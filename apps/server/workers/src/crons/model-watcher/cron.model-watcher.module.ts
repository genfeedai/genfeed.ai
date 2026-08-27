import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@workers/config/config.module';
import { CronModelWatcherService } from '@workers/crons/model-watcher/cron.model-watcher.service';
import { ModelDiscoveryService } from '@workers/services/model-discovery.service';
import { ModelPricingService } from '@workers/services/model-pricing.service';
import { PlatformMarginService } from '@workers/services/platform-margin.service';
import { WorkersDomainModule } from '@server/workers-domain.module';

@Module({
  imports: [WorkersDomainModule, ConfigModule],
  providers: [
    CronModelWatcherService,
    ModelDiscoveryService,
    ModelPricingService,
    PlatformMarginService,
  ],
})
export class CronModelWatcherModule {}

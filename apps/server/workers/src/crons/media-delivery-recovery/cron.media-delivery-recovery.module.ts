import { MediaUrlsModule } from '@api/services/media-urls/media-urls.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';
import { CronMediaDeliveryRecoveryService } from '@workers/crons/media-delivery-recovery/cron.media-delivery-recovery.service';

@Module({
  exports: [CronMediaDeliveryRecoveryService],
  imports: [LoggerModule, MediaUrlsModule],
  providers: [CronMediaDeliveryRecoveryService],
})
export class CronMediaDeliveryRecoveryModule {}

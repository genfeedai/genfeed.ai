import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { MediaPerceptionService } from '@api/services/media-perception/media-perception.service';
import { MediaPerceptionDescriberService } from '@api/services/media-perception/media-perception-describer.service';
import { MediaPerceptionQueueService } from '@api/services/media-perception/media-perception-queue.service';
import { MediaVendorCostModule } from '@api/services/media-vendor-cost/media-vendor-cost.module';
import { WhisperModule } from '@api/services/whisper/whisper.module';
import { MEDIA_PERCEPTION_QUEUE } from '@genfeedai/contracts/queue';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

/**
 * Media perception (#4879): frames, OCR, transcript and scene description per
 * asset. Imported by the api (read path) and by the workers runtime, which
 * owns the queue consumer and the sweep that feeds it.
 */
@Module({
  exports: [MediaPerceptionService, MediaPerceptionQueueService],
  imports: [
    BullModule.registerQueue({ name: MEDIA_PERCEPTION_QUEUE }),
    ConfigModule,
    FilesClientModule,
    LlmDispatcherModule,
    LoggerModule,
    MediaVendorCostModule,
    WhisperModule,
  ],
  providers: [
    MediaPerceptionDescriberService,
    MediaPerceptionQueueService,
    MediaPerceptionService,
  ],
})
export class MediaPerceptionModule {}

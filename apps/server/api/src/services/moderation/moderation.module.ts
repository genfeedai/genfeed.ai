import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { MediaPerceptionModule } from '@api/services/media-perception/media-perception.module';
import { MediaModerationService } from '@api/services/moderation/media-moderation.service';
import { MediaModerationQueueService } from '@api/services/moderation/media-moderation-queue.service';
import { MODERATION_PROVIDER } from '@api/services/moderation/moderation.tokens';
import { createModerationProvider } from '@api/services/moderation/moderation-provider.factory';
import { MEDIA_MODERATION_QUEUE } from '@genfeedai/contracts/queue';
import { ConfigModule } from '@libs/config/config.module';
import { ConfigService } from '@libs/config/config.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

/**
 * Moderation classifier (#4880) behind a provider adapter. Imported by the
 * api (read path) and the workers runtime (queue consumer and sweep).
 */
@Module({
  exports: [MediaModerationQueueService, MediaModerationService],
  imports: [
    ActivitiesModule,
    BullModule.registerQueue({ name: MEDIA_MODERATION_QUEUE }),
    ConfigModule,
    LoggerModule,
    MediaPerceptionModule,
  ],
  providers: [
    {
      inject: [ConfigService, LoggerService],
      provide: MODERATION_PROVIDER,
      useFactory: createModerationProvider,
    },
    MediaModerationQueueService,
    MediaModerationService,
  ],
})
export class ModerationModule {}

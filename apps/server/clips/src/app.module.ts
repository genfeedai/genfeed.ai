import { ConfigModule } from '@clips/config/config.module';
import { ConfigService } from '@clips/config/config.service';
import { ClipperController } from '@clips/controllers/clipper.controller';
import { HealthController } from '@clips/controllers/health.controller';
import { ClipperProcessor } from '@clips/queues/clipper.processor';
import { CLIPPER_QUEUE_NAME } from '@clips/queues/clipper-queue.constants';
import { ClipperQueueService } from '@clips/queues/clipper-queue.service';
import { ClipExtractorService } from '@clips/services/clip-extractor.service';
import { ClipperPipelineService } from '@clips/services/clipper-pipeline.service';
import { HighlightDetectorService } from '@clips/services/highlight-detector.service';
import { TranscriptionService } from '@clips/services/transcription.service';
import { EventsModule } from '@libs/events/events.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { RedisModule } from '@libs/redis/redis.module';
import {
  buildBullMQConnection,
  parseRedisConnection,
} from '@libs/redis/redis-connection.utils';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

@Module({
  controllers: [HealthController, ClipperController],
  imports: [
    ConfigModule,
    HttpModule,
    LoggerModule,
    RedisModule.forRoot({
      configModule: ConfigModule,
      configService: ConfigService,
    }),
    EventsModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const config = parseRedisConnection(configService);
        return { connection: buildBullMQConnection(config) };
      },
    }),
    BullModule.registerQueue({
      defaultJobOptions: {
        attempts: 3,
        backoff: { delay: 30000, type: 'exponential' },
        removeOnComplete: 50,
        removeOnFail: 25,
      },
      name: CLIPPER_QUEUE_NAME,
    }),
  ],
  providers: [
    ClipperPipelineService,
    TranscriptionService,
    HighlightDetectorService,
    ClipExtractorService,
    ClipperQueueService,
    ClipperProcessor,
  ],
})
export class AppModule {}

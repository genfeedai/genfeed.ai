import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { RedisModule } from '@libs/redis/redis.module';
import { EventsModule } from '@libs/events/events.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { ConfigModule } from '@clips/config/config.module';
import { ConfigService } from '@clips/config/config.service';
import { HealthController } from '@clips/controllers/health.controller';
import { ClipperController } from '@clips/controllers/clipper.controller';
import { ClipperPipelineService } from '@clips/services/clipper-pipeline.service';
import { TranscriptionService } from '@clips/services/transcription.service';
import { HighlightDetectorService } from '@clips/services/highlight-detector.service';
import { ClipExtractorService } from '@clips/services/clip-extractor.service';
import { ClipperQueueService } from '@clips/queues/clipper-queue.service';
import { ClipperProcessor } from '@clips/queues/clipper.processor';
import { CLIPPER_QUEUE_NAME } from '@clips/queues/clipper-queue.constants';

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
        const redisUrl = configService.get('REDIS_URL');
        let host = 'localhost';
        let port = 6379;
        let password: string | undefined;

        try {
          const parsed = new URL(redisUrl || 'redis://localhost:6379');
          host = parsed.hostname || host;
          port = parsed.port ? Number(parsed.port) : port;
          password = parsed.password || configService.get('REDIS_PASSWORD');
        } catch {
          const withoutScheme =
            redisUrl?.replace(/^.*:\/\//, '') || 'localhost:6379';
          const [parsedHost, parsedPort] = withoutScheme.split(':');
          host = parsedHost || host;
          port = parsedPort ? Number(parsedPort) : port;
          password = configService.get('REDIS_PASSWORD');
        }

        return {
          connection: {
            host,
            port,
            ...(password && { password }),
            connectTimeout: 3000,
            enableOfflineQueue: false,
            enableReadyCheck: false,
            lazyConnect: true,
            maxRetriesPerRequest: 0,
            retryStrategy: () => null,
          },
        };
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

/**
 * Workers Queues Module
 * Lightweight BullMQ setup using workers' ConfigService (not API's).
 * Only registers queues needed by worker crons — no API-specific queue services.
 */

import { QueueService } from '@api/queues/core/queue.service';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@workers/config/config.module';
import { ConfigService } from '@workers/config/config.service';

@Module({
  exports: [QueueService],
  imports: [
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
    BullModule.registerQueue(
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 2000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'default',
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'analytics-twitter',
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 2000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'analytics-youtube',
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 2000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'analytics-social',
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'ad-sync-meta',
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'ad-sync-google',
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'ad-sync-tiktok',
      },
      {
        defaultJobOptions: {
          attempts: 2,
          backoff: { delay: 10000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'ad-insights-aggregation',
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'analytics-sync',
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 2000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'email-digest',
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'ad-bulk-upload',
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'ad-optimization',
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'telegram-distribute',
      },
      {
        defaultJobOptions: {
          attempts: 2,
          backoff: { delay: 10000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'pattern-extraction',
      },
    ),
  ],
  providers: [QueueService],
})
export class WorkersQueuesModule {}

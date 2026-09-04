/**
 * Workers Queues Module
 *
 * Registers all BullMQ queues consumed by workers (both cron-triggered
 * and processor-consumed). Queue job options mirror the API-side
 * registrations to ensure consistent retry/backoff behaviour.
 */

import { SERVER_TOKENS } from '@api/index';
import { QueueService } from '@api/queues/core/queue.service';
import { HeygenPollQueueService } from '@api/queues/heygen-poll/heygen-poll-queue.service';
import { ReplicatePollQueueService } from '@api/queues/replicate-poll/replicate-poll-queue.service';
import {
  CREDIT_DEDUCTION_QUEUE,
  DEFAULT_QUEUE,
  HEYGEN_POLL_QUEUE,
  NOTIFICATION_DELIVERY_QUEUE,
  REPLICATE_POLL_QUEUE,
  WEBHOOK_CLIENT_QUEUE,
  WORKFLOW_EXECUTION_QUEUE,
} from '@genfeedai/contracts/queue';
import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import {
  buildBullMQConnection,
  parseRedisConnectionForWorkload,
  RedisWorkload,
  resolveBullMQWorkerConnectionProfile,
} from '@libs/redis/redis-connection.utils';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@workers/config/config.module';
import { ConfigService } from '@workers/config/config.service';

@Module({
  exports: [QueueService, HeygenPollQueueService, ReplicatePollQueueService],
  imports: [
    LoggerModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const config = parseRedisConnectionForWorkload(
          configService,
          RedisWorkload.QUEUE,
        );
        const profile = resolveBullMQWorkerConnectionProfile(configService);
        return { connection: buildBullMQConnection(config, profile) };
      },
    }),
    BullModule.registerQueue(
      // ---------- Existing queues (crons + processors) ----------
      {
        defaultJobOptions: {
          removeOnComplete: 500,
          removeOnFail: 200,
        },
        name: NOTIFICATION_DELIVERY_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 2000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: DEFAULT_QUEUE,
      },
      // ---------- Newly registered queues (moved from API) ----------
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: WORKFLOW_EXECUTION_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 2000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 200,
        },
        name: CREDIT_DEDUCTION_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 5,
          backoff: { delay: 3000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 200,
        },
        name: WEBHOOK_CLIENT_QUEUE,
      },
      // Note: collections/workflows WorkflowExecutionProcessor also listens on
      // 'workflow-execution' — both processors share the same queue (registered above).
      {
        defaultJobOptions: {
          attempts: 2,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: HEYGEN_POLL_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 2,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: REPLICATE_POLL_QUEUE,
      },
    ),
  ],
  providers: [
    QueueService,
    HeygenPollQueueService,
    ReplicatePollQueueService,
    // Schedule 24h reply post-watch series after successful X publish.
    {
      provide: SERVER_TOKENS.logger,
      useExisting: LoggerService,
    },
  ],
})
export class WorkersQueuesModule {}

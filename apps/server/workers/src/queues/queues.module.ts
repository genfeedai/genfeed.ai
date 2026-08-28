/**
 * Workers Queues Module
 *
 * Registers all BullMQ queues consumed by workers (both cron-triggered
 * and processor-consumed). Queue job options mirror the API-side
 * registrations to ensure consistent retry/backoff behaviour.
 */

import {
  AGENT_RUN_QUEUE,
  BATCH_WORKFLOW_QUEUE,
  CREDIT_DEDUCTION_QUEUE,
  DEFAULT_QUEUE,
  HEYGEN_POLL_QUEUE,
  NOTIFICATION_DELIVERY_QUEUE,
  WEBHOOK_CLIENT_QUEUE,
  WORKFLOW_EXECUTION_QUEUE,
} from '@genfeedai/queue-contracts';
import { SERVER_TOKENS } from '@genfeedai/server';
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
import { AgentRunQueueService } from '@server/queues/agent-run/agent-run-queue.service';
import { QueueService } from '@server/queues/core/queue.service';
import { HeygenPollQueueService } from '@server/queues/heygen-poll/heygen-poll-queue.service';
import { ConfigModule } from '@workers/config/config.module';
import { ConfigService } from '@workers/config/config.service';

@Module({
  exports: [AgentRunQueueService, QueueService, HeygenPollQueueService],
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
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: AGENT_RUN_QUEUE,
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
          removeOnComplete: 200,
          removeOnFail: 100,
        },
        name: BATCH_WORKFLOW_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 2,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: HEYGEN_POLL_QUEUE,
      },
    ),
  ],
  providers: [
    AgentRunQueueService,
    QueueService,
    HeygenPollQueueService,
    // Schedule 24h reply post-watch series after successful X publish.
    {
      provide: SERVER_TOKENS.logger,
      useExisting: LoggerService,
    },
  ],
})
export class WorkersQueuesModule {}

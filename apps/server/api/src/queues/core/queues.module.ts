/**
 * Queues Module
 *
 * BullMQ queue registration and queue service providers for the API process.
 * Processor classes have been moved to the Workers service (issue #84) --
 * this module only registers queues and queue services so the API can
 * enqueue jobs without consuming them.
 */

import { ScheduledPostWorkflowQueueService } from '@api/collections/posts/services/scheduled-post-workflow-queue.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { SERVER_TOKENS } from '@api/index';
import { QueueService } from '@api/queues/core/queue.service';
import { QueueDiagnosticsController } from '@api/queues/core/queue-diagnostics.controller';
import { HeygenPollQueueService } from '@api/queues/heygen-poll/heygen-poll-queue.service';
import { WorkspaceTaskWorkflowQueueService } from '@api/services/task-orchestration/workspace-task-workflow-queue.service';
import {
  DEFAULT_QUEUE,
  HEYGEN_POLL_QUEUE,
  WORKFLOW_EXECUTION_QUEUE,
} from '@genfeedai/queue-contracts';
import { ConfigModule } from '@libs/config/config.module';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  buildBullMQConnection,
  parseRedisConnectionForWorkload,
  RedisWorkload,
} from '@libs/redis/redis-connection.utils';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

@Module({
  exports: [
    HeygenPollQueueService,
    ScheduledPostWorkflowQueueService,
    QueueService,
    WorkspaceTaskWorkflowQueueService,
    WorkflowExecutionQueueService,
  ],
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const config = parseRedisConnectionForWorkload(
          configService,
          RedisWorkload.QUEUE,
        );
        return { connection: buildBullMQConnection(config) };
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
        name: DEFAULT_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 1,
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: WORKFLOW_EXECUTION_QUEUE,
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
  controllers: [QueueDiagnosticsController],
  providers: [
    QueueService,
    WorkspaceTaskWorkflowQueueService,
    HeygenPollQueueService,
    ScheduledPostWorkflowQueueService,
    WorkflowExecutionQueueService,
    {
      provide: SERVER_TOKENS.logger,
      useExisting: LoggerService,
    },
  ],
})
export class QueuesModule {}

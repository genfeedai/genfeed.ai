/**
 * Queues Module
 *
 * BullMQ queue registration and queue service providers for the API process.
 * Processor classes have been moved to the Workers service (issue #84) --
 * this module only registers queues and queue services so the API can
 * enqueue jobs without consuming them.
 */

import { QueueDiagnosticsController } from '@api/queues/core/queue-diagnostics.controller';
import {
  AGENT_RUN_QUEUE,
  DEFAULT_QUEUE,
  HEYGEN_POLL_QUEUE,
  WORKFLOW_EXECUTION_QUEUE,
  WORKSPACE_TASK_QUEUE,
} from '@genfeedai/queue-contracts';
import { SERVER_TOKENS } from '@genfeedai/server';
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
import { ScheduledPostWorkflowQueueService } from '@server/collections/posts/services/scheduled-post-workflow-queue.service';
import { WorkflowExecutionQueueService } from '@server/collections/workflows/services/workflow-execution-queue.service';
import { AgentRunQueueService } from '@server/queues/agent-run/agent-run-queue.service';
import { QueueService } from '@server/queues/core/queue.service';
import { HeygenPollQueueService } from '@server/queues/heygen-poll/heygen-poll-queue.service';
import { WorkspaceTaskQueueService } from '@server/services/task-orchestration/workspace-task-queue.service';

@Module({
  exports: [
    AgentRunQueueService,
    HeygenPollQueueService,
    ScheduledPostWorkflowQueueService,
    QueueService,
    WorkspaceTaskQueueService,
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
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: AGENT_RUN_QUEUE,
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
        name: WORKSPACE_TASK_QUEUE,
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
    AgentRunQueueService,
    WorkspaceTaskQueueService,
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

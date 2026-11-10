import { PLATFORM_SCHEDULE_QUEUE } from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@workers/config/config.service';
import { PlatformAccountTaskHandlers } from '@workers/scheduling/platform-account-task-handlers.service';
import { PlatformMediaTaskHandlers } from '@workers/scheduling/platform-media-task-handlers.service';
import { PlatformPublishingTaskHandlers } from '@workers/scheduling/platform-publishing-task-handlers.service';
import { PlatformRecoverySchedulesService } from '@workers/scheduling/platform-recovery-schedules.service';
import {
  isPlatformScheduledTaskName,
  PLATFORM_SCHEDULED_TASKS,
  type PlatformScheduledTaskName,
  type PlatformTaskHandler,
} from '@workers/scheduling/platform-schedules.constants';
import { PlatformWorkflowSchedulesService } from '@workers/scheduling/platform-workflow-schedules.service';
import type { Job } from 'bullmq';

@Injectable()
@Processor(PLATFORM_SCHEDULE_QUEUE)
export class PlatformSchedulesProcessor extends WorkerHost {
  private readonly context = PlatformSchedulesProcessor.name;
  private readonly handlers: Record<
    PlatformScheduledTaskName,
    PlatformTaskHandler
  >;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly recovery: PlatformRecoverySchedulesService,
    private readonly workflowSchedules: PlatformWorkflowSchedulesService,
    mediaTasks: PlatformMediaTaskHandlers,
    publishingTasks: PlatformPublishingTaskHandlers,
    accountTasks: PlatformAccountTaskHandlers,
  ) {
    super();
    // Each group owns its tasks, and the spread must cover every task name.
    this.handlers = {
      ...mediaTasks.createHandlers(),
      ...publishingTasks.createHandlers(),
      ...accountTasks.createHandlers(),
      ...this.createRecoveryHandlers(),
    };
  }

  private createRecoveryHandlers() {
    return {
      [PLATFORM_SCHEDULED_TASKS.CONTEXT_EMBEDDING_SWEEP]: () =>
        this.recovery.recoverContextEmbeddings(),
      [PLATFORM_SCHEDULED_TASKS.KNOWLEDGE_CONFLICT_SWEEP]: () =>
        this.recovery.scanKnowledgeConflicts(),
      [PLATFORM_SCHEDULED_TASKS.BRAND_RELOCATION_RECOVERY]: () =>
        this.recovery.recoverBrandRelocations(),
      [PLATFORM_SCHEDULED_TASKS.PROACTIVE_AGENT_STRATEGIES]: (job) =>
        this.workflowSchedules.sweep(
          'proactive-agent-strategies',
          job.timestamp,
        ),
      [PLATFORM_SCHEDULED_TASKS.CONTENT_LEARNING_RECONCILE]: (job) =>
        this.workflowSchedules.sweep(
          'content-learning.reconcile',
          job.timestamp,
        ),
      [PLATFORM_SCHEDULED_TASKS.CONTENT_LEARNING_RETENTION]: (job) =>
        this.workflowSchedules.sweep(
          'content-learning.retention',
          job.timestamp,
        ),
      [PLATFORM_SCHEDULED_TASKS.ANALYTICS_SYNC]: (job) =>
        this.workflowSchedules.sweep('analytics-sync', job.timestamp),
      [PLATFORM_SCHEDULED_TASKS.CONTENT_LOOP_AUTOPILOT]: (job) =>
        this.workflowSchedules.sweep('content-loop-autopilot', job.timestamp),
      [PLATFORM_SCHEDULED_TASKS.MEDIA_DELIVERY_RECOVERY]: () =>
        this.recovery.recoverMediaDelivery(),
      [PLATFORM_SCHEDULED_TASKS.NEWSLETTER_SENDS]: () =>
        this.recovery.deliverDueNewsletters(),
      [PLATFORM_SCHEDULED_TASKS.NOTIFICATION_DELIVERY_RECOVERY]: () =>
        this.recovery.recoverNotifications(),
      [PLATFORM_SCHEDULED_TASKS.PENDING_WORKFLOW_EXECUTION_RECONCILE]: () =>
        this.workflowSchedules.reconcilePendingExecutions(),
      [PLATFORM_SCHEDULED_TASKS.WORKFLOW_CONTINUATION_RECONCILE]: () =>
        this.workflowSchedules.reconcileContinuations(),
      [PLATFORM_SCHEDULED_TASKS.WORKSPACE_TASK_ROLLUP_RECOVERY]: () =>
        this.workflowSchedules.recoverWorkspaceTaskRollups(),
      [PLATFORM_SCHEDULED_TASKS.AGENT_TRANSFER_RECOVERY]: () =>
        this.workflowSchedules.recoverAgentTransfers(),
    } satisfies Partial<Record<PlatformScheduledTaskName, PlatformTaskHandler>>;
  }

  async process(job: Job): Promise<void> {
    if (!this.configService.isDevSchedulersEnabled) {
      this.logger.debug(
        `Skipping platform schedule ${job.name}: schedulers disabled for local development`,
        this.context,
      );
      return;
    }

    if (!isPlatformScheduledTaskName(job.name)) {
      // Workers of two versions share the queue during a rollout, and a newer
      // process registers its schedulers before older workers drain. Skip the
      // tick here instead of failing it: the next tick reaches a worker that
      // knows the task, and a name no version knows is still reported.
      this.logger.warn(
        `Skipping platform schedule ${job.name}: this worker version does not know the task`,
        this.context,
      );
      return;
    }

    await this.handlers[job.name](job);
  }
}

import type { WorkflowDocument } from '@api/collections/workflows/schemas/workflow.schema';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import {
  EXECUTABLE_WORKFLOW_SELECT,
  WorkflowExecutorService,
} from '@api/collections/workflows/services/workflow-executor.service';
import {
  computeNextRunAtOrThrow,
  isSchedulableTimezone,
} from '@api/collections/workflows/utils/cron-schedule.util';
import { hydrateWorkflowDefinition } from '@api/collections/workflows/workflow-version-definition';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowExecutionTrigger, WorkflowStatus } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Inject,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';

function toWorkflowDocument(workflow: unknown): WorkflowDocument {
  return hydrateWorkflowDefinition(workflow as Record<string, unknown>);
}

type SchedulableWorkflow = Pick<
  WorkflowDocument,
  'id' | 'isScheduleEnabled' | 'schedule' | 'timezone'
>;

/**
 * Owns the producer side of workflow cron scheduling.
 *
 * Schedules live as BullMQ Job Schedulers on the `workflow-execution` queue
 * (one scheduler per workflow, keyed on the workflow id). Upserts are
 * idempotent across API replicas, so exactly one delayed fire exists per tick
 * regardless of replica count — no in-process CronJobs, no fire-window locks.
 *
 * Workers consume the resulting `scheduled-fire` jobs and call back into
 * `executeScheduledWorkflow` to run the workflow.
 */
@Injectable()
export class WorkflowSchedulerService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LoggerService)
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly workflowExecutorService: WorkflowExecutorService,
    private readonly workflowExecutionQueueService: WorkflowExecutionQueueService,
  ) {}

  async onModuleInit() {
    if (!this.configService.isDevSchedulersEnabled) {
      this.logger.log(
        'Workflow schedulers disabled for local development',
        'WorkflowSchedulerService',
      );

      return;
    }

    // One-time boot sync: upsert a job scheduler for every enabled scheduled
    // workflow. Idempotent per scheduler id, so any number of replicas booting
    // concurrently converge on one scheduler per workflow. This seeds rows
    // created before the BullMQ migration and heals drift after restarts.
    await this.syncAllWorkflowSchedulers();
  }

  /**
   * Upsert job schedulers for all enabled scheduled workflows.
   */
  async syncAllWorkflowSchedulers(): Promise<void> {
    try {
      const workflows = await this.prisma.workflow.findMany({
        select: {
          id: true,
          isScheduleEnabled: true,
          schedule: true,
          timezone: true,
        },
        where: {
          isDeleted: false,
          isScheduleEnabled: true,
          schedule: { not: null },
          // Canonical workflow status is the lowercase enum value ('active');
          // the column is a drifted String (see schema). Must match what
          // createWorkflow / the executor persist, or scheduled rows never load.
          status: WorkflowStatus.ACTIVE,
        },
      });

      this.logger.log(
        `Syncing ${workflows.length} workflow job schedulers`,
        'WorkflowSchedulerService',
      );

      for (const workflow of workflows) {
        await this.scheduleWorkflow(workflow as SchedulableWorkflow);
      }
    } catch (error) {
      this.logger.error(
        'Failed to sync workflow job schedulers',
        error,
        'WorkflowSchedulerService',
      );
    }
  }

  /**
   * Upsert the BullMQ job scheduler for a workflow's cron schedule.
   */
  async scheduleWorkflow(workflow: SchedulableWorkflow): Promise<void> {
    const workflowId = String(
      (workflow as unknown as Record<string, unknown>).id ??
        (workflow as unknown as { id: string }).id,
    );

    if (!workflow.schedule || !workflow.isScheduleEnabled) {
      await this.unscheduleWorkflow(workflowId);
      return;
    }

    try {
      await this.workflowExecutionQueueService.upsertWorkflowScheduler({
        cronExpression: workflow.schedule,
        timezone: workflow.timezone || 'UTC',
        workflowId,
      });

      this.logger.log(
        `Scheduled workflow ${workflowId} with cron: ${workflow.schedule}`,
        'WorkflowSchedulerService',
      );
    } catch (error) {
      this.logger.error(
        `Failed to schedule workflow ${workflowId}`,
        error,
        'WorkflowSchedulerService',
      );
    }
  }

  /**
   * Remove the BullMQ job scheduler for a workflow. Idempotent.
   */
  async unscheduleWorkflow(workflowId: string): Promise<void> {
    try {
      await this.workflowExecutionQueueService.removeWorkflowScheduler(
        workflowId,
      );

      this.logger.log(
        `Unscheduled workflow ${workflowId}`,
        'WorkflowSchedulerService',
      );
    } catch (error) {
      this.logger.error(
        `Failed to unschedule workflow ${workflowId}`,
        error,
        'WorkflowSchedulerService',
      );
    }
  }

  /**
   * Execute a scheduled workflow. Called by the workers' `scheduled-fire`
   * processor — BullMQ already guarantees a single fire per tick, so no
   * cross-replica locking is needed here.
   */
  async executeScheduledWorkflow(workflowId: string): Promise<void> {
    try {
      const workflow = await this.prisma.workflow.findFirst({
        select: EXECUTABLE_WORKFLOW_SELECT,
        where: {
          id: workflowId,
          isDeleted: false,
          isScheduleEnabled: true,
          // Canonical workflow status is the lowercase enum value ('active');
          // the column is a drifted String (see schema). Must match what
          // createWorkflow / the executor persist, or scheduled rows never load.
          status: WorkflowStatus.ACTIVE,
        },
      });

      if (!workflow) {
        this.logger.warn(
          `Scheduled workflow ${workflowId} not found or inactive`,
          'WorkflowSchedulerService',
        );
        await this.unscheduleWorkflow(workflowId);
        return;
      }

      const wUserId = workflow.userId;
      const wOrgId = workflow.organizationId;

      // Skip execution for systemic workflows (templates without user/org)
      if (!wUserId || !wOrgId) {
        this.logger.warn(
          `Scheduled workflow ${workflowId} is a systemic template and cannot be executed directly`,
          'WorkflowSchedulerService',
        );
        await this.unscheduleWorkflow(workflowId);
        return;
      }

      const workflowDocument = toWorkflowDocument(workflow);
      const defaultInputValues = this.getDefaultInputValues(workflowDocument);
      const missingRequiredInputs = this.getMissingRequiredInputKeys(
        workflowDocument,
        defaultInputValues,
      );

      if (missingRequiredInputs.length > 0) {
        await this.prisma.workflow.update({
          data: { isScheduleEnabled: false },
          where: scopedWhere(wOrgId, { id: workflowId }),
        });
        await this.unscheduleWorkflow(workflowId);

        this.logger.warn(
          `Scheduled workflow ${workflowId} disabled because required input defaults are missing: ${missingRequiredInputs.join(', ')}`,
          'WorkflowSchedulerService',
        );
        return;
      }

      // Update workflow last executed timestamp
      await this.prisma.workflow.update({
        data: {
          executionCount: { increment: 1 },
          lastExecutedAt: new Date(),
        },
        where: scopedWhere(wOrgId, { id: workflowId }),
      });

      const executePromise =
        this.workflowExecutorService.executeManualWorkflowDocument(
          workflowDocument,
          wUserId,
          wOrgId,
          defaultInputValues,
          { triggeredBy: 'schedule' },
          WorkflowExecutionTrigger.SCHEDULED,
        );

      executePromise.catch((error) => {
        this.logger.error(
          `Scheduled execution failed for workflow ${workflowId}`,
          error,
          'WorkflowSchedulerService',
        );
      });

      this.logger.log(
        `Started scheduled execution for workflow ${workflowId}`,
        'WorkflowSchedulerService',
      );
    } catch (error) {
      this.logger.error(
        `Failed to execute scheduled workflow ${workflowId}`,
        error,
        'WorkflowSchedulerService',
      );
    }
  }

  private isMissingInputValue(value: unknown): boolean {
    return (
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim().length === 0)
    );
  }

  /**
   * Get default input values for a workflow
   */
  private getDefaultInputValues(
    workflow: WorkflowDocument,
  ): Record<string, unknown> {
    const defaults: Record<string, unknown> = {};

    if (workflow.inputVariables) {
      for (const variable of workflow.inputVariables) {
        if (variable.defaultValue !== undefined) {
          defaults[variable.key] = variable.defaultValue;
        }
      }
    }

    return defaults;
  }

  private getMissingRequiredInputKeys(
    workflow: WorkflowDocument,
    inputValues: Record<string, unknown>,
  ): string[] {
    return (workflow.inputVariables ?? [])
      .filter((variable) => {
        if (!variable.required) {
          return false;
        }

        return this.isMissingInputValue(inputValues[variable.key]);
      })
      .map((variable) => variable.key);
  }

  /**
   * Update workflow schedule.
   *
   * The single shared schedule-mutation contract (UI PATCH, agent tool, MCP,
   * brand publishing defaults all converge here): the cadence and timezone are
   * validated before persistence and scheduler registration failures surface
   * to the caller instead of logging silently.
   */
  async updateSchedule(
    workflowId: string,
    schedule: string | null,
    timezone: string = 'UTC',
    isEnabled: boolean = true,
  ): Promise<WorkflowDocument | null> {
    const existing = await this.prisma.workflow.findFirst({
      select: { id: true },
      where: { id: workflowId, isDeleted: false },
    });

    if (!existing) {
      return null;
    }

    if (schedule) {
      // The timezone is half of the schedule: an unknown IANA zone would only
      // explode later inside the scheduler, so reject it up front with the
      // field the user actually got wrong.
      if (!isSchedulableTimezone(timezone)) {
        throw new BadRequestException(
          `Invalid timezone "${timezone}". Use an IANA timezone name, for example "Europe/Berlin".`,
        );
      }

      try {
        computeNextRunAtOrThrow(schedule, timezone);
      } catch {
        throw new BadRequestException(
          `Invalid cron expression "${schedule}". Use a valid cron schedule, for example "0 9 * * 1-5" for weekdays at 9:00 AM.`,
        );
      }
    }

    const workflow = await this.prisma.workflow.update({
      data: {
        isScheduleEnabled: isEnabled && !!schedule,
        schedule,
        timezone,
      },
      include: { currentVersion: true },
      where: { id: workflowId },
    });

    const workflowDocument = toWorkflowDocument(workflow);

    if (schedule && isEnabled) {
      // No try/catch: a failed registration on the save path must reach the
      // caller (the boot-sync path in scheduleWorkflow keeps its own catch).
      await this.workflowExecutionQueueService.upsertWorkflowScheduler({
        cronExpression: schedule,
        timezone: timezone || 'UTC',
        workflowId,
      });

      this.logger.log(
        `Scheduled workflow ${workflowId} with cron: ${schedule}`,
        'WorkflowSchedulerService',
      );
    } else {
      await this.unscheduleWorkflow(workflowId);
    }

    return workflowDocument;
  }
}

import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import type { WorkflowDocument } from '@api/collections/workflows/schemas/workflow.schema';
import { LegacyWorkflowStepRunner } from '@api/collections/workflows/services/legacy-workflow-step-runner.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import {
  EXECUTABLE_WORKFLOW_SELECT,
  WorkflowExecutorService,
} from '@api/collections/workflows/services/workflow-executor.service';
import { getSystemWorkflowMetadata } from '@api/collections/workflows/system-workflow.contract';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowExecutionTrigger, WorkflowStatus } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';

function toWorkflowDocument(workflow: unknown): WorkflowDocument {
  return workflow as WorkflowDocument;
}

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
    private readonly legacyWorkflowStepRunner: LegacyWorkflowStepRunner,
    private readonly workflowExecutionsService: WorkflowExecutionsService,
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
          metadata: true,
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
        await this.scheduleWorkflow(toWorkflowDocument(workflow));
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
  async scheduleWorkflow(workflow: WorkflowDocument): Promise<void> {
    const workflowId = String(
      (workflow as unknown as Record<string, unknown>).id ??
        (workflow as unknown as { id: string }).id,
    );

    if (!workflow.schedule || !workflow.isScheduleEnabled) {
      await this.unscheduleWorkflow(workflowId);
      return;
    }

    // System workflows carry a schedule for display, but their actions fire
    // from the workers sweep scheduler — the engine has no executor for
    // systemWorkflowAction nodes, so firing here would only record failures.
    // Also drops schedulers for pre-fix rows seeded with isScheduleEnabled: true.
    if (
      getSystemWorkflowMetadata(
        (workflow as unknown as Record<string, unknown>).metadata,
      )
    ) {
      this.logger.log(
        `Skipping user-workflow scheduling for system workflow ${workflowId}`,
        'WorkflowSchedulerService',
      );
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

      const wDoc = workflow as unknown as Record<string, unknown>;
      const wUserId = String(wDoc.userId ?? wDoc.user ?? '');
      const wOrgId = String(wDoc.organizationId ?? wDoc.organization ?? '');

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
          where: {
            id: workflowId,
            isDeleted: false,
            organizationId: wOrgId,
          },
        });
        await this.unscheduleWorkflow(workflowId);

        this.logger.warn(
          `Scheduled workflow ${workflowId} disabled because required input defaults are missing: ${missingRequiredInputs.join(', ')}`,
          'WorkflowSchedulerService',
        );
        return;
      }

      const nodes = wDoc.nodes as unknown[] | undefined;
      const usesNodeExecutor = Boolean(nodes?.length);

      // Legacy step-based workflows still need an explicit execution record here.
      // Node-based workflows create their own execution record via WorkflowExecutorService.
      if (!usesNodeExecutor) {
        await this.workflowExecutionsService.createExecution(wUserId, wOrgId, {
          inputValues: defaultInputValues,
          trigger: WorkflowExecutionTrigger.SCHEDULED,
          workflow: workflowId,
        });
      }

      // Update workflow last executed timestamp
      await this.prisma.workflow.update({
        data: {
          executionCount: { increment: 1 },
          lastExecutedAt: new Date(),
        } as never,
        where: { id: workflowId },
      });

      // Start execution (fire and forget).
      // Node-based workflows run through the newer workflow engine executor;
      // legacy step-based workflows keep the existing execution path.
      const executePromise = usesNodeExecutor
        ? this.workflowExecutorService.executeManualWorkflowDocument(
            workflowDocument,
            wUserId,
            wOrgId,
            defaultInputValues,
            { triggeredBy: 'schedule' },
            WorkflowExecutionTrigger.SCHEDULED,
          )
        : this.legacyWorkflowStepRunner.executeWorkflow(workflowId);

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
   * Update workflow schedule
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

    const workflow = existing
      ? await this.prisma.workflow.update({
          data: {
            isScheduleEnabled: isEnabled && !!schedule,
            schedule,
            timezone,
          },
          where: { id: workflowId },
        })
      : null;

    if (workflow) {
      const workflowDocument = toWorkflowDocument(workflow);

      if (schedule && isEnabled) {
        await this.scheduleWorkflow(workflowDocument);
      } else {
        await this.unscheduleWorkflow(workflowId);
      }

      return workflowDocument;
    }

    return null;
  }
}

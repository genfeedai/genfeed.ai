import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import type { WorkflowDocument } from '@api/collections/workflows/schemas/workflow.schema';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { ConfigService } from '@api/config/config.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowExecutionTrigger, WorkflowStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

interface ScheduledWorkflow {
  workflowId: string;
  cronExpression: string;
  timezone: string;
  lastRun?: Date;
  nextRun?: Date;
}

@Injectable()
export class WorkflowSchedulerService implements OnModuleInit {
  private scheduledWorkflows: Map<string, CronJob> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LoggerService)
    private readonly logger: LoggerService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly configService: ConfigService,
    private readonly workflowsService: WorkflowsService,
    private readonly workflowExecutionsService: WorkflowExecutionsService,
    private readonly workflowExecutorService: WorkflowExecutorService,
  ) {}

  async onModuleInit() {
    if (!this.configService.isDevSchedulersEnabled) {
      this.logger.log(
        'Workflow schedulers disabled for local development',
        'WorkflowSchedulerService',
      );

      return;
    }

    // Load and schedule all enabled workflows on startup
    await this.loadScheduledWorkflows();
  }

  /**
   * Load all workflows with schedules enabled and register cron jobs
   */
  async loadScheduledWorkflows(): Promise<void> {
    try {
      const workflows = await this.prisma.workflow.findMany({
        where: {
          isDeleted: false,
          isScheduleEnabled: true,
          schedule: { not: null },
          status: WorkflowStatus.ACTIVE,
        },
      });

      this.logger.log(
        `Loading ${workflows.length} scheduled workflows`,
        'WorkflowSchedulerService',
      );

      for (const workflow of workflows) {
        this.scheduleWorkflow(workflow);
      }
    } catch (error) {
      this.logger.error(
        'Failed to load scheduled workflows',
        error,
        'WorkflowSchedulerService',
      );
    }
  }

  /**
   * Schedule a workflow to run on a cron schedule
   */
  scheduleWorkflow(workflow: WorkflowDocument): void {
    const workflowId = String(
      (workflow as unknown as Record<string, unknown>)._id ??
        (workflow as unknown as { id: string }).id,
    );

    // Remove existing schedule if any
    this.unscheduleWorkflow(workflowId);

    if (!workflow.schedule || !workflow.isScheduleEnabled) {
      return;
    }

    try {
      const cronJob = new CronJob(
        workflow.schedule,
        async () => {
          await this.executeScheduledWorkflow(workflowId);
        },
        null,
        true,
        workflow.timezone || 'UTC',
      );

      this.scheduledWorkflows.set(workflowId, cronJob);

      // Register with NestJS scheduler registry for monitoring
      const jobName = `workflow-${workflowId}`;
      try {
        this.schedulerRegistry.addCronJob(jobName, cronJob);
      } catch {
        // Job might already exist, ignore
      }

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
   * Remove a workflow from the schedule
   */
  unscheduleWorkflow(workflowId: string): void {
    const existingJob = this.scheduledWorkflows.get(workflowId);
    if (existingJob) {
      existingJob.stop();
      this.scheduledWorkflows.delete(workflowId);

      const jobName = `workflow-${workflowId}`;
      try {
        this.schedulerRegistry.deleteCronJob(jobName);
      } catch {
        // Job might not exist, ignore
      }

      this.logger.log(
        `Unscheduled workflow ${workflowId}`,
        'WorkflowSchedulerService',
      );
    }
  }

  /**
   * Execute a scheduled workflow
   */
  private async executeScheduledWorkflow(workflowId: string): Promise<void> {
    try {
      const workflow = await this.prisma.workflow.findFirst({
        where: {
          id: workflowId,
          isDeleted: false,
          status: WorkflowStatus.ACTIVE,
        },
      });

      if (!workflow) {
        this.logger.warn(
          `Scheduled workflow ${workflowId} not found or inactive`,
          'WorkflowSchedulerService',
        );
        this.unscheduleWorkflow(workflowId);
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
        this.unscheduleWorkflow(workflowId);
        return;
      }

      const nodes = wDoc.nodes as unknown[] | undefined;
      const usesNodeExecutor = Boolean(nodes && nodes.length);

      // Legacy step-based workflows still need an explicit execution record here.
      // Node-based workflows create their own execution record via WorkflowExecutorService.
      if (!usesNodeExecutor) {
        await this.workflowExecutionsService.createExecution(wUserId, wOrgId, {
          inputValues: this.getDefaultInputValues(
            workflow as unknown as WorkflowDocument,
          ),
          trigger: WorkflowExecutionTrigger.SCHEDULED,
          workflow: workflowId as unknown as Types.ObjectId,
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
        ? this.workflowExecutorService.executeManualWorkflow(
            workflowId,
            wUserId,
            wOrgId,
            this.getDefaultInputValues(workflow as unknown as WorkflowDocument),
            { triggeredBy: 'schedule' },
            WorkflowExecutionTrigger.SCHEDULED,
          )
        : this.workflowsService.executeWorkflow(workflowId);

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
      where: { id: workflowId, isDeleted: false },
    });

    const workflow = existing
      ? await this.prisma.workflow.update({
          data: {
            isScheduleEnabled: isEnabled && !!schedule,
            schedule,
            timezone,
          } as never,
          where: { id: workflowId },
        })
      : null;

    if (workflow) {
      if (schedule && isEnabled) {
        this.scheduleWorkflow(workflow);
      } else {
        this.unscheduleWorkflow(workflowId);
      }
    }

    return workflow;
  }

  /**
   * Get next run time for a workflow
   */
  getNextRunTime(workflowId: string): Date | null {
    const job = this.scheduledWorkflows.get(workflowId);
    if (job) {
      return job.nextDate().toJSDate();
    }
    return null;
  }

  /**
   * Get all scheduled workflows info
   */
  getScheduledWorkflowsInfo(): ScheduledWorkflow[] {
    const info: ScheduledWorkflow[] = [];

    for (const [workflowId, job] of this.scheduledWorkflows) {
      info.push({
        cronExpression: job.cronTime.toString(),
        lastRun: job.lastDate() || undefined,
        nextRun: job.nextDate().toJSDate(),
        timezone:
          (job as unknown as { cronTime: { zone?: string } }).cronTime?.zone ||
          'UTC',
        workflowId,
      });
    }

    return info;
  }

  /**
   * Periodic check for workflows that need rescheduling
   * Runs every hour to catch any workflows that might have been missed
   */
  @Cron(CronExpression.EVERY_HOUR)
  async syncScheduledWorkflows(): Promise<void> {
    if (!this.configService.isDevSchedulersEnabled) {
      return;
    }

    this.logger.log('Syncing scheduled workflows', 'WorkflowSchedulerService');
    await this.loadScheduledWorkflows();
  }
}

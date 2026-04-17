import { CacheService } from '@api/services/cache/services/cache.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  WorkflowRecurrenceType,
  WorkflowStatus,
  WorkflowStepCategory,
  WorkflowTrigger,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Workflow } from '@prisma/client';
import { GenerateArticleTask } from '@workers/crons/workflows/task-types/generate-article.task';
import { GenerateImageTask } from '@workers/crons/workflows/task-types/generate-image.task';
import { GenerateMusicTask } from '@workers/crons/workflows/task-types/generate-music.task';
import { GenerateVideoTask } from '@workers/crons/workflows/task-types/generate-video.task';

type WorkflowStep = {
  id: string;
  label: string;
  category: string;
  config: Record<string, unknown>;
  dependsOn?: string[];
  status?: string;
  error?: string;
  completedAt?: string;
};

type WorkflowRecurrence = {
  type: string;
  timezone?: string;
  endDate?: string;
  nextRunAt?: string;
};

type WorkflowConfig = {
  trigger?: string;
  scheduledFor?: string;
  recurrence?: WorkflowRecurrence;
  executionCount?: number;
  startedAt?: string;
  completedAt?: string;
  lastExecutedAt?: string;
  progress?: number;
};

type WorkflowWithConfig = Workflow & { config: WorkflowConfig };

/**
 * Cron service for executing scheduled workflows
 * Checks every minute for workflows that are due to run
 *
 * Uses distributed locking to prevent race conditions across multiple instances
 */
@Injectable()
export class CronWorkflowsService {
  // Lock key for distributed locking
  private static readonly LOCK_KEY = 'cron:workflows:scheduled';
  // Lock TTL: 10 minutes (should be longer than max expected execution time)
  private static readonly LOCK_TTL_SECONDS = 600;

  constructor(
    private readonly prisma: PrismaService,
    private readonly generateImageTask: GenerateImageTask,
    private readonly generateVideoTask: GenerateVideoTask,
    private readonly generateMusicTask: GenerateMusicTask,
    private readonly generateArticleTask: GenerateArticleTask,
    private readonly notificationsService: NotificationsService,
    private readonly cacheService: CacheService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Check for scheduled workflows every minute
   * Only processes workflows with trigger: SCHEDULED and status: ACTIVE
   *
   * Uses distributed locking to prevent race conditions across multiple instances
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkScheduledWorkflows() {
    // Use distributed lock to prevent concurrent execution across instances
    const acquired = await this.cacheService.acquireLock(
      CronWorkflowsService.LOCK_KEY,
      CronWorkflowsService.LOCK_TTL_SECONDS,
    );

    if (!acquired) {
      return this.logger.debug(
        'Workflow scheduler already running (lock held), skipping this cycle',
        'CronWorkflowsService',
      );
    }

    const startTime = Date.now();

    try {
      this.logger.log(
        'Checking for scheduled workflows',
        'CronWorkflowsService',
      );

      const now = new Date();

      // Fetch active workflows and filter in-memory for scheduled+due ones
      // (trigger and scheduledFor are stored in config Json)
      const candidates = await this.prisma.workflow.findMany({
        take: 200,
        where: {
          isDeleted: false,
          organizationId: { not: undefined },
          status: WorkflowStatus.ACTIVE as never,
          userId: { not: undefined },
        },
      });

      const dueWorkflows = (candidates as WorkflowWithConfig[]).filter((w) => {
        const cfg = (w.config ?? {}) as WorkflowConfig;
        if (cfg.trigger !== WorkflowTrigger.SCHEDULED) return false;
        if (!cfg.scheduledFor) return false;
        return new Date(cfg.scheduledFor) <= now;
      });

      this.logger.log(
        `Found ${dueWorkflows.length} workflows due for execution`,
        'CronWorkflowsService',
      );

      // Execute each workflow
      for (const workflow of dueWorkflows) {
        try {
          await this.executeWorkflow(workflow);
        } catch (error: unknown) {
          this.logger.error(
            `Failed to execute workflow ${workflow.id}`,
            error,
            'CronWorkflowsService',
          );
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `Workflow scheduler cycle completed in ${duration}ms`,
        'CronWorkflowsService',
      );
    } catch (error: unknown) {
      this.logger.error(
        'Workflow scheduler cycle failed',
        error,
        'CronWorkflowsService',
      );
    } finally {
      await this.cacheService.releaseLock(CronWorkflowsService.LOCK_KEY);
    }
  }

  /**
   * Execute a single workflow
   */
  private async executeWorkflow(workflow: WorkflowWithConfig): Promise<void> {
    this.logger.log(
      `Executing workflow: ${workflow.id} - ${workflow.label}`,
      'CronWorkflowsService',
    );

    // Skip execution for systemic workflows (templates without user/org)
    if (!workflow.userId || !workflow.organizationId) {
      this.logger.warn(
        `Workflow ${workflow.id} is a systemic template and cannot be executed directly`,
        'CronWorkflowsService',
      );
      return;
    }

    const cfg = (workflow.config ?? {}) as WorkflowConfig;
    const executionCount = (cfg.executionCount ?? 0) + 1;

    try {
      // Update workflow status to RUNNING
      await this.prisma.workflow.update({
        data: {
          config: {
            ...cfg,
            executionCount,
            startedAt: new Date().toISOString(),
          } as never,
          status: WorkflowStatus.RUNNING as never,
        },
        where: { id: workflow.id },
      });

      // Execute each step in the workflow
      const steps = (workflow.steps as WorkflowStep[]) ?? [];
      const updatedSteps = [...steps];

      for (let i = 0; i < updatedSteps.length; i++) {
        const step = updatedSteps[i];
        try {
          await this.executeWorkflowStep(
            step,
            workflow.userId,
            workflow.organizationId,
          );

          updatedSteps[i] = {
            ...step,
            completedAt: new Date().toISOString(),
            status: 'completed',
          };
        } catch (error: unknown) {
          // Mark step as failed
          updatedSteps[i] = {
            ...step,
            completedAt: new Date().toISOString(),
            error: (error as Error)?.message,
            status: 'failed',
          };

          // Write back steps before re-throwing
          await this.prisma.workflow.update({
            data: { steps: updatedSteps as never },
            where: { id: workflow.id },
          });

          throw error; // Stop workflow execution on step failure
        }
      }

      // Mark workflow as completed
      const completedAt = new Date().toISOString();
      await this.prisma.workflow.update({
        data: {
          config: {
            ...cfg,
            completedAt,
            executionCount,
            lastExecutedAt: completedAt,
            progress: 100,
          } as never,
          status: WorkflowStatus.COMPLETED as never,
          steps: updatedSteps as never,
        },
        where: { id: workflow.id },
      });

      // Send success notification (only if user/org exist)
      if (workflow.userId && workflow.organizationId) {
        await this.notificationsService.sendNotification({
          action: 'send_message',
          organizationId: workflow.organizationId,
          payload: {
            action: 'send_message',
            payload: {
              chatId: workflow.userId,
              message: `Workflow "${workflow.label}" completed successfully`,
            },
            type: 'telegram',
          },
          type: 'telegram',
          userId: workflow.userId,
        });
      }

      this.logger.log(
        `Workflow ${workflow.id} completed successfully`,
        'CronWorkflowsService',
      );

      // Check if workflow should recur
      const recurrence = cfg.recurrence;
      if (recurrence && recurrence.type !== WorkflowRecurrenceType.ONCE) {
        await this.rescheduleWorkflow(workflow.id, recurrence);
      }
    } catch (error: unknown) {
      // Mark workflow as failed
      const completedAt = new Date().toISOString();
      await this.prisma.workflow.update({
        data: {
          config: {
            ...cfg,
            completedAt,
            executionCount,
          } as never,
          status: WorkflowStatus.FAILED as never,
        },
        where: { id: workflow.id },
      });

      // Send failure notification (only if user/org exist)
      if (workflow.userId && workflow.organizationId) {
        await this.notificationsService.sendNotification({
          action: 'send_message',
          organizationId: workflow.organizationId,
          payload: {
            action: 'send_message',
            payload: {
              chatId: workflow.userId,
              message: `Workflow "${workflow.label}" failed: ${(error as Error)?.message}`,
            },
            type: 'telegram',
          },
          type: 'telegram',
          userId: workflow.userId,
        });
      }

      this.logger.error(
        `Workflow ${workflow.id} failed`,
        error,
        'CronWorkflowsService',
      );

      // Do NOT reschedule failed workflows
      throw error;
    }
  }

  /**
   * Execute a single workflow step based on its category
   */
  private async executeWorkflowStep(
    step: WorkflowStep,
    userId: string,
    organizationId: string,
  ): Promise<void> {
    this.logger.log(
      `Executing step: ${step.id} (${step.category})`,
      'CronWorkflowsService',
    );

    switch (step.category) {
      case WorkflowStepCategory.GENERATE_IMAGE:
        await this.executeGenerateImage(step, userId, organizationId);
        break;

      case WorkflowStepCategory.GENERATE_VIDEO:
        await this.executeGenerateVideo(step, userId, organizationId);
        break;

      case WorkflowStepCategory.GENERATE_MUSIC:
        await this.executeGenerateMusic(step, userId, organizationId);
        break;

      case WorkflowStepCategory.GENERATE_ARTICLE:
        await this.executeGenerateArticle(step, userId, organizationId);
        break;

      default:
        this.logger.warn(
          `Unsupported step category for scheduled execution: ${step.category}`,
          'CronWorkflowsService',
        );
        // For other step types, log but don't fail
        break;
    }
  }

  /**
   * Execute generate image step
   */
  private async executeGenerateImage(
    step: WorkflowStep,
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const config = step.config;

    // Validate config
    const validation = this.generateImageTask.validateConfig(config as never);
    if (!validation.valid) {
      throw new Error(`Invalid image generation config: ${validation.error}`);
    }

    // Execute task
    const result = await this.generateImageTask.execute(
      config as never,
      userId,
      organizationId,
    );

    if (!result.success) {
      throw new Error(result.error || 'Image generation failed');
    }

    this.logger.log(
      `Generated image: ${result.imageId}`,
      'CronWorkflowsService',
    );
  }

  /**
   * Execute generate video step
   */
  private async executeGenerateVideo(
    step: WorkflowStep,
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const config = step.config;

    // Validate config
    const validation = this.generateVideoTask.validateConfig(config as never);
    if (!validation.valid) {
      throw new Error(`Invalid video generation config: ${validation.error}`);
    }

    // Execute task
    const result = await this.generateVideoTask.execute(
      config as never,
      userId,
      organizationId,
    );

    if (!result.success) {
      throw new Error(result.error || 'Video generation failed');
    }

    this.logger.log(
      `Generated video: ${result.videoId}`,
      'CronWorkflowsService',
    );
  }

  /**
   * Execute generate music step
   */
  private async executeGenerateMusic(
    step: WorkflowStep,
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const config = step.config;

    // Validate config
    const validation = this.generateMusicTask.validateConfig(config as never);
    if (!validation.valid) {
      throw new Error(`Invalid music generation config: ${validation.error}`);
    }

    // Execute task
    const result = await this.generateMusicTask.execute(
      config as never,
      userId,
      organizationId,
    );

    if (!result.success) {
      throw new Error(result.error || 'Music generation failed');
    }

    this.logger.log(
      `Generated music: ${result.musicId}`,
      'CronWorkflowsService',
    );
  }

  /**
   * Execute generate article step
   */
  private async executeGenerateArticle(
    step: WorkflowStep,
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const config = step.config;

    // Validate config
    const validation = this.generateArticleTask.validateConfig(config as never);
    if (!validation.valid) {
      throw new Error(`Invalid article generation config: ${validation.error}`);
    }

    // Execute task
    const result = await this.generateArticleTask.execute(
      config as never,
      userId,
      organizationId,
    );

    if (!result.success) {
      throw new Error(result.error || 'Article generation failed');
    }

    this.logger.log(
      `Generated article: ${result.articleId}`,
      'CronWorkflowsService',
    );
  }

  /**
   * Manual trigger for testing (not scheduled)
   */
  async triggerWorkflowExecution(workflowId: string): Promise<void> {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: workflowId, isDeleted: false },
    });

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    if (workflow.isDeleted) {
      throw new Error('Workflow is deleted');
    }

    await this.executeWorkflow(workflow as WorkflowWithConfig);
  }

  /**
   * Calculate next run time based on recurrence settings
   */
  private calculateNextRun(
    lastRun: Date,
    recurrence: WorkflowRecurrence,
  ): Date | null {
    if (!recurrence || recurrence.type === WorkflowRecurrenceType.ONCE) {
      return null; // One-time execution
    }

    // Check if past end date
    if (recurrence.endDate && new Date() >= new Date(recurrence.endDate)) {
      return null; // Stop recurring
    }

    const timezone = recurrence.timezone || 'UTC';

    switch (recurrence.type) {
      case WorkflowRecurrenceType.EVERY_30_MIN:
        return new Date(lastRun.getTime() + 30 * 60 * 1000);

      case WorkflowRecurrenceType.HOURLY:
        return new Date(lastRun.getTime() + 60 * 60 * 1000);

      case WorkflowRecurrenceType.DAILY: {
        // Same time next day (respecting timezone)
        const nextDay = new Date(lastRun);
        nextDay.setDate(nextDay.getDate() + 1);
        return this.applyTimezone(nextDay, timezone);
      }

      case WorkflowRecurrenceType.WEEKLY: {
        // Same time next week
        const nextWeek = new Date(lastRun);
        nextWeek.setDate(nextWeek.getDate() + 7);
        return this.applyTimezone(nextWeek, timezone);
      }

      case WorkflowRecurrenceType.MONTHLY: {
        // Same date next month
        const nextMonth = new Date(lastRun);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        return this.applyTimezone(nextMonth, timezone);
      }

      default:
        return null;
    }
  }

  /**
   * Apply timezone to date
   */
  private applyTimezone(date: Date, timezone: string): Date {
    try {
      // Convert to target timezone
      const tzString = date.toLocaleString('en-US', { timeZone: timezone });
      return new Date(tzString);
    } catch (_e) {
      this.logger.warn(
        `Failed to apply timezone ${timezone}, using original date`,
        'CronWorkflowsService',
      );
      return date;
    }
  }

  /**
   * Reschedule workflow for next run
   */
  private async rescheduleWorkflow(
    workflowId: string,
    recurrence: WorkflowRecurrence,
  ): Promise<void> {
    const nextRun = this.calculateNextRun(new Date(), recurrence);

    const workflow = await this.prisma.workflow.findFirst({
      where: { id: workflowId, isDeleted: false },
    });

    if (!workflow) return;

    const cfg = (workflow.config ?? {}) as WorkflowConfig;

    if (!nextRun) {
      // No more runs, mark as completed
      await this.prisma.workflow.update({
        data: {
          config: {
            ...cfg,
            recurrence: { ...recurrence, nextRunAt: undefined },
            scheduledFor: undefined,
          } as never,
          status: WorkflowStatus.COMPLETED as never,
        },
        where: { id: workflowId },
      });

      this.logger.log(
        `Workflow ${workflowId} completed all recurrences`,
        'CronWorkflowsService',
      );
      return;
    }

    // Schedule next run
    await this.prisma.workflow.update({
      data: {
        config: {
          ...cfg,
          recurrence: {
            ...recurrence,
            nextRunAt: nextRun.toISOString(),
          },
          scheduledFor: nextRun.toISOString(),
        } as never,
        status: WorkflowStatus.ACTIVE as never,
      },
      where: { id: workflowId },
    });

    this.logger.log(
      `Rescheduled workflow ${workflowId} for ${nextRun.toISOString()}`,
      'CronWorkflowsService',
    );
  }
}

import {
  Workflow,
  type WorkflowDocument,
  WorkflowRecurrence,
} from '@api/collections/workflows/schemas/workflow.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { CacheService } from '@api/services/cache/services/cache.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import {
  WorkflowRecurrenceType,
  WorkflowStatus,
  WorkflowStepCategory,
  WorkflowTrigger,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GenerateArticleTask } from '@workers/crons/workflows/task-types/generate-article.task';
import { GenerateImageTask } from '@workers/crons/workflows/task-types/generate-image.task';
import { GenerateMusicTask } from '@workers/crons/workflows/task-types/generate-music.task';
import { GenerateVideoTask } from '@workers/crons/workflows/task-types/generate-video.task';
import { Model } from 'mongoose';

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
    @InjectModel(Workflow.name, DB_CONNECTIONS.CLOUD)
    private readonly workflowModel: Model<WorkflowDocument>,
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

      // Find workflows that are due to run
      // Exclude systemic workflows (templates without user/org) - they cannot be executed directly
      const dueWorkflows = await this.workflowModel
        .find({
          isDeleted: false,
          organization: { $exists: true, $ne: null },
          scheduledFor: { $lte: now },
          status: WorkflowStatus.ACTIVE,
          trigger: WorkflowTrigger.SCHEDULED,
          user: { $exists: true, $ne: null },
        })
        .limit(50) // Process max 50 workflows per cycle to avoid overload
        .exec();

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
            `Failed to execute workflow ${workflow._id}`,
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
  private async executeWorkflow(workflow: WorkflowDocument): Promise<void> {
    this.logger.log(
      `Executing workflow: ${workflow._id} - ${workflow.label}`,
      'CronWorkflowsService',
    );

    // Skip execution for systemic workflows (templates without user/org)
    if (!workflow.user || !workflow.organization) {
      this.logger.warn(
        `Workflow ${workflow._id} is a systemic template and cannot be executed directly`,
        'CronWorkflowsService',
      );
      return;
    }

    try {
      // Update workflow status to RUNNING
      await this.workflowModel.updateOne(
        { _id: workflow._id },
        {
          $inc: { executionCount: 1 },
          $set: {
            startedAt: new Date(),
            status: WorkflowStatus.RUNNING,
          },
        },
      );

      // Execute each step in the workflow
      for (const step of workflow.steps) {
        try {
          await this.executeWorkflowStep(
            step,
            workflow.user?.toString(),
            workflow.organization?.toString(),
          );

          // Update step status
          await this.workflowModel.updateOne(
            { _id: workflow._id, 'steps.id': step.id },
            {
              $set: {
                'steps.$.completedAt': new Date(),
                'steps.$.status': 'completed',
              },
            },
          );
        } catch (error: unknown) {
          // Mark step as failed
          await this.workflowModel.updateOne(
            { _id: workflow._id, 'steps.id': step.id },
            {
              $set: {
                'steps.$.completedAt': new Date(),
                'steps.$.error': error.message,
                'steps.$.status': 'failed',
              },
            },
          );

          throw error; // Stop workflow execution on step failure
        }
      }

      // Mark workflow as completed
      await this.workflowModel.updateOne(
        { _id: workflow._id },
        {
          $set: {
            completedAt: new Date(),
            lastExecutedAt: new Date(),
            progress: 100,
            status: WorkflowStatus.COMPLETED,
          },
        },
      );

      // Send success notification (only if user/org exist)
      if (workflow.user && workflow.organization) {
        await this.notificationsService.sendNotification({
          action: 'send_message',
          organizationId: workflow.organization.toString(),
          payload: {
            action: 'send_message',
            payload: {
              chatId: workflow.user.toString(),
              message: `Workflow "${workflow.label}" completed successfully`,
            },
            type: 'telegram',
          },
          type: 'telegram',
          userId: workflow.user.toString(),
        });
      }

      this.logger.log(
        `Workflow ${workflow._id} completed successfully`,
        'CronWorkflowsService',
      );

      // Check if workflow should recur
      const recurrence = workflow?.recurrence;
      if (recurrence && recurrence?.type !== WorkflowRecurrenceType.ONCE) {
        await this.rescheduleWorkflow(workflow._id.toString(), recurrence);
      }
    } catch (error: unknown) {
      // Mark workflow as failed
      await this.workflowModel.updateOne(
        { _id: workflow._id },
        {
          $set: {
            completedAt: new Date(),
            status: WorkflowStatus.FAILED,
          },
        },
      );

      // Send failure notification (only if user/org exist)
      if (workflow.user && workflow.organization) {
        await this.notificationsService.sendNotification({
          action: 'send_message',
          organizationId: workflow.organization.toString(),
          payload: {
            action: 'send_message',
            payload: {
              chatId: workflow.user.toString(),
              message: `Workflow "${workflow.label}" failed: ${error.message}`,
            },
            type: 'telegram',
          },
          type: 'telegram',
          userId: workflow.user.toString(),
        });
      }

      this.logger.error(
        `Workflow ${workflow._id} failed`,
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
    step: unknown,
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
    step: unknown,
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const config = step.config;

    // Validate config
    const validation = this.generateImageTask.validateConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid image generation config: ${validation.error}`);
    }

    // Execute task
    const result = await this.generateImageTask.execute(
      config,
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
    step: unknown,
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const config = step.config;

    // Validate config
    const validation = this.generateVideoTask.validateConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid video generation config: ${validation.error}`);
    }

    // Execute task
    const result = await this.generateVideoTask.execute(
      config,
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
    step: unknown,
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const config = step.config;

    // Validate config
    const validation = this.generateMusicTask.validateConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid music generation config: ${validation.error}`);
    }

    // Execute task
    const result = await this.generateMusicTask.execute(
      config,
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
    step: unknown,
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const config = step.config;

    // Validate config
    const validation = this.generateArticleTask.validateConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid article generation config: ${validation.error}`);
    }

    // Execute task
    const result = await this.generateArticleTask.execute(
      config,
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
    const workflow = await this.workflowModel.findById(workflowId);

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    if (workflow.isDeleted) {
      throw new Error('Workflow is deleted');
    }

    await this.executeWorkflow(workflow);
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
    if (recurrence.endDate && new Date() >= recurrence.endDate) {
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

    if (!nextRun) {
      // No more runs, mark as completed
      await this.workflowModel.updateOne(
        { _id: workflowId },
        {
          $set: {
            'recurrence.nextRunAt': null,
            status: WorkflowStatus.COMPLETED,
          },
        },
      );

      this.logger.log(
        `Workflow ${workflowId} completed all recurrences`,
        'CronWorkflowsService',
      );
      return;
    }

    // Schedule next run
    await this.workflowModel.updateOne(
      { _id: workflowId },
      {
        $set: {
          'recurrence.nextRunAt': nextRun,
          scheduledFor: nextRun,
          status: WorkflowStatus.ACTIVE,
        },
      },
    );

    this.logger.log(
      `Rescheduled workflow ${workflowId} for ${nextRun.toISOString()}`,
      'CronWorkflowsService',
    );
  }
}

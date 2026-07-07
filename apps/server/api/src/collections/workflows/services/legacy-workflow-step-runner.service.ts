import { PostsService } from '@api/collections/posts/services/posts.service';
import { CreateWorkflowDto } from '@api/collections/workflows/dto/create-workflow.dto';
import { UpdateWorkflowDto } from '@api/collections/workflows/dto/update-workflow.dto';
import {
  WorkflowEntity,
  WorkflowStepEntity,
} from '@api/collections/workflows/entities/workflow.entity';
import {
  type WorkflowDocument,
  type WorkflowStep,
} from '@api/collections/workflows/schemas/workflow.schema';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import {
  type TaskJobRequest,
  TaskQueueClientService,
} from '@api/services/task-queue-client/task-queue-client.service';
import { EntityFactory } from '@api/shared/factories/entity/entity.factory';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import {
  CredentialPlatform,
  PostStatus,
  WorkflowStatus,
  WorkflowStepCategory,
  WorkflowStepStatus,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';

/**
 * Legacy step-based workflow execution engine.
 *
 * Runs workflows that predate the node/edge graph model: a flat `steps` array
 * with `dependsOn` references, executed as a hand-rolled topological scheduler
 * that dispatches each step category to a queue job, post creation, webhook
 * call, or delay.
 *
 * Still reachable in production for workflows without `nodes` — scheduled runs
 * (`WorkflowSchedulerService`), legacy `workflow_execution` cron rows
 * (`CronJobsService`), and the manual/webhook compat fallbacks all route
 * step-only workflows here. Node-based workflows use `WorkflowExecutorService`.
 *
 * Extends `BaseService` over the same `workflow` collection as
 * `WorkflowsService` so `patch()` keeps identical cache-invalidation semantics
 * without a circular service dependency. Split out of `WorkflowsService`
 * (#754).
 */
@Injectable()
export class LegacyWorkflowStepRunner extends BaseService<
  WorkflowDocument,
  CreateWorkflowDto,
  UpdateWorkflowDto
> {
  constructor(
    public readonly prisma: PrismaService,
    readonly logger: LoggerService,
    @Optional()
    private readonly websocketService?: NotificationsPublisherService,
    @Optional() private readonly postsService?: PostsService,
    @Optional() private readonly taskQueueClient?: TaskQueueClientService,
  ) {
    super(prisma, 'workflow', logger);
  }

  async executeWorkflow(workflowId: string): Promise<void> {
    const workflowDoc = await this.findOne({
      _id: workflowId,
      isDeleted: false,
    });
    if (!workflowDoc) {
      throw new NotFoundException('Workflow');
    }
    const workflow = EntityFactory.fromDocument(WorkflowEntity, workflowDoc);
    if (!workflow) {
      throw new NotFoundException('Workflow');
    }

    if (!workflow.user || !workflow.organization) {
      throw new Error(
        'Systemic workflow templates cannot be executed directly. Clone the workflow first.',
      );
    }

    try {
      await this.patch(workflowId, {
        progress: 0,
        startedAt: new Date(),
        status: WorkflowStatus.RUNNING,
      });

      await this.emitWorkflowEvent(workflow, 'started', {
        progress: 0,
        status: 'started',
      });

      const { completed, failed } = await this.runStepsInDependencyOrder(
        workflowId,
        workflow,
      );

      await this.finalizeRun(workflowId, workflow, completed, failed);
    } catch (error: unknown) {
      await this.recordRunFailure(workflowId, workflow, error);
      throw error;
    }
  }

  /**
   * Hand-rolled topological scheduler: repeatedly selects steps whose
   * dependencies are all completed and runs each batch concurrently. When no
   * step is ready, either the remaining steps are blocked by a failure (marked
   * failed, loop ends) or the graph is cyclic/missing a step (throws).
   */
  private async runStepsInDependencyOrder(
    workflowId: string,
    workflow: WorkflowEntity,
  ): Promise<{ completed: Set<string>; failed: Set<string> }> {
    const { steps } = workflow;
    const completed = new Set<string>();
    const failed = new Set<string>();

    while (completed.size + failed.size < steps.length) {
      const readySteps = this.selectReadySteps(steps, completed, failed);

      if (readySteps.length === 0) {
        const didMarkBlocked = await this.markStepsBlockedByFailure(
          workflowId,
          steps,
          completed,
          failed,
        );
        if (didMarkBlocked) {
          break;
        }
        throw new BadRequestException(
          'Circular dependency or missing step detected',
        );
      }

      await Promise.all(
        readySteps.map((step: WorkflowStep) =>
          this.runStep(workflowId, workflow, step, completed, failed),
        ),
      );
    }

    return { completed, failed };
  }

  private selectReadySteps(
    steps: WorkflowStep[],
    completed: Set<string>,
    failed: Set<string>,
  ): WorkflowStep[] {
    return steps.filter((step: WorkflowStep) => {
      if (completed.has(step.id) || failed.has(step.id)) {
        return false;
      }
      if (!step.dependsOn || step.dependsOn.length === 0) {
        return true;
      }
      return step.dependsOn.every((depId: string) => completed.has(depId));
    });
  }

  /**
   * When the scheduler stalls with failures present, marks every remaining
   * step as failed ("Blocked by failed dependency") and reports that the stall
   * was handled. Returns false when there are no failures — the stall is a
   * circular dependency and the caller must throw.
   */
  private async markStepsBlockedByFailure(
    workflowId: string,
    steps: WorkflowStep[],
    completed: Set<string>,
    failed: Set<string>,
  ): Promise<boolean> {
    const hasBlockedByFailure = steps.some(
      (step: WorkflowStep) =>
        !completed.has(step.id) &&
        !failed.has(step.id) &&
        step.dependsOn?.some((depId: string) => failed.has(depId)),
    );

    if (!hasBlockedByFailure && failed.size === 0) {
      return false;
    }

    for (const step of steps) {
      if (!completed.has(step.id) && !failed.has(step.id)) {
        failed.add(step.id);
        await this.updateWorkflowStep(workflowId, step.id, {
          completedAt: new Date(),
          error: 'Blocked by failed dependency',
          status: WorkflowStepStatus.FAILED,
        });
      }
    }

    return true;
  }

  private async runStep(
    workflowId: string,
    workflow: WorkflowEntity,
    step: WorkflowStep,
    completed: Set<string>,
    failed: Set<string>,
  ): Promise<void> {
    try {
      await this.updateWorkflowStep(workflowId, step.id, {
        startedAt: new Date(),
        status: WorkflowStepStatus.PROCESSING,
      });

      const output = await this.executeWorkflowStep(workflow, step);

      await this.updateWorkflowStep(workflowId, step.id, {
        completedAt: new Date(),
        output: output?._id as string | undefined,
        progress: 100,
        status: WorkflowStepStatus.COMPLETED,
      });

      completed.add(step.id);

      // Progress counts both completed and failed steps.
      const progress = Math.round(
        ((completed.size + failed.size) / workflow.steps.length) * 100,
      );
      await this.patch(workflowId, { progress });

      await this.emitWorkflowEvent(workflow, 'progress', {
        progress,
        status: 'completed',
        stepId: step.id,
        stepName: step.label,
      });
    } catch (error: unknown) {
      failed.add(step.id);

      await this.updateWorkflowStep(workflowId, step.id, {
        completedAt: new Date(),
        error: (error as Error)?.message ?? 'Unknown error',
        status: WorkflowStepStatus.FAILED,
      });

      await this.emitWorkflowEvent(workflow, 'step-error', {
        error: (error as Error)?.message ?? 'Unknown error',
        stepId: step.id,
        stepName: step.label,
      });
    }
  }

  private async finalizeRun(
    workflowId: string,
    workflow: WorkflowEntity,
    completed: Set<string>,
    failed: Set<string>,
  ): Promise<void> {
    const finalStatus =
      failed.size === 0 ? WorkflowStatus.COMPLETED : WorkflowStatus.FAILED;

    await this.patch(workflowId, {
      completedAt: new Date(),
      executionCount: (workflow.executionCount ?? 0) + 1,
      lastExecutedAt: new Date(),
      progress: 100,
      status: finalStatus,
    });

    await this.websocketService?.publishWorkflowStatus(
      workflowId,
      finalStatus === WorkflowStatus.COMPLETED ? 'completed' : 'failed',
      String(workflow.user),
      {
        failedSteps: failed.size,
        workflowLabel: workflow.label,
      },
    );

    await this.emitWorkflowEvent(
      workflow,
      finalStatus === WorkflowStatus.COMPLETED ? 'completed' : 'failed',
      {
        completedSteps: completed.size,
        failedSteps: failed.size,
        status: finalStatus,
        totalSteps: workflow.steps.length,
      },
    );
  }

  private async recordRunFailure(
    workflowId: string,
    workflow: WorkflowEntity,
    error: unknown,
  ): Promise<void> {
    await this.patch(workflowId, {
      completedAt: new Date(),
      status: WorkflowStatus.FAILED,
    });

    await this.websocketService?.publishWorkflowStatus(
      workflowId,
      'failed',
      String(workflow.user),
      {
        error: (error as Error)?.message ?? 'Unknown error',
        workflowLabel: workflow.label,
      },
    );

    await this.emitWorkflowEvent(workflow, 'error', {
      error: (error as Error)?.message ?? 'Unknown error',
      status: 'failed',
    });
  }

  private async executeWorkflowStep(
    workflow: WorkflowEntity,
    step: WorkflowStepEntity,
  ): Promise<Record<string, unknown>> {
    const { category, config } = step;
    const sourceAsset = workflow.sourceAsset;

    // Emit step start event
    await this.emitWorkflowEvent(workflow, 'step-started', {
      category,
      stepId: step.id,
      stepName: step.label,
    });

    switch (category) {
      case WorkflowStepCategory.TRANSFORM:
        return this.executeTransform(sourceAsset, config);

      case WorkflowStepCategory.UPSCALE:
        return this.executeUpscale(sourceAsset, config);

      case WorkflowStepCategory.CAPTION:
        return this.executeCaptioning(sourceAsset, config);

      case WorkflowStepCategory.PUBLISH:
        return this.executePublish(sourceAsset, config, workflow);

      case WorkflowStepCategory.RESIZE:
        return this.executeResize(sourceAsset, config);

      case WorkflowStepCategory.CLIP:
        return this.executeClip(sourceAsset, config);

      case WorkflowStepCategory.WEBHOOK:
        return this.executeWebhook(sourceAsset, config, workflow);

      case WorkflowStepCategory.DELAY:
        return this.executeDelay(config);

      default:
        throw new BadRequestException(
          `Unknown workflow step type: ${category}`,
        );
    }
  }

  // Generic queue job executor for workflow steps
  private async executeQueuedJob(
    stepType: string,
    assetId: string | undefined,
    config: Record<string, unknown>,
    queueMethod: keyof TaskQueueClientService,
    resultKey: string,
  ): Promise<Record<string, unknown>> {
    if (!this.taskQueueClient) {
      throw new Error(
        `Cannot execute ${stepType} step: task queue client is not available`,
      );
    }

    if (!assetId) {
      throw new BadRequestException(
        `Cannot execute ${stepType} step without a source asset`,
      );
    }

    const queueFn = this.taskQueueClient[queueMethod] as (
      data: TaskJobRequest,
    ) => Promise<Record<string, unknown>>;

    const job = await queueFn({
      assetId: assetId.toString(),
      config: config as Record<string, never>,
      organizationId: (config.organizationId as string) || '',
      taskId: assetId.toString(),
      userId: (config.userId as string) || '',
    });

    return {
      _id: assetId,
      config,
      jobId: (job as Record<string, unknown>).id,
      [resultKey]: true,
    };
  }

  // Step execution methods (consolidated)
  private executeTransform(
    assetId: string | undefined,
    config: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.executeQueuedJob(
      'transform',
      assetId,
      config,
      'queueTransformJob',
      'transformed',
    );
  }

  private executeUpscale(
    assetId: string | undefined,
    config: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.executeQueuedJob(
      'upscale',
      assetId,
      config,
      'queueUpscaleJob',
      'upscaled',
    );
  }

  private executeCaptioning(
    assetId: string | undefined,
    config: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.executeQueuedJob(
      'captioning',
      assetId,
      config,
      'queueCaptionJob',
      'captioned',
    );
  }

  private async executePublish(
    assetId: string | undefined,
    config: Record<string, unknown>,
    workflow: WorkflowEntity,
  ): Promise<Record<string, unknown>> {
    const { platforms, schedule, visibility } = config as Record<
      string,
      unknown
    >;

    if (this.postsService) {
      const postsService = this.postsService;
      const posts = await Promise.all(
        (platforms as string[]).map((platform: string) =>
          postsService.create({
            brand: workflow.brandId,
            credential: config.credential,
            description: config.description as string,
            ingredients: assetId ? [assetId] : [],
            label: config.label as string,
            organization: workflow.organization,
            platform: platform as CredentialPlatform,
            scheduledDate:
              schedule === 'immediate'
                ? new Date()
                : (config.scheduledAt as Date),
            status: (visibility as PostStatus) || PostStatus.SCHEDULED,
            user: workflow.user,
          } as never),
        ),
      );
      return { posts } as Record<string, unknown>;
    }

    return { _id: assetId, config, published: true };
  }

  private executeResize(
    assetId: string | undefined,
    config: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.executeQueuedJob(
      'resize',
      assetId,
      config,
      'queueResizeJob',
      'resized',
    );
  }

  private executeClip(
    assetId: string | undefined,
    config: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.executeQueuedJob(
      'clip',
      assetId,
      config,
      'queueClipJob',
      'clipped',
    );
  }

  private async executeWebhook(
    assetId: string | undefined,
    config: Record<string, unknown>,
    _workflow: WorkflowEntity,
  ): Promise<Record<string, unknown>> {
    const webhookUrl = config.url as string | undefined;
    if (!webhookUrl) {
      throw new Error(
        'Webhook execution failed: no webhook URL configured in step config.',
      );
    }

    if (this.logger) {
      this.logger.debug('Executing webhook step', {
        assetId,
        config,
        webhookUrl,
      });
    }

    const payload = {
      assetId: assetId?.toString(),
      config,
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(webhookUrl, {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(
        `Webhook dispatch failed: ${response.status} ${response.statusText} from ${webhookUrl}`,
      );
    }

    return {
      _id: assetId,
      config,
      webhookSent: true,
      webhookStatus: response.status,
    };
  }

  private async executeDelay(
    config: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const delay = (config.duration as number) || 1000;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return { delayed: true, duration: delay };
  }

  private async updateWorkflowStep(
    workflowId: string,
    stepId: string,
    updates: Partial<WorkflowStep>,
  ): Promise<void> {
    const workflow = await this.findOne({
      _id: workflowId,
      isDeleted: false,
    });
    if (!workflow) {
      return;
    }

    const stepIndex = workflow.steps.findIndex((s) => s.id === stepId);
    if (stepIndex === -1) {
      return;
    }

    const updatedSteps = [...workflow.steps];
    updatedSteps[stepIndex] = { ...updatedSteps[stepIndex], ...updates };

    await this.patch(workflowId, {
      steps: updatedSteps,
    });
  }

  private async emitWorkflowEvent(
    workflow: WorkflowEntity | string,
    event: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (!this.websocketService) {
      return;
    }

    const workflowId =
      typeof workflow === 'string'
        ? workflow
        : workflow?._id
          ? String(workflow._id)
          : undefined;

    if (!workflowId) {
      return;
    }

    await this.websocketService.emit(`workflow:${workflowId}:${event}`, {
      workflowId,
      ...data,
    });
  }
}

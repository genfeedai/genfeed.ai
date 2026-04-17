import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { WorkflowExecutionDocument } from '@api/collections/workflow-executions/schemas/workflow-execution.schema';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { CreateWorkflowDto } from '@api/collections/workflows/dto/create-workflow.dto';
import { UpdateWorkflowDto } from '@api/collections/workflows/dto/update-workflow.dto';
import {
  WorkflowEntity,
  WorkflowStepEntity,
} from '@api/collections/workflows/entities/workflow.entity';
import {
  type WorkflowDocument,
  type WorkflowStep,
  type WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import { WorkflowEngineAdapterService } from '@api/collections/workflows/services/workflow-engine-adapter.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/workflow-templates';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
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
  WorkflowExecutionStatus,
  WorkflowExecutionTrigger,
  WorkflowLifecycle,
  WorkflowStatus,
  WorkflowStepCategory,
  WorkflowStepStatus,
} from '@genfeedai/enums';
import type { CreditEstimate } from '@genfeedai/workflow-engine';
import {
  calculateCreditEstimate,
  DEFAULT_CREDIT_COSTS,
  type ExecutionRunResult,
  type NodeStatusChangeEvent,
} from '@genfeedai/workflow-engine';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';

@Injectable()
export class WorkflowsService extends BaseService<
  WorkflowDocument,
  CreateWorkflowDto,
  UpdateWorkflowDto
> {
  constructor(
    public readonly prisma: PrismaService,
    readonly logger: LoggerService,
    @Optional()
    private readonly creditsUtilsService?: CreditsUtilsService,
    @Optional()
    private readonly websocketService?: NotificationsPublisherService,
    @Optional() private readonly postsService?: PostsService,
    @Optional() private readonly taskQueueClient?: TaskQueueClientService,
    @Optional()
    private readonly workflowEngineAdapter?: WorkflowEngineAdapterService,
    @Optional()
    private readonly workflowExecutionsService?: WorkflowExecutionsService,
    @Optional()
    private readonly workflowExecutorService?: WorkflowExecutorService,
  ) {
    super(prisma, 'workflow', logger);
  }

  @HandleErrors('create workflow', 'workflows')
  async createWorkflow(
    userId: string,
    organizationId: string,
    workflowData: CreateWorkflowDto,
  ): Promise<WorkflowEntity> {
    let steps = workflowData.steps || [];
    const templateMetadata = workflowData.templateId
      ? {
          sourceTemplateId: workflowData.templateId,
          sourceType: 'seeded-template',
        }
      : undefined;

    // If using a template, load predefined steps
    if (
      workflowData.templateId &&
      WORKFLOW_TEMPLATES[workflowData.templateId]
    ) {
      const template = WORKFLOW_TEMPLATES[workflowData.templateId];
      const shouldUseTemplateEdges =
        !workflowData.edges || workflowData.edges.length === 0;
      const shouldUseTemplateInputVariables =
        !workflowData.inputVariables ||
        workflowData.inputVariables.length === 0;
      const shouldUseTemplateNodes =
        !workflowData.nodes || workflowData.nodes.length === 0;

      workflowData = {
        ...workflowData,
        edges: shouldUseTemplateEdges ? template.edges : workflowData.edges,
        inputVariables: shouldUseTemplateInputVariables
          ? template.inputVariables
          : workflowData.inputVariables,
        metadata: {
          ...templateMetadata,
          ...(workflowData.metadata ?? {}),
        },
        nodes: shouldUseTemplateNodes ? template.nodes : workflowData.nodes,
      };
      steps = template.steps.map((step) => ({
        ...step,
        label: step.name,
        status: WorkflowStepStatus.PENDING,
      }));
    }

    // Create the workflow
    const workflow = await this.create({
      ...workflowData,
      executionCount: 0,
      label:
        workflowData.label ||
        `Workflow: ${workflowData.templateId || 'Custom'}`,
      metadata:
        workflowData.metadata || templateMetadata
          ? {
              ...templateMetadata,
              ...(workflowData.metadata ?? {}),
            }
          : undefined,
      organization: new Types.ObjectId(organizationId),
      progress: 0,
      status: workflowData.status ?? WorkflowStatus.ACTIVE,
      steps,
      user: new Types.ObjectId(userId),
    });

    // If trigger is manual, start execution immediately
    if ((workflowData.trigger as string) === 'manual') {
      this.executeWorkflowCompat(
        workflow._id.toString(),
        userId,
        organizationId,
      ).catch((error) => {
        if (this.logger) {
          this.logger.error('Workflow execution failed', error);
        }
      });
    }

    return EntityFactory.fromDocument(WorkflowEntity, workflow);
  }

  async executeWorkflow(workflowId: string): Promise<void> {
    const workflowDoc = await this.findOne({
      _id: workflowId,
      isDeleted: false,
    });
    if (!workflowDoc) {
      throw new NotFoundException('Workflow not found');
    }
    const workflow = EntityFactory.fromDocument(WorkflowEntity, workflowDoc);
    if (!workflow) {
      throw new NotFoundException('Workflow not found');
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

      const { steps } = workflow;
      const completed = new Set<string>();
      const failed = new Set<string>();

      // Execute steps in dependency order
      while (completed.size + failed.size < steps.length) {
        const readySteps = steps.filter((step) => {
          if (completed.has(step.id) || failed.has(step.id)) {
            return false;
          }
          if (!step.dependsOn || step.dependsOn.length === 0) {
            return true;
          }
          return step.dependsOn.every((depId: string) => completed.has(depId));
        });

        if (readySteps.length === 0) {
          const hasBlockedByFailure = steps.some(
            (step) =>
              !completed.has(step.id) &&
              !failed.has(step.id) &&
              step.dependsOn?.some((depId: string) => failed.has(depId)),
          );

          if (hasBlockedByFailure || failed.size > 0) {
            // Mark remaining steps blocked by failures as failed
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
            break;
          }
          throw new BadRequestException(
            'Circular dependency or missing step detected',
          );
        }

        await Promise.all(
          readySteps.map(async (step) => {
            try {
              await this.updateWorkflowStep(workflowId, step.id, {
                startedAt: new Date(),
                status: WorkflowStepStatus.PROCESSING,
              });

              const output = await this.executeWorkflowStep(workflow, step);

              await this.updateWorkflowStep(workflowId, step.id, {
                completedAt: new Date(),
                output: output?._id as Types.ObjectId | undefined,
                progress: 100,
                status: WorkflowStepStatus.COMPLETED,
              });

              completed.add(step.id);

              // Progress counts both completed and failed (fix: was only counting completed)
              const progress = Math.round(
                ((completed.size + failed.size) / steps.length) * 100,
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
          }),
        );
      }

      const finalStatus =
        failed.size === 0 ? WorkflowStatus.COMPLETED : WorkflowStatus.FAILED;

      await this.patch(workflowId, {
        completedAt: new Date(),
        executionCount: workflow.executionCount + 1,
        lastExecutedAt: new Date(),
        progress: 100,
        status: finalStatus,
      });

      await this.websocketService?.publishWorkflowStatus(
        workflowId,
        finalStatus === WorkflowStatus.COMPLETED ? 'completed' : 'failed',
        workflow.user.toString(),
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
          totalSteps: steps.length,
        },
      );
    } catch (error: unknown) {
      await this.patch(workflowId, {
        completedAt: new Date(),
        status: WorkflowStatus.FAILED,
      });

      await this.websocketService?.publishWorkflowStatus(
        workflowId,
        'failed',
        workflow.user.toString(),
        {
          error: (error as Error)?.message ?? 'Unknown error',
          workflowLabel: workflow.label,
        },
      );

      await this.emitWorkflowEvent(workflow, 'error', {
        error: (error as Error)?.message ?? 'Unknown error',
        status: 'failed',
      });

      throw error;
    }
  }

  @HandleErrors('execute workflow compat', 'workflows')
  async executeWorkflowCompat(
    workflowId: string,
    userId: string,
    organizationId: string,
    inputValues: Record<string, unknown> = {},
    metadata?: Record<string, unknown>,
    trigger: WorkflowExecutionTrigger = WorkflowExecutionTrigger.MANUAL,
  ): Promise<{ executionId?: string; mode: 'legacy' | 'node' }> {
    const workflowDoc = await this.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
      user: new Types.ObjectId(userId),
    });

    if (!workflowDoc) {
      throw new NotFoundException('Workflow not found');
    }

    if (!this.shouldUseNodeExecutor(workflowDoc)) {
      await this.executeWorkflow(workflowId);
      return { mode: 'legacy' };
    }

    if (!this.workflowExecutorService) {
      throw new Error(
        'Workflow executor service is not available - cannot execute node workflow',
      );
    }

    const result = await this.workflowExecutorService.executeManualWorkflow(
      workflowId,
      userId,
      organizationId,
      inputValues,
      metadata,
      trigger,
    );

    return {
      executionId: result.executionId,
      mode: 'node',
    };
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
    assetId: Types.ObjectId,
    config: Record<string, unknown>,
    queueMethod: keyof TaskQueueClientService,
    resultKey: string,
  ): Promise<Record<string, unknown>> {
    if (!this.taskQueueClient) {
      throw new Error(
        `Cannot execute ${stepType} step: task queue client is not available`,
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
    assetId: Types.ObjectId | undefined,
    config: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.executeQueuedJob(
      'transform',
      assetId as Types.ObjectId,
      config,
      'queueTransformJob',
      'transformed',
    );
  }

  private executeUpscale(
    assetId: Types.ObjectId | undefined,
    config: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.executeQueuedJob(
      'upscale',
      assetId as Types.ObjectId,
      config,
      'queueUpscaleJob',
      'upscaled',
    );
  }

  private executeCaptioning(
    assetId: Types.ObjectId | undefined,
    config: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.executeQueuedJob(
      'captioning',
      assetId as Types.ObjectId,
      config,
      'queueCaptionJob',
      'captioned',
    );
  }

  private async executePublish(
    assetId: Types.ObjectId | undefined,
    config: Record<string, unknown>,
    workflow: WorkflowEntity,
  ): Promise<Record<string, unknown>> {
    const { platforms, schedule, visibility } = config as Record<
      string,
      unknown
    >;

    if (this.postsService) {
      const posts = await Promise.all(
        (platforms as string[]).map((platform: string) =>
          this.postsService?.create({
            brand: workflow.brands?.[0] as Types.ObjectId,
            credential: config.credential as Types.ObjectId,
            description: config.description as string,
            ingredients: [assetId as Types.ObjectId],
            label: config.label as string,
            organization: workflow.organization as Types.ObjectId,
            platform: platform as CredentialPlatform,
            scheduledDate:
              schedule === 'immediate'
                ? new Date()
                : (config.scheduledAt as Date),
            status: (visibility as PostStatus) || PostStatus.SCHEDULED,
            user: workflow.user as Types.ObjectId,
          } as unknown),
        ),
      );
      return { posts } as Record<string, unknown>;
    }

    return { _id: assetId, config, published: true };
  }

  private executeResize(
    assetId: Types.ObjectId | undefined,
    config: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.executeQueuedJob(
      'resize',
      assetId as Types.ObjectId,
      config,
      'queueResizeJob',
      'resized',
    );
  }

  private executeClip(
    assetId: Types.ObjectId | undefined,
    config: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.executeQueuedJob(
      'clip',
      assetId as Types.ObjectId,
      config,
      'queueClipJob',
      'clipped',
    );
  }

  private async executeWebhook(
    assetId: Types.ObjectId | undefined,
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

  async getWorkflowTemplates() {
    return await Promise.resolve(Object.values(WORKFLOW_TEMPLATES));
  }

  async cloneWorkflow(
    workflowId: string,
    userId: string,
    organizationId: string,
  ): Promise<WorkflowEntity> {
    const workflowDoc = await this.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });
    if (!workflowDoc) {
      throw new NotFoundException('Workflow not found');
    }
    const workflow = EntityFactory.fromDocument(WorkflowEntity, workflowDoc);

    const clonedWorkflow = await this.create({
      ...workflow,
      completedAt: undefined,
      executionCount: 0,
      label: `${workflow.label} (Copy)`,
      lastExecutedAt: undefined,
      organization: new Types.ObjectId(organizationId),
      progress: 0,
      recurrence: undefined,
      startedAt: undefined,
      status: WorkflowStatus.DRAFT,
      user: new Types.ObjectId(userId),
    });

    return EntityFactory.fromDocument(WorkflowEntity, clonedWorkflow);
  }

  @HandleErrors('set workflow thumbnail', 'workflows')
  async setThumbnail(
    workflowId: string,
    thumbnailUrl: string,
    nodeId: string,
    userId: string,
    organizationId: string,
  ): Promise<WorkflowEntity> {
    const workflow = await this.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
      user: new Types.ObjectId(userId),
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    const updated = await this.patch(workflowId, {
      thumbnail: thumbnailUrl,
      thumbnailNodeId: nodeId,
    });

    return EntityFactory.fromDocument(WorkflowEntity, updated);
  }

  async getWorkflowStatistics(
    userId: string,
    organizationId: string,
  ): Promise<Array<{ _id: string; count: number }>> {
    const stats = await this.model.aggregate([
      {
        $match: {
          isDeleted: false,
          organization: new Types.ObjectId(organizationId),
          user: new Types.ObjectId(userId),
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    return stats as Array<{ _id: string; count: number }>;
  }

  // =============================================================================
  // NEW WORKFLOW ENGINE METHODS
  // =============================================================================

  /**
   * Execute a partial workflow (subset of nodes)
   */
  @HandleErrors('execute partial workflow', 'workflows')
  async executePartial(
    workflowId: string,
    nodeIds: string[],
    userId: string,
    organizationId: string,
    options: { respectLocks?: boolean; dryRun?: boolean } = {},
  ): Promise<
    | WorkflowExecutionDocument
    | { runId: string; status: string; message: string }
  > {
    const workflow = await this.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    // Validate nodes exist
    const workflowNodeIds = workflow.nodes.map((n) => n.id);
    const invalidNodes = nodeIds.filter((id) => !workflowNodeIds.includes(id));
    if (invalidNodes.length > 0) {
      throw new BadRequestException(
        `Invalid node IDs: ${invalidNodes.join(', ')}`,
      );
    }

    if (options.dryRun) {
      return {
        message: 'Dry run complete - validation passed',
        runId: 'dry-run',
        status: 'validated',
      };
    }

    if (!this.workflowExecutionsService) {
      throw new Error(
        'Workflow executions service is not available - cannot track partial workflow execution',
      );
    }

    const execution = await this.workflowExecutionsService.createExecution(
      userId,
      organizationId,
      {
        inputValues: {},
        metadata: {
          executionMode: 'partial',
          selectedNodeIds: nodeIds,
        },
        trigger: WorkflowExecutionTrigger.MANUAL,
        workflow: new Types.ObjectId(workflowId),
      },
    );
    const startedExecution =
      await this.workflowExecutionsService.startExecution(
        execution._id.toString(),
      );
    const runId = execution._id.toString();

    await this.patch(workflowId, {
      status: WorkflowStatus.RUNNING,
    });

    // Start async execution
    this.executePartialAsync(workflowId, runId, nodeIds, options).catch(
      (error) => {
        if (this.logger) {
          this.logger.error('Partial workflow execution failed', error);
        }
      },
    );

    return startedExecution ?? execution;
  }

  /**
   * Internal async execution for partial workflow.
   * Uses WorkflowEngineAdapterService when available, falls back to sequential execution.
   */
  private async executePartialAsync(
    workflowId: string,
    runId: string,
    nodeIds: string[],
    options: { respectLocks?: boolean } = {},
  ): Promise<void> {
    try {
      const workflow = await this.findOne({
        _id: workflowId,
        isDeleted: false,
      });
      if (!workflow) {
        return;
      }

      if (this.workflowEngineAdapter && this.workflowExecutionsService) {
        // Use workflow engine for proper topological execution
        const executableWorkflow =
          this.workflowEngineAdapter.convertToExecutableWorkflow(workflow);
        const totalNodes = nodeIds.length;

        const result = await this.workflowEngineAdapter.executeWorkflow(
          executableWorkflow,
          {
            nodeIds,
            onNodeStatusChange: async (event: NodeStatusChangeEvent) => {
              const node = executableWorkflow.nodes.find(
                (candidate) => candidate.id === event.nodeId,
              );

              await this.workflowExecutionsService?.updateNodeResult(
                runId,
                {
                  completedAt:
                    event.newStatus === 'completed' ||
                    event.newStatus === 'failed' ||
                    event.newStatus === 'skipped'
                      ? new Date()
                      : undefined,
                  error: event.error,
                  nodeId: event.nodeId,
                  nodeType: node?.type ?? 'unknown',
                  output:
                    event.output && typeof event.output === 'object'
                      ? (event.output as Record<string, unknown>)
                      : undefined,
                  progress:
                    event.newStatus === 'completed' ||
                    event.newStatus === 'skipped'
                      ? 100
                      : event.newStatus === 'running'
                        ? 0
                        : undefined,
                  startedAt:
                    event.newStatus === 'running' ? new Date() : undefined,
                  status: this.mapExecutionNodeStatus(event.newStatus),
                },
                totalNodes,
              );

              await this.emitWorkflowEvent(
                workflowId,
                `node-${event.newStatus}`,
                {
                  nodeId: event.nodeId,
                  runId,
                },
              );
            },
            onProgress: async (event: { progress: number }) => {
              await this.patch(workflowId, {
                progress: event.progress,
              });
            },
            respectLocks: options.respectLocks,
          },
        );

        await this.workflowExecutionsService.completeExecution(
          runId,
          result.status === 'failed' ? result.error : undefined,
        );

        if (result.totalCreditsUsed > 0) {
          await this.workflowExecutionsService.setCreditsUsed(
            runId,
            result.totalCreditsUsed,
          );
        }

        const failedNodeId = this.findFirstFailedNodeId(result);
        if (failedNodeId) {
          await this.workflowExecutionsService.setFailedNodeId(
            runId,
            failedNodeId,
          );
        }
      } else {
        // Fallback: no workflow engine available - cannot execute
        throw new Error(
          'Workflow engine adapter is not available - cannot execute workflow nodes',
        );
      }

      await this.patch(workflowId, {
        completedAt: new Date(),
        progress: 100,
        status: WorkflowStatus.COMPLETED,
      });
    } catch (error) {
      if (this.workflowExecutionsService) {
        await this.workflowExecutionsService.completeExecution(
          runId,
          (error as Error)?.message ?? 'Unknown error',
        );
      }

      await this.patch(workflowId, {
        completedAt: new Date(),
        status: WorkflowStatus.FAILED,
      });
    }
  }

  /**
   * Resume execution from a failed run
   */
  @HandleErrors('resume workflow execution', 'workflows')
  async resumeFromFailed(
    workflowId: string,
    runId: string,
    userId: string,
    organizationId: string,
  ): Promise<{ runId: string; status: string; message: string }> {
    const workflow = await this.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    // Find the failed execution from the workflow-executions collection
    const failedRun = await this.workflowExecutionsService?.findOne({
      _id: runId,
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
      workflow: new Types.ObjectId(workflowId),
    });

    if (!failedRun) {
      throw new NotFoundException(`Execution run ${runId} not found`);
    }

    if (failedRun.status !== WorkflowExecutionStatus.FAILED) {
      throw new BadRequestException(`Run ${runId} is not in failed state`);
    }

    if (!failedRun.failedNodeId) {
      throw new BadRequestException('No failed node ID recorded');
    }

    const resumedExecution = await this.executePartial(
      workflowId,
      [failedRun.failedNodeId],
      userId,
      organizationId,
    );

    if ('runId' in resumedExecution) {
      return resumedExecution;
    }

    return {
      message: 'Partial execution started',
      runId: resumedExecution._id.toString(),
      status: resumedExecution.status,
    };
  }

  /**
   * Validate credits for workflow execution
   */
  @HandleErrors('validate credits', 'workflows')
  async validateCredits(
    workflowId: string,
    organizationId: string,
    nodeIds?: string[],
  ): Promise<CreditEstimate> {
    const workflow = await this.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    // Get real organization credit balance
    const availableCredits = this.creditsUtilsService
      ? await this.creditsUtilsService.getOrganizationCreditsBalance(
          organizationId,
        )
      : 0;

    // Filter nodes if specific IDs provided
    let nodes: WorkflowVisualNode[] = workflow.nodes || [];
    if (nodeIds && nodeIds.length > 0) {
      nodes = nodes.filter((n) => nodeIds.includes(n.id));
    }

    // Convert to executable nodes format
    const executableNodes = nodes.map((n) => ({
      config: n.data?.config || {},
      id: n.id,
      inputs: [] as string[],
      label: n.data?.label || n.type,
      type: n.type,
    }));

    return calculateCreditEstimate(
      executableNodes,
      availableCredits,
      DEFAULT_CREDIT_COSTS,
    );
  }

  /**
   * Publish a workflow (change lifecycle to published)
   */
  @HandleErrors('publish workflow', 'workflows')
  async publishWorkflowLifecycle(
    workflowId: string,
    organizationId: string,
  ): Promise<WorkflowEntity> {
    const workflow = await this.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    const updated = await this.patch(workflowId, {
      lifecycle: WorkflowLifecycle.PUBLISHED,
    });

    return EntityFactory.fromDocument(WorkflowEntity, updated);
  }

  /**
   * Archive a workflow (change lifecycle to archived)
   */
  @HandleErrors('archive workflow', 'workflows')
  async archiveWorkflow(
    workflowId: string,
    organizationId: string,
  ): Promise<WorkflowEntity> {
    const workflow = await this.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    const updated = await this.patch(workflowId, {
      lifecycle: WorkflowLifecycle.ARCHIVED,
    });

    return EntityFactory.fromDocument(WorkflowEntity, updated);
  }

  /**
   * Get execution logs for a specific run
   */
  @HandleErrors('get execution logs', 'workflows')
  async getExecutionLogs(
    workflowId: string,
    runId: string,
    organizationId: string,
  ): Promise<Record<string, unknown>> {
    const execution = await this.workflowExecutionsService?.findOne({
      _id: runId,
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
      workflow: new Types.ObjectId(workflowId),
    });

    if (!execution) {
      throw new NotFoundException(`Execution run ${runId} not found`);
    }

    return {
      completedAt: execution.completedAt,
      error: execution.error,
      nodeResults: execution.nodeResults || [],
      runId: execution._id.toString(),
      startedAt: execution.startedAt,
      status: execution.status,
      totalCreditsUsed: execution.creditsUsed,
      workflowId,
    };
  }

  /**
   * Lock nodes (skip execution, use cached output)
   */
  @HandleErrors('lock nodes', 'workflows')
  async lockNodes(
    workflowId: string,
    nodeIds: string[],
    organizationId: string,
  ): Promise<WorkflowEntity> {
    const workflow = await this.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    const currentLocked = workflow.lockedNodeIds || [];
    const newLocked = [...new Set([...currentLocked, ...nodeIds])];

    const updated = await this.patch(workflowId, {
      lockedNodeIds: newLocked,
    });

    return EntityFactory.fromDocument(WorkflowEntity, updated);
  }

  /**
   * Unlock nodes
   */
  @HandleErrors('unlock nodes', 'workflows')
  async unlockNodes(
    workflowId: string,
    nodeIds: string[],
    organizationId: string,
  ): Promise<WorkflowEntity> {
    const workflow = await this.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    const currentLocked = workflow.lockedNodeIds || [];
    const newLocked = currentLocked.filter((id) => !nodeIds.includes(id));

    const updated = await this.patch(workflowId, {
      lockedNodeIds: newLocked,
    });

    return EntityFactory.fromDocument(WorkflowEntity, updated);
  }

  // ===========================================================================
  // WEBHOOK TRIGGER METHODS
  // ===========================================================================

  /**
   * Generate a webhook URL for a workflow
   */
  @HandleErrors('generate webhook', 'workflows')
  async generateWebhook(
    workflowId: string,
    authType: 'none' | 'secret' | 'bearer' = 'secret',
  ): Promise<{
    webhookId: string;
    webhookUrl: string;
    webhookSecret: string | null;
    authType: 'none' | 'secret' | 'bearer';
  }> {
    const webhookId = this.generateWebhookId();
    const webhookSecret =
      authType !== 'none' ? this.generateWebhookSecret() : null;
    const baseUrl = process.env.API_URL || 'https://api.genfeed.ai';

    await this.patch(workflowId, {
      webhookAuthType: authType,
      webhookId,
      webhookSecret,
    });

    return {
      authType,
      webhookId,
      webhookSecret,
      webhookUrl: `${baseUrl}/v1/webhooks/${webhookId}`,
    };
  }

  /**
   * Regenerate webhook secret
   */
  @HandleErrors('regenerate webhook secret', 'workflows')
  async regenerateWebhookSecret(
    workflowId: string,
  ): Promise<{ webhookSecret: string }> {
    const webhookSecret = this.generateWebhookSecret();

    await this.patch(workflowId, { webhookSecret });

    return { webhookSecret };
  }

  /**
   * Delete webhook configuration
   */
  @HandleErrors('delete webhook', 'workflows')
  async deleteWebhook(workflowId: string): Promise<void> {
    await this.model.updateOne(
      { _id: workflowId, isDeleted: false },
      {
        $set: {
          webhookAuthType: 'secret',
        },
        $unset: {
          webhookId: '',
          webhookSecret: '',
        },
      },
    );
  }

  /**
   * Find workflow by webhook ID (for public trigger endpoint)
   */
  @HandleErrors('find by webhook', 'workflows')
  findByWebhookId(webhookId: string): Promise<WorkflowDocument | null> {
    return this.model.findOne({ isDeleted: false, webhookId });
  }

  /**
   * Trigger workflow via webhook
   */
  @HandleErrors('trigger via webhook', 'workflows')
  async triggerViaWebhook(
    webhookId: string,
    payload: Record<string, unknown>,
  ): Promise<{ runId: string; status: string }> {
    const workflow = await this.findByWebhookId(webhookId);

    if (!workflow) {
      throw new NotFoundException('Webhook not found or workflow deleted');
    }

    // Update webhook stats
    await this.model.updateOne(
      {
        _id: workflow._id,
        isDeleted: false,
      },
      {
        $inc: { webhookTriggerCount: 1 },
        $set: { webhookLastTriggeredAt: new Date() },
      },
    );

    if (!workflow.user || !workflow.organization) {
      throw new Error(
        'Systemic workflow templates cannot be executed directly. Clone the workflow first.',
      );
    }

    if (!this.shouldUseNodeExecutor(workflow)) {
      await this.executeWorkflow(workflow._id.toString());
      return {
        runId: workflow._id.toString(),
        status: 'started',
      };
    }

    if (!this.workflowExecutorService) {
      throw new Error(
        'Workflow executor service is not available - cannot trigger workflow',
      );
    }

    const result = await this.workflowExecutorService.executeManualWorkflow(
      workflow._id.toString(),
      workflow.user.toString(),
      workflow.organization.toString(),
      payload,
      {
        triggerSource: 'webhook',
        webhookId,
      },
      WorkflowExecutionTrigger.API,
    );

    return {
      runId: result.executionId,
      status: result.status,
    };
  }

  private shouldUseNodeExecutor(
    workflow:
      | Pick<WorkflowDocument, 'nodes'>
      | Pick<WorkflowEntity, 'nodes'>
      | null
      | undefined,
  ): boolean {
    return Array.isArray(workflow?.nodes) && workflow.nodes.length > 0;
  }

  private mapExecutionNodeStatus(status: string): WorkflowExecutionStatus {
    switch (status) {
      case 'pending':
        return WorkflowExecutionStatus.PENDING;
      case 'running':
        return WorkflowExecutionStatus.RUNNING;
      case 'completed':
      case 'skipped':
        return WorkflowExecutionStatus.COMPLETED;
      case 'failed':
        return WorkflowExecutionStatus.FAILED;
      default:
        return WorkflowExecutionStatus.PENDING;
    }
  }

  private findFirstFailedNodeId(
    result: ExecutionRunResult,
  ): string | undefined {
    for (const [nodeId, nodeResult] of result.nodeResults) {
      if (nodeResult.status === 'failed') {
        return nodeId;
      }
    }

    return undefined;
  }

  /**
   * Generate a unique webhook ID
   */
  private generateWebhookId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `wh_${timestamp}_${random}`;
  }

  /**
   * Generate a secure webhook secret
   */
  private generateWebhookSecret(): string {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let secret = 'whsec_';
    for (let i = 0; i < 32; i++) {
      secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return secret;
  }
}

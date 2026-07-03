import { CreateWorkflowDto } from '@api/collections/workflows/dto/create-workflow.dto';
import { UpdateWorkflowDto } from '@api/collections/workflows/dto/update-workflow.dto';
import { WorkflowEntity } from '@api/collections/workflows/entities/workflow.entity';
import { type WorkflowDocument } from '@api/collections/workflows/schemas/workflow.schema';
import { LegacyWorkflowStepRunner } from '@api/collections/workflows/services/legacy-workflow-step-runner.service';
import {
  WorkflowExecutionQueueService,
  type WorkflowSchedulerSyncRow,
} from '@api/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import {
  buildSystemWorkflowDuplicateMetadata,
  isProtectedSystemWorkflowMetadata,
  SYSTEM_WORKFLOW_METADATA_KEY,
} from '@api/collections/workflows/system-workflow.contract';
import { WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/workflow-templates';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { EntityFactory } from '@api/shared/factories/entity/entity.factory';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import {
  WorkflowExecutionTrigger,
  WorkflowLifecycle,
  WorkflowStatus,
  WorkflowStepStatus,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';

/**
 * Core workflow service: CRUD/templating, lifecycle transitions, node locks,
 * and the ownership guards shared by the workflows controllers.
 *
 * Sibling concerns split out in #754:
 * - `WorkflowTemplateSeederService` — idempotent per-org system workflow seeding
 * - `LegacyWorkflowStepRunner` — step-based (pre-node) execution engine
 * - `WorkflowRunControlService` — partial runs, resume, credits, execution logs
 * - `WorkflowWebhookService` — inbound webhook credentials + trigger path
 */
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
    private readonly legacyWorkflowStepRunner?: LegacyWorkflowStepRunner,
    @Optional()
    private readonly workflowExecutorService?: WorkflowExecutorService,
    @Optional()
    private readonly workflowExecutionQueueService?: WorkflowExecutionQueueService,
  ) {
    super(prisma, 'workflow', logger);
  }

  private assertWorkflowMutable(workflow: Pick<WorkflowDocument, 'metadata'>) {
    if (!isProtectedSystemWorkflowMetadata(workflow.metadata)) {
      return;
    }

    throw new ForbiddenException(
      'System workflows are immutable. Duplicate the workflow before editing or deleting it.',
    );
  }

  /**
   * Upsert or remove the BullMQ job scheduler for one workflow row based on
   * its current schedule/enabled/status state. No-ops when the queue service
   * is not wired (tests, contexts without BullMQ).
   */
  private async syncWorkflowScheduler(
    workflow: WorkflowSchedulerSyncRow,
  ): Promise<void> {
    await this.workflowExecutionQueueService?.syncWorkflowScheduler(workflow);
  }

  /**
   * Soft-delete a workflow and drop its BullMQ job scheduler so the schedule
   * stops firing immediately.
   */
  override async remove(id: string): Promise<WorkflowDocument | null> {
    const removed = await super.remove(id);

    if (removed) {
      await this.syncWorkflowScheduler({ id, isDeleted: true });
    }

    return removed;
  }

  @HandleErrors('create workflow', 'workflows')
  async createWorkflow(
    userId: string,
    organizationId: string,
    workflowData: CreateWorkflowDto,
  ): Promise<WorkflowEntity> {
    const templateMetadata = workflowData.templateId
      ? {
          sourceTemplateId: workflowData.templateId,
          sourceType: 'seeded-template',
        }
      : undefined;
    const { steps, workflowData: mergedWorkflowData } =
      this.applyTemplateDefaults(workflowData, templateMetadata);
    workflowData = mergedWorkflowData;

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
      organization: organizationId,
      progress: 0,
      status: workflowData.status ?? WorkflowStatus.ACTIVE,
      steps,
      user: userId,
    });

    // Register the BullMQ job scheduler when the workflow is created with an
    // enabled schedule (template-seeded or explicit).
    await this.syncWorkflowScheduler(
      workflow as unknown as WorkflowSchedulerSyncRow,
    );

    // If trigger is manual, start execution immediately
    if ((workflowData.trigger as string) === 'manual') {
      this.executeWorkflowCompat(
        String(workflow.id),
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

  /**
   * When creating from a known template, fills edges/inputVariables/nodes/
   * schedule/timezone the caller left empty from the template and seeds the
   * template's steps as pending. Non-template creates pass through unchanged.
   */
  private applyTemplateDefaults(
    workflowData: CreateWorkflowDto,
    templateMetadata: Record<string, unknown> | undefined,
  ): { steps: CreateWorkflowDto['steps']; workflowData: CreateWorkflowDto } {
    if (
      !workflowData.templateId ||
      !WORKFLOW_TEMPLATES[workflowData.templateId]
    ) {
      return { steps: workflowData.steps || [], workflowData };
    }

    const template = WORKFLOW_TEMPLATES[workflowData.templateId];
    const routineMetadata = template.routine
      ? { productizedRoutine: template.routine }
      : {};
    const shouldUseTemplateEdges =
      !workflowData.edges || workflowData.edges.length === 0;
    const shouldUseTemplateInputVariables =
      !workflowData.inputVariables || workflowData.inputVariables.length === 0;
    const shouldUseTemplateNodes =
      !workflowData.nodes || workflowData.nodes.length === 0;

    return {
      steps: template.steps.map((step) => ({
        ...step,
        label: step.name,
        status: WorkflowStepStatus.PENDING,
      })),
      workflowData: {
        ...workflowData,
        edges: shouldUseTemplateEdges ? template.edges : workflowData.edges,
        inputVariables: shouldUseTemplateInputVariables
          ? template.inputVariables
          : workflowData.inputVariables,
        isScheduleEnabled:
          workflowData.isScheduleEnabled ?? template.isScheduleEnabled,
        metadata: {
          ...templateMetadata,
          ...routineMetadata,
          ...(workflowData.metadata ?? {}),
        },
        nodes: shouldUseTemplateNodes ? template.nodes : workflowData.nodes,
        schedule: workflowData.schedule ?? template.schedule,
        timezone: workflowData.timezone ?? template.timezone,
      },
    };
  }

  /**
   * Dispatches a manual execution to the right engine: node-based workflows
   * run through `WorkflowExecutorService`, step-based workflows through the
   * `LegacyWorkflowStepRunner`.
   */
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
      organization: organizationId,
      user: userId,
    });

    if (!workflowDoc) {
      throw new NotFoundException('Workflow not found');
    }

    if (!this.shouldUseNodeExecutor(workflowDoc)) {
      if (!this.legacyWorkflowStepRunner) {
        throw new Error(
          'Legacy workflow step runner is not available - cannot execute step workflow',
        );
      }

      await this.legacyWorkflowStepRunner.executeWorkflow(workflowId);
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

  private shouldUseNodeExecutor(
    workflow:
      | Pick<WorkflowDocument, 'nodes'>
      | Pick<WorkflowEntity, 'nodes'>
      | null
      | undefined,
  ): boolean {
    return Array.isArray(workflow?.nodes) && workflow.nodes.length > 0;
  }

  async getWorkflowTemplates() {
    return await Promise.resolve(Object.values(WORKFLOW_TEMPLATES));
  }

  async cloneWorkflow(
    workflowId: string,
    userId: string,
    organizationId: string,
    targetBrandId?: string,
  ): Promise<WorkflowEntity> {
    const workflowDoc = await this.findVisibleOrThrow(workflowId, {
      organization: organizationId,
      user: userId,
    });
    const isProtectedSystemWorkflow = isProtectedSystemWorkflowMetadata(
      workflowDoc.metadata,
    );
    const sourceWorkflowId = String(workflowDoc._id ?? workflowDoc.id);
    const sourceLabel = workflowDoc.label ?? workflowDoc.name ?? 'Workflow';

    const clonedWorkflow = await this.create({
      ...workflowDoc,
      brands: isProtectedSystemWorkflow
        ? workflowDoc.brands
        : targetBrandId
          ? [targetBrandId]
          : workflowDoc.brands,
      completedAt: undefined,
      defaultRecurringBrandId: isProtectedSystemWorkflow
        ? undefined
        : targetBrandId || workflowDoc.defaultRecurringBrandId,
      executionCount: 0,
      isScheduleEnabled: isProtectedSystemWorkflow
        ? false
        : workflowDoc.isScheduleEnabled,
      label: `${sourceLabel} (Copy)`,
      lastExecutedAt: undefined,
      lockedNodeIds: isProtectedSystemWorkflow
        ? []
        : (workflowDoc.lockedNodeIds ?? []),
      metadata: buildSystemWorkflowDuplicateMetadata(
        workflowDoc.metadata,
        sourceWorkflowId,
      ),
      organization: organizationId,
      progress: 0,
      recurrence: undefined,
      schedule: isProtectedSystemWorkflow ? undefined : workflowDoc.schedule,
      startedAt: undefined,
      status: WorkflowStatus.DRAFT,
      user: userId,
    } as unknown as CreateWorkflowDto);

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
      organization: organizationId,
      user: userId,
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }
    this.assertWorkflowMutable(workflow);

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
    const workflows = await this.prisma.workflow.findMany({
      select: { status: true },
      where: {
        isDeleted: false,
        organizationId,
        userId,
      },
    });

    const counts = workflows.reduce<Map<string, number>>((acc, workflow) => {
      const status = String(workflow.status);
      acc.set(status, (acc.get(status) ?? 0) + 1);
      return acc;
    }, new Map());

    return Array.from(counts.entries()).map(([_id, count]) => ({
      _id,
      count,
    }));
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
      organization: organizationId,
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }
    this.assertWorkflowMutable(workflow);

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
      organization: organizationId,
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }
    this.assertWorkflowMutable(workflow);

    const updated = await this.patch(workflowId, {
      lifecycle: WorkflowLifecycle.ARCHIVED,
    });

    return EntityFactory.fromDocument(WorkflowEntity, updated);
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
      organization: organizationId,
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }
    this.assertWorkflowMutable(workflow);

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
      organization: organizationId,
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }
    this.assertWorkflowMutable(workflow);

    const currentLocked = workflow.lockedNodeIds || [];
    const newLocked = currentLocked.filter((id) => !nodeIds.includes(id));

    const updated = await this.patch(workflowId, {
      lockedNodeIds: newLocked,
    });

    return EntityFactory.fromDocument(WorkflowEntity, updated);
  }

  /**
   * Fetch a workflow the caller owns (org-scoped, optionally user-scoped) or
   * throw the canonical {@link NotFoundException}. Single source of truth for
   * the ownership-guard preamble that used to be duplicated across the
   * workflows controllers with three divergent 404 shapes.
   */
  async findOwnedOrThrow(
    workflowId: string,
    scope: { organization: string; user?: string },
  ): Promise<WorkflowDocument> {
    const workflow = await this.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: scope.organization,
      ...(scope.user ? { user: scope.user } : {}),
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    return workflow;
  }

  /**
   * Fetch a workflow the caller may inspect. Protected system workflows are
   * organization-visible even when their executable row is owned by the org
   * bootstrap user.
   */
  async findVisibleOrThrow(
    workflowId: string,
    scope: { organization: string; user: string },
  ): Promise<WorkflowDocument> {
    const workflow = await this.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: scope.organization,
      OR: [
        { user: scope.user },
        {
          metadata: {
            equals: 'organization',
            path: [SYSTEM_WORKFLOW_METADATA_KEY, 'visibility'],
          },
        },
      ],
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    return workflow;
  }

  /**
   * Fetch a workflow the caller may mutate. System workflows are inspectable and
   * duplicable, but canonical rows are immutable.
   */
  async findMutableOwnedOrThrow(
    workflowId: string,
    scope: { organization: string; user?: string },
  ): Promise<WorkflowDocument> {
    const workflow = await this.findOwnedOrThrow(workflowId, scope);
    this.assertWorkflowMutable(workflow);
    return workflow;
  }
}

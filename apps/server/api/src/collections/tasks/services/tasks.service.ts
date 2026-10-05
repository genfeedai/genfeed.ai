import { CreateTaskDto } from '@api/collections/tasks/dto/create-task.dto';
import { UpdateTaskDto } from '@api/collections/tasks/dto/update-task.dto';
import {
  type TaskDocument,
  type TaskStatus,
} from '@api/collections/tasks/schemas/task.schema';
import {
  TaskActionsService,
  type TaskEventInput,
} from '@api/collections/tasks/services/task-actions.service';
import {
  buildTaskColumnPatch,
  readTaskConfigObject,
  TASK_CONFIG_FIELDS,
  TASK_SCALAR_FIELDS,
  type TaskConditionalPatch,
} from '@api/collections/tasks/services/task-persistence.util';
import {
  type PlanningThreadResult,
  TaskPlanningService,
} from '@api/collections/tasks/services/task-planning.service';
import { TaskRoutingService } from '@api/collections/tasks/services/task-routing.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import { pickDefinedFields } from '@api/shared/utils/object/pick-defined-fields.util';
import type { PopulateOption } from '@genfeedai/contracts/interfaces';
import {
  type Prisma,
  WorkflowExecutionStatus as PrismaWorkflowExecutionStatus,
} from '@genfeedai/prisma';
import type { AggregationOptions } from '@libs/interfaces/query.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { getTenantContext } from '@libs/prisma/tenant-context';
import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common';

const STATUS_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  backlog: ['todo', 'in_progress', 'cancelled'],
  blocked: ['todo', 'in_progress', 'cancelled'],
  cancelled: ['backlog', 'todo'],
  done: ['in_progress'],
  failed: ['backlog', 'in_progress'],
  in_progress: ['blocked', 'in_review', 'done', 'failed', 'cancelled'],
  in_review: ['in_progress', 'done', 'cancelled'],
  todo: ['in_progress', 'blocked', 'backlog', 'cancelled'],
};

const TASK_RELATION_INCLUDE = {
  approvedOutputs: { select: { id: true } },
  linkedExecutions: { select: { id: true } },
  linkedOutputs: { select: { id: true } },
} as const;

const TASK_RELATION_POPULATE: PopulateOption[] = [
  { path: 'approvedOutputs', select: ['id'] },
  { path: 'linkedExecutions', select: ['id'] },
  { path: 'linkedOutputs', select: ['id'] },
];

type TaskWriteInput = CreateTaskDto & {
  approvedOutputIds?: string[];
  brandId?: string;
  config?: Record<string, unknown>;
  elevenlabsVoiceId?: string;
  identifier?: string;
  linkedApprovalIds?: string[];
  linkedExecutionIds?: string[];
  linkedIssueId?: string;
  linkedOutputIds?: string[];
  organizationId?: string;
  reviewState?: string;
  taskNumber?: number;
  userId?: string;
  [key: string]: unknown;
};

/**
 * Thin persistence / CRUD / lifecycle surface for tasks. Routing classification
 * lives in {@link TaskRoutingService}, review-gate + output actions + realtime
 * broadcast in {@link TaskActionsService}, and planning/follow-up orchestration
 * in {@link TaskPlanningService}. The review/output/planning methods below are
 * thin delegators so the HTTP contract (the controller still calls them here) is
 * preserved.
 */
@Injectable()
export class TasksService extends BaseService<
  TaskDocument,
  CreateTaskDto,
  UpdateTaskDto,
  Prisma.TaskWhereInput
> {
  constructor(
    public readonly prisma: PrismaService,
    readonly logger: LoggerService,
    private readonly taskRoutingService: TaskRoutingService,
    @Inject(forwardRef(() => TaskActionsService))
    private readonly taskActionsService: TaskActionsService,
    @Inject(forwardRef(() => TaskPlanningService))
    private readonly taskPlanningService: TaskPlanningService,
  ) {
    super(prisma, 'task', logger);
  }

  override async create(createDto: CreateTaskDto): Promise<TaskDocument> {
    const input = createDto as TaskWriteInput;
    const normalizedTitle = this.buildTaskTitle(createDto);
    const routing = input.request
      ? await this.taskRoutingService.buildRoutingDecision(
          createDto,
          normalizedTitle,
        )
      : null;
    const resolved = { ...input, ...(routing ?? {}) };
    const resolvedRecord = resolved as Record<string, unknown>;
    const config = {
      ...this.readRecord(input.config),
      ...pickDefinedFields(resolvedRecord, TASK_CONFIG_FIELDS),
      linkedApprovalIds: input.linkedApprovalIds ?? [],
      linkedEntities: input.linkedEntities ?? [],
      outputType: resolved.outputType ?? 'ingredient',
      platforms: input.platforms ?? [],
      request: input.request ?? input.description?.trim() ?? normalizedTitle,
      reviewTriggered: resolved.reviewTriggered ?? false,
      skillVariantIds: resolved.skillVariantIds ?? [],
      skillsUsed: resolved.skillsUsed ?? [],
    };

    const createPayload: Record<string, unknown> = {
      ...pickDefinedFields(resolvedRecord, TASK_SCALAR_FIELDS),
      config,
      eventStream: input.eventStream ?? [],
      priority: input.priority ?? 'medium',
      progress:
        input.progress ??
        (routing
          ? {
              activeRunCount: 0,
              message: 'Task queued.',
              percent: 0,
              stage: 'queued',
            }
          : undefined),
      status: resolved.status ?? 'backlog',
      title: normalizedTitle,
      ...(input.approvedOutputIds !== undefined && {
        approvedOutputs: {
          connect: input.approvedOutputIds.map((id) => ({ id })),
        },
      }),
      ...(input.linkedOutputIds !== undefined && {
        linkedOutputs: {
          connect: input.linkedOutputIds.map((id) => ({ id })),
        },
      }),
      ...(input.linkedExecutionIds !== undefined && {
        linkedExecutions: {
          connect: input.linkedExecutionIds.map((id) => ({ id })),
        },
      }),
    };

    return super.create(createPayload as unknown as CreateTaskDto, [
      ...TASK_RELATION_POPULATE,
    ]);
  }

  override findAll(
    input: unknown,
    options: AggregationOptions,
    enableCache: boolean = true,
  ) {
    const inputRecord = this.readRecord(input);
    return super.findAll(
      {
        ...inputRecord,
        include: {
          ...this.readRecord(inputRecord.include),
          ...TASK_RELATION_INCLUDE,
        },
      },
      options,
      enableCache,
    );
  }

  override async findOne(
    params: Record<string, unknown>,
    populate: PopulateOption[] = [],
  ): Promise<TaskDocument | null> {
    // Always require isDeleted: false unless caller explicitly opts in (admin paths).
    const scopedParams: Record<string, unknown> = {
      isDeleted: false,
      ...params,
    };
    const requestedPaths = new Set(populate.map((option) => option.path));
    return super.findOne(scopedParams, [
      ...populate,
      ...TASK_RELATION_POPULATE.filter(
        (option) => !requestedPaths.has(option.path),
      ),
    ]);
  }

  override async patch(
    id: string,
    updateDto: UpdateTaskDto | Record<string, unknown>,
  ): Promise<TaskDocument> {
    const input = updateDto as TaskWriteInput;
    const configPatch = pickDefinedFields(input, TASK_CONFIG_FIELDS);
    const hasConfigPatch =
      Object.keys(configPatch).length > 0 || input.config !== undefined;
    const newStatus = input.status as TaskStatus | undefined;
    let existing:
      | { config: Prisma.JsonValue; status: string }
      | null
      | undefined;

    if (newStatus || hasConfigPatch) {
      // `super.patch` writes by id; resolve the pre-read under the request tenant.
      const tenantOrganizationId = getTenantContext()?.organizationId;
      const existingTask = await this.findOne(
        tenantOrganizationId
          ? scopedWhere(tenantOrganizationId, { id })
          : { id },
      );
      if (!existingTask) {
        throw new NotFoundException('Task', id);
      }
      existing = {
        config: existingTask.config as Prisma.JsonValue,
        status: existingTask.status,
      };
    }

    if (newStatus && existing) {
      this.validateStatusTransition(existing.status as TaskStatus, newStatus);
    }

    const persistencePatch: Record<string, unknown> = {
      ...buildTaskColumnPatch(input, existing?.config),
      ...(input.approvedOutputIds !== undefined && {
        approvedOutputs: {
          set: input.approvedOutputIds.map((outputId) => ({ id: outputId })),
        },
      }),
      ...(input.linkedOutputIds !== undefined && {
        linkedOutputs: {
          set: input.linkedOutputIds.map((outputId) => ({ id: outputId })),
        },
      }),
      // Linking executions starts a new cycle that still needs its rollup.
      ...(input.linkedExecutionIds !== undefined && {
        linkedExecutions: {
          set: input.linkedExecutionIds.map((executionId) => ({
            id: executionId,
          })),
        },
        rolledUpAt: null,
      }),
    };

    return super.patch(id, persistencePatch, [...TASK_RELATION_POPULATE]);
  }

  normalizeTaskDocument(document: unknown): TaskDocument {
    return this.normalizeDocument(document);
  }

  protected override normalizeDocument(document: unknown): TaskDocument {
    const record = super.normalizeDocument(document) as Record<string, unknown>;
    const config = this.readRecord(record.config);
    const normalized = { ...config, ...record, config } as TaskDocument;

    normalized.approvedOutputIds = this.readRelationIds(record.approvedOutputs);
    normalized.linkedExecutionIds = this.readRelationIds(
      record.linkedExecutions,
    );
    normalized.linkedOutputIds = this.readRelationIds(record.linkedOutputs);
    normalized.linkedApprovalIds = Array.isArray(config.linkedApprovalIds)
      ? config.linkedApprovalIds.map(String)
      : [];
    normalized.linkedEntities = Array.isArray(config.linkedEntities)
      ? (config.linkedEntities as TaskDocument['linkedEntities'])
      : [];
    normalized.outputType =
      (config.outputType as TaskDocument['outputType']) ?? 'ingredient';
    normalized.platforms = Array.isArray(config.platforms)
      ? config.platforms.map(String)
      : [];
    normalized.request =
      typeof config.request === 'string'
        ? config.request
        : (normalized.description ?? normalized.title ?? 'Untitled task');
    normalized.reviewTriggered = config.reviewTriggered === true;
    normalized.skillVariantIds = Array.isArray(config.skillVariantIds)
      ? config.skillVariantIds.map(String)
      : [];
    normalized.skillsUsed = Array.isArray(config.skillsUsed)
      ? config.skillsUsed.map(String)
      : [];
    normalized.priority = String(
      normalized.priority,
    ).toLowerCase() as TaskDocument['priority'];
    normalized.status = String(normalized.status).toLowerCase() as TaskStatus;
    return normalized;
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readRelationIds(value: unknown): string[] {
    return Array.isArray(value)
      ? value.flatMap((entry) => {
          const record = this.readRecord(entry);
          return typeof record.id === 'string' ? [record.id] : [];
        })
      : [];
  }

  async findByIdentifier(
    identifier: string,
    organizationId: string,
  ): Promise<TaskDocument | null> {
    return this.findOne(scopedWhere(organizationId, { identifier }));
  }

  async findChildren(
    taskId: string,
    organizationId: string,
  ): Promise<TaskDocument[]> {
    return (await this.delegate.findMany({
      include: TASK_RELATION_INCLUDE,
      where: scopedWhere(organizationId, { parentId: taskId }),
    })) as unknown as TaskDocument[];
  }

  async areAllChildrenDone(
    taskId: string,
    organizationId: string,
  ): Promise<boolean> {
    const children = await this.findChildren(taskId, organizationId);
    if (children.length === 0) return false;
    return children.every(
      (child) => child.status === 'done' || child.status === 'cancelled',
    );
  }

  async checkout(
    taskId: string,
    agentId: string,
    runId: string,
    organizationId: string,
  ): Promise<TaskDocument | null> {
    const existing = await this.delegate.findFirst({
      where: scopedWhere(organizationId, {
        id: taskId,
        OR: [{ checkoutAgentId: null }, { checkoutAgentId: agentId }],
      }),
    });

    if (!existing) return null;

    // Use updateMany so organizationId is atomically enforced in the write predicate
    // (defense-in-depth beyond the findFirst guard above).
    await this.delegate.updateMany({
      data: {
        checkedOutAt: new Date(),
        checkoutAgentId: agentId,
        checkoutRunId: runId,
        status: 'in_progress',
      },
      where: scopedWhere(organizationId, { id: taskId }),
    });

    const checkedOut = await this.delegate.findFirst({
      include: TASK_RELATION_INCLUDE,
      where: scopedWhere(organizationId, { id: taskId }),
    });
    return checkedOut ? this.normalizeTaskDocument(checkedOut) : null;
  }

  /**
   * Claim the execution-rollup lease of an in-progress task. The predicate is
   * part of the write, so among concurrent callers (API and workers) exactly
   * one wins until the lease expires; an expired lease can be re-claimed.
   */
  async acquireRollupLease(
    taskId: string,
    organizationId: string,
    owner: string,
    ttlMs: number,
    now = new Date(),
  ): Promise<boolean> {
    const { count } = await this.delegate.updateMany({
      data: {
        rollupLeaseExpiresAt: new Date(now.getTime() + ttlMs),
        rollupLeaseOwner: owner,
      },
      where: scopedWhere(organizationId, {
        id: taskId,
        OR: [
          { rollupLeaseExpiresAt: null },
          { rollupLeaseExpiresAt: { lte: now } },
        ],
        rolledUpAt: null,
        status: 'in_progress',
      }),
    });
    return count === 1;
  }

  /**
   * In-progress tasks whose linked executions have all settled but that were
   * never rolled up: the terminal event was lost, or a lease holder died or
   * failed before its final write. System-wide (no tenant context); each
   * candidate is then rolled up under its own organization.
   */
  async findStalledRollupCandidates(options: {
    createdAfter: Date;
    limit: number;
    now: Date;
    settledBefore: Date;
  }): Promise<Array<{ id: string; organizationId: string }>> {
    const { createdAfter, limit, now, settledBefore } = options;
    // tenant-scope-ignore: platform-wide recovery sweep run by the workers schedule across every organization, like StalePendingSystemExecutionFinderService; each candidate is then rolled up under its own organizationId
    return this.prisma.task.findMany({
      orderBy: { updatedAt: 'asc' },
      select: { id: true, organizationId: true },
      take: limit,
      where: {
        isDeleted: false,
        linkedExecutions: {
          every: {
            status: {
              in: [
                PrismaWorkflowExecutionStatus.COMPLETED,
                PrismaWorkflowExecutionStatus.FAILED,
                PrismaWorkflowExecutionStatus.CANCELLED,
              ],
            },
          },
          some: {},
        },
        OR: [
          { rollupLeaseExpiresAt: null },
          { rollupLeaseExpiresAt: { lte: now } },
        ],
        createdAt: { gte: createdAfter },
        rolledUpAt: null,
        status: 'in_progress',
        updatedAt: { lte: settledBefore },
      },
    });
  }

  /**
   * Apply a column/config patch only while the task still matches `expected`
   * (checked inside the write). Returns null when it no longer matches, so a
   * stale writer or an expired lease holder cannot overwrite a newer state.
   */
  async patchIfMatches(
    taskId: string,
    organizationId: string,
    expected: { rollupLeaseOwner?: string; status: TaskStatus },
    patch: TaskConditionalPatch,
  ): Promise<TaskDocument | null> {
    const { config, ...columns } = patch;
    if (columns.status) {
      this.validateStatusTransition(expected.status, columns.status);
    }
    const where = scopedWhere(organizationId, { id: taskId, ...expected });
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.task.findFirst({
        select: { config: true },
        where,
      });
      if (!existing) return null;
      const { count } = await transaction.task.updateMany({
        data: {
          ...columns,
          ...(config
            ? {
                config: { ...readTaskConfigObject(existing.config), ...config },
              }
            : {}),
        },
        where,
      });
      if (count !== 1) return null;
      const updated = await transaction.task.findFirst({
        include: TASK_RELATION_INCLUDE,
        where: scopedWhere(organizationId, { id: taskId }),
      });
      return updated ? this.normalizeTaskDocument(updated) : null;
    });
  }

  async release(
    taskId: string,
    agentId: string,
    organizationId: string,
  ): Promise<TaskDocument> {
    await findOrThrow(
      this.delegate,
      {
        where: scopedWhere(organizationId, {
          id: taskId,
          checkoutAgentId: agentId,
        }),
      },
      'Task',
      taskId,
    );

    // Use updateMany so organizationId is atomically enforced in the write predicate.
    await this.delegate.updateMany({
      data: {
        checkedOutAt: null,
        checkoutAgentId: null,
        checkoutRunId: null,
      },
      where: scopedWhere(organizationId, { id: taskId }),
    });

    const released = await this.delegate.findFirst({
      include: TASK_RELATION_INCLUDE,
      where: scopedWhere(organizationId, { id: taskId }),
    });
    if (!released) throw new NotFoundException('Task', taskId);
    return this.normalizeTaskDocument(released);
  }

  // ===========================================================================
  // Review / output actions — thin delegators to TaskActionsService.
  // ===========================================================================

  async approve(
    id: string,
    organizationId: string,
    userId?: string,
  ): Promise<TaskDocument> {
    return this.taskActionsService.approve(id, organizationId, userId);
  }

  async requestChanges(
    id: string,
    organizationId: string,
    userId: string,
    reason: string,
  ): Promise<TaskDocument> {
    return this.taskActionsService.requestChanges(
      id,
      organizationId,
      userId,
      reason,
    );
  }

  async dismiss(
    id: string,
    organizationId: string,
    userId: string,
    reason?: string,
  ): Promise<TaskDocument> {
    return this.taskActionsService.dismiss(id, organizationId, userId, reason);
  }

  async keepOutput(
    id: string,
    outputId: string,
    organizationId: string,
    userId?: string,
  ): Promise<TaskDocument> {
    return this.taskActionsService.keepOutput(
      id,
      outputId,
      organizationId,
      userId,
    );
  }

  async unkeepOutput(
    id: string,
    outputId: string,
    organizationId: string,
  ): Promise<TaskDocument> {
    return this.taskActionsService.unkeepOutput(id, outputId, organizationId);
  }

  async trashOutput(
    id: string,
    outputId: string,
    organizationId: string,
    userId?: string,
  ): Promise<TaskDocument> {
    return this.taskActionsService.trashOutput(
      id,
      outputId,
      organizationId,
      userId,
    );
  }

  async attachOutput(
    id: string,
    outputId: string,
    organizationId: string,
    userId: string,
  ): Promise<TaskDocument> {
    return this.taskActionsService.attachOutput(
      id,
      outputId,
      organizationId,
      userId,
    );
  }

  async recordTaskEvent(
    id: string,
    organizationId: string,
    userId: string,
    event: TaskEventInput,
    patch: Record<string, unknown> = {},
  ): Promise<TaskDocument> {
    return this.taskActionsService.recordTaskEvent(
      id,
      organizationId,
      userId,
      event,
      patch,
    );
  }

  async recordTaskEventIfMatches(
    id: string,
    organizationId: string,
    userId: string,
    event: TaskEventInput,
    patch: TaskConditionalPatch,
    expected: { rollupLeaseOwner?: string; status: TaskStatus },
  ): Promise<TaskDocument | null> {
    return this.taskActionsService.recordTaskEventIfMatches(
      id,
      organizationId,
      userId,
      event,
      patch,
      expected,
    );
  }

  // ===========================================================================
  // Planning / follow-up orchestration — thin delegators to TaskPlanningService.
  // ===========================================================================

  async openPlanningThread(
    id: string,
    organizationId: string,
    userId: string,
  ): Promise<PlanningThreadResult> {
    return this.taskPlanningService.openPlanningThread(
      id,
      organizationId,
      userId,
    );
  }

  async getPlanningPrompt(id: string, organizationId: string): Promise<string> {
    return this.taskPlanningService.getPlanningPrompt(id, organizationId);
  }

  async createFollowUpTasks(
    id: string,
    organizationId: string,
    userId: string,
  ): Promise<TaskDocument[]> {
    return this.taskPlanningService.createFollowUpTasks(
      id,
      organizationId,
      userId,
    );
  }

  /**
   * Fetch an org-scoped, non-deleted task or throw. Public so the extracted
   * task services ({@link TaskActionsService}, {@link TaskPlanningService}) can
   * reuse the canonical lookup.
   */
  async requireTask(id: string, organizationId: string): Promise<TaskDocument> {
    const task = await this.findOne(scopedWhere(organizationId, { id }));
    if (!task) throw new NotFoundException('Task', id);
    return task;
  }

  private buildTaskTitle(createDto: CreateTaskDto): string {
    if (createDto.title?.trim()) {
      return createDto.title.trim();
    }
    const input = createDto as TaskWriteInput;
    const request = input.request ?? '';
    const compactRequest = request.replace(/\s+/g, ' ').trim();
    if (!compactRequest) return 'Untitled task';
    if (compactRequest.length <= 72) return compactRequest;
    return `${compactRequest.slice(0, 69).trimEnd()}...`;
  }

  private validateStatusTransition(
    currentStatus: TaskStatus,
    newStatus: TaskStatus,
  ): void {
    if (currentStatus === newStatus) return;

    const allowed = STATUS_TRANSITIONS[currentStatus];
    if (!allowed?.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition from '${currentStatus}' to '${newStatus}'. Allowed: ${allowed?.join(', ') ?? 'none'}`,
      );
    }
  }
}

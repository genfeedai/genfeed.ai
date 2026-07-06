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
  type PlanningThreadResult,
  TaskPlanningService,
} from '@api/collections/tasks/services/task-planning.service';
import { TaskRoutingService } from '@api/collections/tasks/services/task-routing.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
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

type CreateTaskDtoExtended = CreateTaskDto & {
  platforms?: string[];
  request?: string;
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
    const extended = createDto as CreateTaskDtoExtended;
    const normalizedTitle = this.buildTaskTitle(createDto);
    const routing = extended.request
      ? await this.taskRoutingService.buildRoutingDecision(
          createDto,
          normalizedTitle,
        )
      : null;

    const createPayload = {
      ...createDto,
      ...(routing ?? {}),
      approvedOutputIds: [],
      eventStream: [],
      linkedApprovalIds: [],
      linkedOutputIds: [],
      linkedRunIds: [],
      platforms: extended.platforms ?? [],
      progress: routing
        ? {
            activeRunCount: 0,
            message: 'Task queued.',
            percent: 0,
            stage: 'queued',
          }
        : undefined,
      title: normalizedTitle,
    } as CreateTaskDto & Record<string, unknown>;

    return super.create(createPayload as CreateTaskDto);
  }

  override async findOne(
    params: Record<string, unknown>,
  ): Promise<TaskDocument | null> {
    // Always require isDeleted: false unless caller explicitly opts in (admin paths).
    const scopedParams: Record<string, unknown> = {
      isDeleted: false,
      ...params,
    };
    return super.findOne(scopedParams);
  }

  override async patch(
    id: string,
    updateDto: UpdateTaskDto | Record<string, unknown>,
  ): Promise<TaskDocument> {
    const newStatus = (updateDto as Record<string, unknown>).status as
      | TaskStatus
      | undefined;

    if (newStatus) {
      const existing = await super.findOne({
        id,
        isDeleted: false,
      });

      if (existing) {
        this.validateStatusTransition(existing.status, newStatus);
      }
    }

    return super.patch(id, updateDto);
  }

  async findByIdentifier(
    identifier: string,
    organizationId?: string,
  ): Promise<TaskDocument | null> {
    const filter: Record<string, unknown> = { identifier, isDeleted: false };
    if (organizationId) {
      filter.organizationId = organizationId;
    }
    return this.findOne(filter);
  }

  async findChildren(
    taskId: string,
    organizationId: string,
  ): Promise<TaskDocument[]> {
    return (await this.delegate.findMany({
      where: {
        isDeleted: false,
        organizationId,
        parentId: taskId,
      },
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
      where: {
        id: taskId,
        isDeleted: false,
        organizationId,
        OR: [{ checkoutAgentId: null }, { checkoutAgentId: agentId }],
      },
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
      where: { id: taskId, organizationId, isDeleted: false },
    });

    return (await this.delegate.findFirst({
      where: { id: taskId, organizationId, isDeleted: false },
    })) as unknown as TaskDocument;
  }

  async release(
    taskId: string,
    agentId: string,
    organizationId: string,
  ): Promise<TaskDocument> {
    await findOrThrow(
      this.delegate,
      {
        where: {
          id: taskId,
          checkoutAgentId: agentId,
          isDeleted: false,
          organizationId,
        },
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
      where: { id: taskId, organizationId, isDeleted: false },
    });

    return (await this.delegate.findFirst({
      where: { id: taskId, organizationId, isDeleted: false },
    })) as unknown as TaskDocument;
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
    const task = await this.findOne({ id, isDeleted: false, organizationId });
    if (!task) throw new NotFoundException('Task', id);
    return task;
  }

  private buildTaskTitle(createDto: CreateTaskDto): string {
    if (createDto.title?.trim()) {
      return createDto.title.trim();
    }
    const extended = createDto as CreateTaskDtoExtended;
    const request = extended.request ?? '';
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

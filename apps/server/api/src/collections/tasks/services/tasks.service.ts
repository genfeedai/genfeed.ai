import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { SkillDocument } from '@api/collections/skills/schemas/skill.schema';
import { SkillsService } from '@api/collections/skills/services/skills.service';
import { CreateTaskDto } from '@api/collections/tasks/dto/create-task.dto';
import { UpdateTaskDto } from '@api/collections/tasks/dto/update-task.dto';
import {
  Task,
  type TaskDocument,
  type TaskProgress,
  type TaskStatus,
} from '@api/collections/tasks/schemas/task.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

/**
 * Valid status transitions for task lifecycle.
 * Key = current status, Value = set of allowed next statuses.
 */
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

const PLANNING_THREAD_SOURCE_PREFIX = 'workspace-planning:';
const PLANNING_THREAD_TITLE_PREFIX = 'Plan next steps: ';

type TaskRoutingDecision = Pick<
  TaskDocument,
  | 'chosenModel'
  | 'chosenProvider'
  | 'executionPathUsed'
  | 'outputType'
  | 'resultPreview'
  | 'reviewState'
  | 'reviewTriggered'
  | 'routingSummary'
  | 'skillVariantIds'
  | 'skillsUsed'
  | 'status'
>;

type AiTaskIntent = {
  channel?: string;
  modality: 'image' | 'text' | 'video';
  outputType: TaskDocument['outputType'];
  workflowStage: 'creation';
};

type PlanningThreadResult = {
  created: boolean;
  seeded: boolean;
  threadId: string;
};

type TaskEventInput = {
  payload?: Record<string, unknown>;
  timestamp?: Date;
  type: string;
};

type TaskRealtimePayload = {
  event: {
    id: string;
    payload?: Record<string, unknown>;
    timestamp: string;
    type: string;
  };
  organizationId: string;
  progress: TaskProgress;
  room: string;
  task: Record<string, unknown>;
  taskId: string;
  userId: string;
};

type FollowUpPlanStep = {
  outputType?: TaskDocument['outputType'];
  request: string;
  title: string;
};

type CreateTaskDtoExtended = CreateTaskDto & {
  brand?: string;
  organization?: string;
  platforms?: string[];
  request?: string;
  user?: string;
};

@Injectable()
export class TasksService extends BaseService<
  TaskDocument,
  CreateTaskDto,
  UpdateTaskDto
> {
  constructor(
    @InjectModel(Task.name, DB_CONNECTIONS.CLOUD)
    model: AggregatePaginateModel<TaskDocument>,
    logger: LoggerService,
    private readonly skillsService: SkillsService,
    private readonly ingredientsService: IngredientsService,
    private readonly agentThreadsService: AgentThreadsService,
    private readonly agentMessagesService: AgentMessagesService,
    private readonly agentRunsService: AgentRunsService,
    private readonly notificationsPublisher: NotificationsPublisherService,
  ) {
    super(model, logger);
  }

  override async create(createDto: CreateTaskDto): Promise<TaskDocument> {
    const extended = createDto as CreateTaskDtoExtended;
    const routing = extended.request
      ? await this.buildRoutingDecision(createDto)
      : null;

    const normalizedTitle = this.buildTaskTitle(createDto);

    return super.create({
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
    });
  }

  override async findOne(
    params: Record<string, unknown>,
  ): Promise<TaskDocument | null> {
    return super.findOne(params);
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
        _id: new Types.ObjectId(id),
        isDeleted: false,
      });

      if (existing) {
        this.validateStatusTransition(existing.status, newStatus);
      }
    }

    return super.patch(id, updateDto);
  }

  async findByIdentifier(identifier: string): Promise<TaskDocument | null> {
    return this.model.findOne({
      identifier,
      isDeleted: false,
    });
  }

  async findChildren(
    taskId: string,
    organizationId: string,
  ): Promise<TaskDocument[]> {
    return this.model.find({
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
      parentId: new Types.ObjectId(taskId),
    });
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
  ): Promise<TaskDocument | null> {
    const filter = {
      _id: new Types.ObjectId(taskId),
      $or: [
        { checkoutAgentId: null },
        { checkoutAgentId: { $exists: false } },
        { checkoutAgentId: agentId },
      ],
      isDeleted: false,
    };
    const update = {
      $set: {
        checkedOutAt: new Date(),
        checkoutAgentId: agentId,
        checkoutRunId: runId,
        status: 'in_progress',
      },
    };

    const updated = await (
      this.model as never as import('mongoose').Model<Record<string, unknown>>
    ).findOneAndUpdate(filter, update, { new: true });

    return updated as unknown as TaskDocument | null;
  }

  async release(taskId: string, agentId: string): Promise<TaskDocument> {
    const filter = {
      _id: new Types.ObjectId(taskId),
      checkoutAgentId: agentId,
      isDeleted: false,
    };
    const update = {
      $unset: {
        checkedOutAt: '',
        checkoutAgentId: '',
        checkoutRunId: '',
      },
    };

    const updated = await (
      this.model as never as import('mongoose').Model<Record<string, unknown>>
    ).findOneAndUpdate(filter, update, { new: true });

    if (!updated) {
      throw new NotFoundException('Task', taskId);
    }

    return updated as unknown as TaskDocument;
  }

  // ─── AI Task public methods ──────────────────────────────────────────────────

  async listInbox(organizationId: string, limit = 20): Promise<TaskDocument[]> {
    return this.model
      .find({
        $or: [
          { reviewState: { $in: ['pending_approval', 'changes_requested'] } },
          { status: { $in: ['done', 'failed'] } },
        ],
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      })
      .sort({ reviewState: 1, updatedAt: -1 })
      .limit(limit)
      .exec();
  }

  async approve(id: string, organizationId: string): Promise<TaskDocument> {
    const task = await this.requireAiTask(id, organizationId);
    const updated = (await (
      this.model as never as import('mongoose').Model<Record<string, unknown>>
    ).findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      {
        $set: {
          completedAt: new Date(),
          reviewState: 'approved',
          status: 'done',
        },
        $unset: { failureReason: '', requestedChangesReason: '' },
      },
      { new: true },
    )) as TaskDocument | null;
    if (!updated) throw new NotFoundException('Task', id);
    const userId = task.assigneeUserId ?? '';
    await this.appendEventAndBroadcast(updated, organizationId, userId, {
      type: 'task_approved',
    });
    return updated;
  }

  async requestChanges(
    id: string,
    organizationId: string,
    userId: string,
    reason: string,
  ): Promise<TaskDocument> {
    await this.requireAiTask(id, organizationId);
    const updated = (await (
      this.model as never as import('mongoose').Model<Record<string, unknown>>
    ).findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      {
        $set: {
          requestedChangesReason: reason,
          reviewState: 'changes_requested',
          status: 'in_review',
        },
      },
      { new: true },
    )) as TaskDocument | null;
    if (!updated) throw new NotFoundException('Task', id);
    await this.appendEventAndBroadcast(updated, organizationId, userId, {
      payload: { reason },
      type: 'task_changes_requested',
    });
    return updated;
  }

  async dismiss(
    id: string,
    organizationId: string,
    userId: string,
    reason?: string,
  ): Promise<TaskDocument> {
    await this.requireAiTask(id, organizationId);
    const updated = (await (
      this.model as never as import('mongoose').Model<Record<string, unknown>>
    ).findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      {
        $set: {
          dismissedAt: new Date(),
          failureReason: reason,
          reviewState: 'dismissed',
          status: 'cancelled',
        },
      },
      { new: true },
    )) as TaskDocument | null;
    if (!updated) throw new NotFoundException('Task', id);
    await this.appendEventAndBroadcast(updated, organizationId, userId, {
      payload: reason ? { reason } : undefined,
      type: 'task_dismissed',
    });
    return updated;
  }

  async keepOutput(
    id: string,
    outputId: string,
    organizationId: string,
  ): Promise<TaskDocument> {
    const task = await this.requireLinkedOutputTask(
      id,
      organizationId,
      outputId,
    );
    const updated = (await (
      this.model as never as import('mongoose').Model<Record<string, unknown>>
    ).findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      { $addToSet: { approvedOutputIds: new Types.ObjectId(outputId) } },
      { new: true },
    )) as TaskDocument | null;
    if (!updated) throw new NotFoundException('Task', id);
    const userId = task.assigneeUserId ?? '';
    await this.appendEventAndBroadcast(updated, organizationId, userId, {
      payload: { outputId },
      type: 'output_kept',
    });
    return updated;
  }

  async unkeepOutput(
    id: string,
    outputId: string,
    organizationId: string,
  ): Promise<TaskDocument> {
    const task = await this.requireLinkedOutputTask(
      id,
      organizationId,
      outputId,
    );
    const updated = (await (
      this.model as never as import('mongoose').Model<Record<string, unknown>>
    ).findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      { $pull: { approvedOutputIds: new Types.ObjectId(outputId) } },
      { new: true },
    )) as TaskDocument | null;
    if (!updated) throw new NotFoundException('Task', id);
    const userId = task.assigneeUserId ?? '';
    await this.appendEventAndBroadcast(updated, organizationId, userId, {
      payload: { outputId },
      type: 'output_unkept',
    });
    return updated;
  }

  async trashOutput(
    id: string,
    outputId: string,
    organizationId: string,
  ): Promise<TaskDocument> {
    const task = await this.requireLinkedOutputTask(
      id,
      organizationId,
      outputId,
    );
    const ingredient = await this.ingredientsService.findOne({
      _id: new Types.ObjectId(outputId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });
    if (!ingredient) throw new NotFoundException('Ingredient', outputId);
    await this.ingredientsService.patch(outputId, { isDeleted: true });
    const updated = (await (
      this.model as never as import('mongoose').Model<Record<string, unknown>>
    ).findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      { $pull: { approvedOutputIds: new Types.ObjectId(outputId) } },
      { new: true },
    )) as TaskDocument | null;
    if (!updated) throw new NotFoundException('Task', id);
    const userId = task.assigneeUserId ?? '';
    await this.appendEventAndBroadcast(updated, organizationId, userId, {
      payload: { outputId },
      type: 'output_trashed',
    });
    return updated;
  }

  async recordTaskEvent(
    id: string,
    organizationId: string,
    userId: string,
    event: TaskEventInput,
    patch: Record<string, unknown> = {},
  ): Promise<TaskDocument> {
    const task = await this.requireAiTask(id, organizationId);
    const updated = await this.patchAiTaskAndReturn(id, organizationId, patch);
    await this.appendEventAndBroadcast(
      updated ?? task,
      organizationId,
      userId,
      event,
    );
    return updated ?? task;
  }

  async openPlanningThread(
    id: string,
    organizationId: string,
    userId: string,
  ): Promise<PlanningThreadResult> {
    const task = await this.requireAiTask(id, organizationId);
    const systemPrompt = await this.buildPlanningSystemPrompt(
      task,
      organizationId,
    );
    const planningThreadIdStr = task.planningThreadId?.toString();
    const existingThreadId = await this.resolveAccessiblePlanningThreadId(
      planningThreadIdStr,
      organizationId,
    );

    if (existingThreadId) {
      await this.agentThreadsService.updateThreadMetadata(
        existingThreadId,
        organizationId,
        {
          planModeEnabled: true,
          systemPrompt,
          title: this.buildPlanningThreadTitle(task.title),
        },
      );
      return {
        created: false,
        seeded: await this.shouldSeedPlanningThread(
          existingThreadId,
          organizationId,
        ),
        threadId: existingThreadId,
      };
    }

    const thread = await this.agentThreadsService.create({
      organization: new Types.ObjectId(organizationId),
      planModeEnabled: true,
      source: this.buildPlanningThreadSource(id),
      systemPrompt,
      title: this.buildPlanningThreadTitle(task.title),
      user: new Types.ObjectId(userId),
    } as Record<string, unknown>);

    const threadId = String(thread._id);
    await this.patch(id, {
      planningThreadId: new Types.ObjectId(threadId),
    } as Record<string, unknown>);

    return { created: true, seeded: true, threadId };
  }

  async getPlanningPrompt(id: string, organizationId: string): Promise<string> {
    const task = await this.requireAiTask(id, organizationId);
    return this.buildPlanningKickoffPrompt(task.title);
  }

  async createFollowUpTasks(
    id: string,
    organizationId: string,
    userId: string,
  ): Promise<TaskDocument[]> {
    const task = await this.requireAiTask(id, organizationId);
    const planningThreadIdStr = task.planningThreadId?.toString();
    const threadId = await this.resolveAccessiblePlanningThreadId(
      planningThreadIdStr,
      organizationId,
    );

    if (!threadId) {
      throw new BadRequestException(
        'No planning conversation exists for this task yet.',
      );
    }

    const latestPlan = await this.getLatestApprovedPlanningMessage(
      threadId,
      organizationId,
    );
    const followUpSteps = this.extractFollowUpSteps(latestPlan, task);

    if (followUpSteps.length === 0) {
      throw new BadRequestException(
        'The latest approved plan does not contain any follow-up steps to create.',
      );
    }

    const createdTasks: TaskDocument[] = [];
    for (const step of followUpSteps) {
      const createdTask = await this.create({
        brand: task.brand?.toString(),
        organization: task.organization?.toString(),
        outputType: step.outputType ?? task.outputType,
        platforms: task.platforms,
        priority: task.priority,
        request: step.request,
        title: step.title,
        user: userId,
      } as CreateTaskDto & { organization?: string; user?: string });
      createdTasks.push(createdTask);
    }

    return createdTasks;
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

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

  private async buildRoutingDecision(
    createDto: CreateTaskDto,
  ): Promise<TaskRoutingDecision> {
    const extended = createDto as CreateTaskDtoExtended;
    const inferredOutputType = this.inferOutputType(createDto);
    const taskIntent = this.buildTaskIntent(createDto, inferredOutputType);
    const brandId = extended.brand ?? undefined;
    const organizationId = extended.organization ?? undefined;

    if (brandId && organizationId) {
      const resolvedSkills = await this.skillsService.resolveBrandSkills(
        organizationId,
        brandId,
        {
          channel: taskIntent.channel,
          modality: taskIntent.modality,
          workflowStage: taskIntent.workflowStage,
        },
      );
      const matchedSkill = resolvedSkills[0];
      if (matchedSkill) {
        return this.buildSkillDrivenDecision(
          createDto,
          taskIntent,
          matchedSkill,
        );
      }
    }

    return this.buildFallbackRoutingDecision(inferredOutputType);
  }

  private buildTaskIntent(
    createDto: CreateTaskDto,
    outputType: TaskDocument['outputType'],
  ): AiTaskIntent {
    const extended = createDto as CreateTaskDtoExtended;
    const platforms = extended.platforms ?? [];
    const normalizedPlatforms = platforms.map((p) => p.toLowerCase());
    const primaryChannel = normalizedPlatforms[0];

    switch (outputType) {
      case 'image':
        return {
          channel: primaryChannel,
          modality: 'image',
          outputType: 'image',
          workflowStage: 'creation',
        };
      case 'video':
        return {
          channel: primaryChannel,
          modality: 'video',
          outputType: 'video',
          workflowStage: 'creation',
        };
      default:
        return {
          channel: primaryChannel,
          modality: 'text',
          outputType,
          workflowStage: 'creation',
        };
    }
  }

  private inferOutputType(
    createDto: CreateTaskDto,
  ): TaskDocument['outputType'] {
    const extended = createDto as CreateTaskDtoExtended;
    const outputType = extended.outputType;
    const request = extended.request ?? '';
    const normalizedRequest = request.toLowerCase();

    return (outputType ??
      (normalizedRequest.match(/\b(video|reel|short|clip)\b/)
        ? 'video'
        : normalizedRequest.match(/\b(newsletter|issue|beehiiv|email)\b/)
          ? 'newsletter'
          : normalizedRequest.match(/\b(thread|tweet|post|reply|hook)\b/)
            ? 'post'
            : normalizedRequest.match(/\b(caption|copy|text)\b/)
              ? 'caption'
              : normalizedRequest.match(/\b(image|photo|thumbnail|visual)\b/)
                ? 'image'
                : 'ingredient')) as TaskDocument['outputType'];
  }

  private buildSkillDrivenDecision(
    createDto: CreateTaskDto,
    taskIntent: AiTaskIntent,
    matchedSkill: Awaited<
      ReturnType<SkillsService['resolveBrandSkills']>
    >[number],
  ): TaskRoutingDecision {
    const targetSkill = matchedSkill.targetSkill;
    const requiresApproval = this.skillRequiresApproval(targetSkill);
    const taskTitle = this.buildTaskTitle(createDto);
    const executionPathUsed =
      taskIntent.outputType === 'image'
        ? 'image_generation'
        : taskIntent.outputType === 'video'
          ? 'video_generation'
          : taskIntent.outputType === 'caption' ||
              taskIntent.outputType === 'post' ||
              taskIntent.outputType === 'newsletter'
            ? 'caption_generation'
            : 'agent_orchestrator';

    return {
      chosenModel: 'auto',
      chosenProvider: targetSkill.requiredProviders[0] ?? 'genfeed-router',
      executionPathUsed,
      outputType: taskIntent.outputType,
      resultPreview: requiresApproval
        ? `Prepared with ${targetSkill.name}: ${taskTitle}`
        : undefined,
      reviewState: requiresApproval ? 'pending_approval' : 'none',
      reviewTriggered: requiresApproval,
      routingSummary: `Resolved the request using the brand skill "${targetSkill.name}" (${targetSkill.slug}) for the ${taskIntent.workflowStage} stage.`,
      skillsUsed: [targetSkill.slug],
      skillVariantIds: matchedSkill.variant ? [matchedSkill.variant._id] : [],
      status: requiresApproval
        ? 'in_review'
        : executionPathUsed === 'agent_orchestrator'
          ? 'backlog'
          : 'in_progress',
    };
  }

  private buildFallbackRoutingDecision(
    inferredOutputType: TaskDocument['outputType'],
  ): TaskRoutingDecision {
    switch (inferredOutputType) {
      case 'image':
        return {
          chosenModel: 'auto',
          chosenProvider: 'genfeed-router',
          executionPathUsed: 'image_generation',
          outputType: 'image',
          reviewState: 'none',
          reviewTriggered: false,
          routingSummary:
            'Detected an image ingredient request and routed it to the image generation path.',
          skillsUsed: [],
          skillVariantIds: [],
          status: 'in_progress',
        };
      case 'video':
        return {
          chosenModel: 'auto',
          chosenProvider: 'genfeed-router',
          executionPathUsed: 'video_generation',
          outputType: 'video',
          reviewState: 'none',
          reviewTriggered: false,
          routingSummary:
            'Detected a short-form video request and routed it to the video generation path.',
          skillsUsed: [],
          skillVariantIds: [],
          status: 'in_progress',
        };
      case 'caption':
      case 'newsletter':
      case 'post':
        return {
          chosenModel: 'auto',
          chosenProvider: 'genfeed-router',
          executionPathUsed: 'caption_generation',
          outputType: inferredOutputType,
          reviewState: 'none',
          reviewTriggered: true,
          routingSummary:
            inferredOutputType === 'newsletter'
              ? 'Detected a newsletter request and routed it to the writing generation path for review.'
              : inferredOutputType === 'post'
                ? 'Detected a social post request and routed it to the writing generation path for review.'
                : 'Detected a writing request and routed it to the caption generation path for review.',
          skillsUsed: [],
          skillVariantIds: [],
          status: 'backlog',
        };
      default:
        return {
          chosenModel: 'auto',
          chosenProvider: 'genfeed-router',
          executionPathUsed: 'agent_orchestrator',
          outputType: 'ingredient',
          reviewState: 'none',
          reviewTriggered: false,
          routingSummary:
            'Detected a broader ingredient request and routed it to the orchestration path.',
          skillsUsed: [],
          skillVariantIds: [],
          status: 'backlog',
        };
    }
  }

  private skillRequiresApproval(skill: SkillDocument): boolean {
    const reviewDefaults = skill.reviewDefaults;
    if (!reviewDefaults) return skill.workflowStage === 'review';
    const requiresApproval = reviewDefaults['requiresApproval'];
    return typeof requiresApproval === 'boolean' ? requiresApproval : false;
  }

  private async patchAiTaskAndReturn(
    id: string,
    organizationId: string,
    patch: Record<string, unknown>,
  ): Promise<TaskDocument | null> {
    if (Object.keys(patch).length === 0) {
      return this.findOne({
        _id: new Types.ObjectId(id),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      });
    }
    return (
      this.model as never as import('mongoose').Model<Record<string, unknown>>
    ).findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      { $set: patch },
      { new: true },
    ) as Promise<TaskDocument | null>;
  }

  private async requireAiTask(
    id: string,
    organizationId: string,
  ): Promise<TaskDocument> {
    const task = await this.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });
    if (!task) throw new NotFoundException('Task', id);
    return task;
  }

  private async requireLinkedOutputTask(
    id: string,
    organizationId: string,
    outputId: string,
  ): Promise<TaskDocument> {
    const task = await this.requireAiTask(id, organizationId);
    const linkedOutputIds = task.linkedOutputIds ?? [];
    const isLinked = linkedOutputIds.some(
      (linkedOutputId) => linkedOutputId.toString() === outputId,
    );
    if (!isLinked)
      throw new BadRequestException(
        'This output is not linked to the requested task.',
      );
    return task;
  }

  private createTaskEventEntry(input: TaskEventInput): {
    createdAt: Date;
    id: string;
    payload?: Record<string, unknown>;
    timestamp: Date;
    type: string;
  } {
    const now = input.timestamp ?? new Date();
    return {
      createdAt: now,
      id: new Types.ObjectId().toString(),
      payload: input.payload,
      timestamp: now,
      type: input.type,
    };
  }

  private serializeTaskProgress(progress: TaskProgress): {
    activeRunCount: number;
    message?: string;
    percent: number;
    stage?: string;
  } {
    return {
      activeRunCount: progress?.activeRunCount ?? 0,
      message: progress?.message,
      percent: progress?.percent ?? 0,
      stage: progress?.stage,
    };
  }

  private serializeTaskRealtimeSnapshot(
    task: TaskDocument,
  ): Record<string, unknown> {
    const approvedOutputIds = task.approvedOutputIds ?? [];
    const linkedApprovalIds = task.linkedApprovalIds ?? [];
    const linkedOutputIds = task.linkedOutputIds ?? [];
    const linkedRunIds = task.linkedRunIds ?? [];
    const skillVariantIds = task.skillVariantIds ?? [];
    const eventStream = task.eventStream ?? [];

    return {
      approvedOutputIds: approvedOutputIds.map((id) => id.toString()),
      brand: task.brand?.toString(),
      chosenModel: task.chosenModel,
      chosenProvider: task.chosenProvider,
      completedAt: task.completedAt?.toISOString(),
      createdAt: task.createdAt?.toISOString(),
      decomposition: task.decomposition,
      dismissedAt: task.dismissedAt?.toISOString(),
      eventStream: eventStream.map((event) => ({
        createdAt:
          event.createdAt instanceof Date
            ? event.createdAt.toISOString()
            : String(event.createdAt),
        payload: event.payload,
        type: event.type,
        userId: event.userId,
      })),
      executionPathUsed: task.executionPathUsed,
      failureReason: task.failureReason,
      id: task._id.toString(),
      linkedApprovalIds: linkedApprovalIds.map((id) => id.toString()),
      linkedOutputIds: linkedOutputIds.map((id) => id.toString()),
      linkedRunIds: linkedRunIds.map((id) => id.toString()),
      organization: task.organization?.toString(),
      outputType: task.outputType,
      planningThreadId: task.planningThreadId?.toString(),
      platforms: task.platforms,
      priority: task.priority,
      progress: this.serializeTaskProgress(task.progress),
      qualityAssessment: task.qualityAssessment,
      request: task.request,
      requestedChangesReason: task.requestedChangesReason,
      resultPreview: task.resultPreview,
      reviewState: task.reviewState,
      reviewTriggered: task.reviewTriggered,
      routingSummary: task.routingSummary,
      skillsUsed: task.skillsUsed,
      skillVariantIds: skillVariantIds.map((id) => id.toString()),
      status: task.status,
      title: task.title,
      updatedAt: task.updatedAt?.toISOString(),
    };
  }

  private async appendEventAndBroadcast(
    task: TaskDocument,
    organizationId: string,
    userId: string,
    eventInput: TaskEventInput,
  ): Promise<void> {
    const entry = this.createTaskEventEntry(eventInput);
    // Task eventStream uses { createdAt, type, payload, userId } shape
    const eventDoc = {
      createdAt: entry.createdAt,
      payload: entry.payload,
      type: entry.type,
      userId: userId || undefined,
    };

    const updated = (await (
      this.model as never as import('mongoose').Model<Record<string, unknown>>
    ).findOneAndUpdate(
      {
        _id: task._id,
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      { $push: { eventStream: eventDoc } },
      { new: true },
    )) as TaskDocument | null;

    if (!updated) return;

    const payload: TaskRealtimePayload = {
      event: {
        id: entry.id,
        payload: entry.payload,
        timestamp: entry.timestamp.toISOString(),
        type: entry.type,
      },
      organizationId,
      progress: this.serializeTaskProgress(updated.progress) as TaskProgress,
      room: `org-${organizationId}`,
      task: this.serializeTaskRealtimeSnapshot(updated),
      taskId: updated._id.toString(),
      userId,
    };

    await Promise.all([
      this.notificationsPublisher.emit(
        WebSocketPaths.workspaceTask(updated._id.toString()),
        payload,
      ),
      this.notificationsPublisher.emit(
        WebSocketPaths.workspaceTaskOverview(organizationId),
        payload,
      ),
    ]);
  }

  private async resolveAccessiblePlanningThreadId(
    planningThreadId: string | undefined,
    organizationId: string,
  ): Promise<string | null> {
    if (!planningThreadId) return null;
    const thread = await this.agentThreadsService.findOne({
      _id: planningThreadId,
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });
    return thread ? String(thread._id) : null;
  }

  private async shouldSeedPlanningThread(
    threadId: string,
    organizationId: string,
  ): Promise<boolean> {
    const existingMessages = await this.agentMessagesService.getMessagesByRoom(
      threadId,
      organizationId,
      { limit: 1, page: 1 },
    );
    return existingMessages.length === 0;
  }

  private buildPlanningThreadSource(taskId: string): string {
    return `${PLANNING_THREAD_SOURCE_PREFIX}${taskId}`;
  }

  private buildPlanningThreadTitle(taskTitle: string): string {
    const normalized = taskTitle.trim();
    const title = normalized.length > 0 ? normalized : 'Task';
    return `${PLANNING_THREAD_TITLE_PREFIX}${title}`.slice(0, 140);
  }

  private buildPlanningKickoffPrompt(taskTitle: string): string {
    const subject = taskTitle.trim() || 'this task';
    return `Review ${subject} and tell me what has already been done, what remains unresolved, what SHOULD happen next, and what COULD happen next.`;
  }

  private async buildPlanningSystemPrompt(
    task: TaskDocument,
    organizationId: string,
  ): Promise<string> {
    const linkedRuns = await this.buildLinkedRunSummaries(task, organizationId);
    const bundle = {
      decomposition: task.decomposition ?? null,
      failureReason: task.failureReason ?? null,
      linkedApprovalIds: (task.linkedApprovalIds ?? []).map((id) =>
        id.toString(),
      ),
      linkedOutputIds: (task.linkedOutputIds ?? []).map((id) => id.toString()),
      linkedRunIds: (task.linkedRunIds ?? []).map((id) => id.toString()),
      linkedRuns,
      outputType: task.outputType,
      platforms: task.platforms,
      priority: task.priority,
      requestedChangesReason: task.requestedChangesReason ?? null,
      resultPreview: task.resultPreview ?? null,
      reviewState: task.reviewState,
      reviewTriggered: task.reviewTriggered,
      routingSummary: task.routingSummary ?? null,
      status: task.status,
      taskId: task._id.toString(),
      title: task.title,
      userRequest: task.request,
    };

    return [
      "You are Genfeed's task-aware planning assistant for a single task.",
      'Use the live task bundle below as the source of truth for what has already happened.',
      'Stay conversational and concise, but be explicit about state.',
      'When you answer planning questions, you must:',
      '1. Summarize what has already been done.',
      '2. Separate what is complete from what remains unresolved.',
      '3. Recommend what SHOULD happen next.',
      '4. List what COULD happen next as optional follow-ups.',
      '5. When appropriate, propose a sequenced multi-task plan where each step is concrete enough to become a follow-up task.',
      '',
      'Live task bundle:',
      JSON.stringify(bundle, null, 2),
    ].join('\n');
  }

  private async buildLinkedRunSummaries(
    task: TaskDocument,
    organizationId: string,
  ): Promise<
    Array<{
      completedAt?: string;
      error?: string;
      id: string;
      label: string;
      startedAt?: string;
      status: string;
      summary?: string;
      threadId?: string;
    }>
  > {
    const runSummaries: Array<{
      completedAt?: string;
      error?: string;
      id: string;
      label: string;
      startedAt?: string;
      status: string;
      summary?: string;
      threadId?: string;
    }> = [];

    for (const linkedRunId of task.linkedRunIds ?? []) {
      const run = await this.agentRunsService.getById(
        linkedRunId.toString(),
        organizationId,
      );
      if (!run) continue;
      runSummaries.push({
        completedAt: run.completedAt?.toISOString(),
        error: run.error,
        id: run._id.toString(),
        label: run.label,
        startedAt: run.startedAt?.toISOString(),
        status: run.status,
        summary: run.summary,
        threadId: run.thread?.toString(),
      });
    }

    return runSummaries;
  }

  private async getLatestApprovedPlanningMessage(
    threadId: string,
    organizationId: string,
  ): Promise<Record<string, unknown>> {
    const recentMessages = await this.agentMessagesService.getMessagesByRoom(
      threadId,
      organizationId,
      { limit: 100, page: 1 },
    );

    const latestPlanningMessage = recentMessages.find((message) => {
      if (message.role !== 'assistant') return false;
      const proposedPlan = message.metadata?.['proposedPlan'];
      return (
        proposedPlan !== null &&
        typeof proposedPlan === 'object' &&
        !Array.isArray(proposedPlan)
      );
    });

    if (!latestPlanningMessage?.metadata?.['proposedPlan']) {
      throw new BadRequestException(
        'No proposed plan is available in the planning conversation yet.',
      );
    }

    const plan = latestPlanningMessage.metadata['proposedPlan'];
    const status =
      typeof (plan as { status?: unknown }).status === 'string'
        ? (plan as { status: string }).status
        : null;

    if (status !== 'approved') {
      throw new BadRequestException(
        'Approve the proposed plan before creating follow-up tasks.',
      );
    }

    return plan as Record<string, unknown>;
  }

  private extractFollowUpSteps(
    plan: Record<string, unknown>,
    task: TaskDocument,
  ): FollowUpPlanStep[] {
    const steps = Array.isArray(plan['steps']) ? plan['steps'] : [];

    return steps.flatMap((step) => {
      if (!step || typeof step !== 'object' || Array.isArray(step)) return [];

      const title =
        this.readStringField(step as Record<string, unknown>, [
          'step',
          'title',
          'task',
          'label',
          'name',
        ]) ?? null;
      if (!title) return [];

      const detail =
        this.readStringField(step as Record<string, unknown>, [
          'details',
          'description',
          'request',
          'summary',
          'brief',
        ]) ?? '';
      const request = [
        detail.length > 0 ? `${title}\n\n${detail}` : title,
        `Source task: ${task.title} (${task._id.toString()})`,
        `Original task request: ${task.request}`,
      ].join('\n\n');

      const outputType = this.normalizeOutputType(
        this.readStringField(step as Record<string, unknown>, [
          'outputType',
          'type',
        ]),
      );

      return [
        {
          outputType: outputType ?? task.outputType,
          request,
          title: title.slice(0, 140),
        },
      ];
    });
  }

  private normalizeOutputType(
    value: string | null,
  ): TaskDocument['outputType'] | null {
    if (!value) return null;
    return [
      'caption',
      'image',
      'ingredient',
      'newsletter',
      'post',
      'video',
    ].includes(value)
      ? (value as TaskDocument['outputType'])
      : null;
  }

  private readStringField(
    value: Record<string, unknown>,
    keys: string[],
  ): string | null {
    for (const key of keys) {
      const candidate = value[key];
      if (typeof candidate === 'string' && candidate.trim().length > 0)
        return candidate.trim();
    }
    return null;
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

import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { SkillDocument } from '@api/collections/skills/schemas/skill.schema';
import { SkillsService } from '@api/collections/skills/services/skills.service';
import { CreateWorkspaceTaskDto } from '@api/collections/workspace-tasks/dto/create-workspace-task.dto';
import { UpdateWorkspaceTaskDto } from '@api/collections/workspace-tasks/dto/update-workspace-task.dto';
import {
  type WorkspaceTaskDocument,
  type WorkspaceTaskEvent,
  type WorkspaceTaskProgress,
} from '@api/collections/workspace-tasks/schemas/workspace-task.schema';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { AgentExecutionStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

type WorkspaceRoutingDecision = Pick<
  WorkspaceTaskDocument,
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

type TaskIntent = {
  channel?: string;
  modality: 'image' | 'text' | 'video';
  outputType: WorkspaceTaskDocument['outputType'];
  workflowStage: 'creation';
};

type WorkspacePlanningThreadResult = {
  created: boolean;
  seeded: boolean;
  threadId: string;
};

type WorkspaceTaskEventInput = {
  payload?: Record<string, unknown>;
  timestamp?: Date;
  type: string;
};

type WorkspaceTaskRealtimePayload = {
  event: {
    id: string;
    payload?: Record<string, unknown>;
    timestamp: string;
    type: string;
  };
  organizationId: string;
  progress: WorkspaceTaskProgress;
  room: string;
  task: Record<string, unknown>;
  taskId: string;
  userId: string;
};

type WorkspaceFollowUpPlanStep = {
  outputType?: WorkspaceTaskDocument['outputType'];
  request: string;
  title: string;
};

const WORKSPACE_PLANNING_THREAD_SOURCE_PREFIX = 'workspace-planning:';
const WORKSPACE_PLANNING_THREAD_TITLE_PREFIX = 'Plan next steps: ';

@Injectable()
export class WorkspaceTasksService extends BaseService<
  WorkspaceTaskDocument,
  CreateWorkspaceTaskDto,
  UpdateWorkspaceTaskDto
> {
  constructor(
    private readonly prisma: PrismaService,
    logger: LoggerService,
    private readonly skillsService: SkillsService,
    private readonly ingredientsService: IngredientsService,
    private readonly agentThreadsService: AgentThreadsService,
    private readonly agentMessagesService: AgentMessagesService,
    private readonly agentRunsService: AgentRunsService,
    private readonly notificationsPublisher: NotificationsPublisherService,
  ) {
    super(prisma, 'workspaceTask', logger);
  }

  override async create(
    createDto: CreateWorkspaceTaskDto,
  ): Promise<WorkspaceTaskDocument> {
    const routingDecision = await this.buildRoutingDecision(createDto);
    const normalizedTitle = this.buildTaskTitle(createDto);

    return super.create({
      ...createDto,
      ...routingDecision,
      approvedOutputIds: [],
      eventStream: [],
      linkedApprovalIds: [],
      linkedOutputIds: [],
      linkedRunIds: [],
      platforms: createDto.platforms ?? [],
      progress: {
        activeRunCount: 0,
        message: 'Task queued in workspace.',
        percent: 0,
        stage: 'queued',
      },
      title: normalizedTitle,
    });
  }

  async findOneById(
    id: string,
    organizationId: string,
  ): Promise<WorkspaceTaskDocument | null> {
    const result = await this.prisma.workspaceTask.findFirst({
      where: { id, isDeleted: false, organizationId },
    });
    return result as unknown as WorkspaceTaskDocument | null;
  }

  async listInbox(
    organizationId: string,
    limit: number = 20,
  ): Promise<WorkspaceTaskDocument[]> {
    const results = await this.prisma.workspaceTask.findMany({
      orderBy: [{ reviewState: 'asc' }, { updatedAt: 'desc' }],
      take: limit,
      where: {
        isDeleted: false,
        OR: [
          { reviewState: { in: ['pending_approval', 'changes_requested'] } },
          { status: { in: ['completed', 'failed'] } },
        ],
        organizationId,
      } as never,
    });
    return results as unknown as WorkspaceTaskDocument[];
  }

  async approve(
    id: string,
    organizationId: string,
  ): Promise<WorkspaceTaskDocument> {
    const task = await this.requireTask(id, organizationId);
    const updated = await this.prisma.workspaceTask.update({
      data: {
        completedAt: new Date(),
        failureReason: null,
        requestedChangesReason: null,
        reviewState: 'approved',
        status: 'completed',
      } as never,
      where: { id },
    });

    if (!updated) {
      throw new NotFoundException('WorkspaceTask', id);
    }

    const updatedDoc = updated as unknown as WorkspaceTaskDocument;
    await this.appendEventAndBroadcast(
      updatedDoc,
      organizationId,
      String((task as unknown as Record<string, unknown>).userId ?? task.user),
      {
        type: 'task_approved',
      },
    );

    return updatedDoc;
  }

  async requestChanges(
    id: string,
    organizationId: string,
    reason: string,
  ): Promise<WorkspaceTaskDocument> {
    const task = await this.requireTask(id, organizationId);
    const updated = await this.prisma.workspaceTask.update({
      data: {
        requestedChangesReason: reason,
        reviewState: 'changes_requested',
        status: 'needs_review',
      } as never,
      where: { id },
    });

    if (!updated) {
      throw new NotFoundException('WorkspaceTask', id);
    }

    const updatedDoc = updated as unknown as WorkspaceTaskDocument;
    await this.appendEventAndBroadcast(
      updatedDoc,
      organizationId,
      String((task as unknown as Record<string, unknown>).userId ?? task.user),
      {
        payload: { reason },
        type: 'task_changes_requested',
      },
    );

    return updatedDoc;
  }

  async dismiss(
    id: string,
    organizationId: string,
    reason?: string,
  ): Promise<WorkspaceTaskDocument> {
    const task = await this.requireTask(id, organizationId);
    const updated = await this.prisma.workspaceTask.update({
      data: {
        dismissedAt: new Date(),
        failureReason: reason,
        reviewState: 'dismissed',
        status: 'dismissed',
      } as never,
      where: { id },
    });

    if (!updated) {
      throw new NotFoundException('WorkspaceTask', id);
    }

    const updatedDoc = updated as unknown as WorkspaceTaskDocument;
    await this.appendEventAndBroadcast(
      updatedDoc,
      organizationId,
      String((task as unknown as Record<string, unknown>).userId ?? task.user),
      {
        payload: reason ? { reason } : undefined,
        type: 'task_dismissed',
      },
    );

    return updatedDoc;
  }

  async keepOutput(
    id: string,
    organizationId: string,
    outputId: string,
  ): Promise<WorkspaceTaskDocument> {
    const task = await this.requireLinkedOutputTask(
      id,
      organizationId,
      outputId,
    );

    const existing = await this.prisma.workspaceTask.findFirst({
      where: { id, isDeleted: false, organizationId },
    });
    if (!existing) {
      throw new NotFoundException('WorkspaceTask', id);
    }

    const existingDoc = existing as unknown as Record<string, unknown>;
    const approvedOutputIds = (existingDoc.approvedOutputIds as string[]) ?? [];
    const nextApprovedOutputIds = approvedOutputIds.includes(outputId)
      ? approvedOutputIds
      : [...approvedOutputIds, outputId];

    const updated = await this.prisma.workspaceTask.update({
      data: { approvedOutputIds: nextApprovedOutputIds as never } as never,
      where: { id },
    });

    const updatedDoc = updated as unknown as WorkspaceTaskDocument;
    await this.appendEventAndBroadcast(
      updatedDoc,
      organizationId,
      String((task as unknown as Record<string, unknown>).userId ?? task.user),
      {
        payload: { outputId },
        type: 'output_kept',
      },
    );

    return updatedDoc;
  }

  async unkeepOutput(
    id: string,
    organizationId: string,
    outputId: string,
  ): Promise<WorkspaceTaskDocument> {
    const task = await this.requireLinkedOutputTask(
      id,
      organizationId,
      outputId,
    );

    const existing = await this.prisma.workspaceTask.findFirst({
      where: { id, isDeleted: false, organizationId },
    });
    if (!existing) {
      throw new NotFoundException('WorkspaceTask', id);
    }

    const existingDoc = existing as unknown as Record<string, unknown>;
    const approvedOutputIds = (existingDoc.approvedOutputIds as string[]) ?? [];
    const nextApprovedOutputIds = approvedOutputIds.filter(
      (oid) => oid !== outputId && oid?.toString() !== outputId,
    );

    const updated = await this.prisma.workspaceTask.update({
      data: { approvedOutputIds: nextApprovedOutputIds as never } as never,
      where: { id },
    });

    const updatedDoc = updated as unknown as WorkspaceTaskDocument;
    await this.appendEventAndBroadcast(
      updatedDoc,
      organizationId,
      String((task as unknown as Record<string, unknown>).userId ?? task.user),
      {
        payload: { outputId },
        type: 'output_unkept',
      },
    );

    return updatedDoc;
  }

  async trashOutput(
    id: string,
    organizationId: string,
    outputId: string,
  ): Promise<WorkspaceTaskDocument> {
    const task = await this.requireLinkedOutputTask(
      id,
      organizationId,
      outputId,
    );
    const ingredient = await this.ingredientsService.findOne({
      _id: outputId,
      isDeleted: false,
    });

    if (!ingredient) {
      throw new NotFoundException('Ingredient', outputId);
    }

    await this.ingredientsService.patch(outputId, { isDeleted: true });

    const existing = await this.prisma.workspaceTask.findFirst({
      where: { id, isDeleted: false, organizationId },
    });
    if (!existing) {
      throw new NotFoundException('WorkspaceTask', id);
    }

    const existingDoc = existing as unknown as Record<string, unknown>;
    const approvedOutputIds = (existingDoc.approvedOutputIds as string[]) ?? [];
    const nextApprovedOutputIds = approvedOutputIds.filter(
      (oid) => oid !== outputId && oid?.toString() !== outputId,
    );

    const updated = await this.prisma.workspaceTask.update({
      data: { approvedOutputIds: nextApprovedOutputIds as never } as never,
      where: { id },
    });

    const updatedDoc = updated as unknown as WorkspaceTaskDocument;
    await this.appendEventAndBroadcast(
      updatedDoc,
      organizationId,
      String((task as unknown as Record<string, unknown>).userId ?? task.user),
      {
        payload: { outputId },
        type: 'output_trashed',
      },
    );

    return updatedDoc;
  }

  async recordTaskEvent(
    id: string,
    organizationId: string,
    userId: string,
    event: WorkspaceTaskEventInput,
    patch: Record<string, unknown> = {},
  ): Promise<WorkspaceTaskDocument> {
    const task = await this.requireTask(id, organizationId);
    const updated = await this.patchTaskAndReturn(id, organizationId, patch);
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
  ): Promise<WorkspacePlanningThreadResult> {
    const task = await this.requireTask(id, organizationId);
    const systemPrompt = await this.buildPlanningSystemPrompt(
      task,
      organizationId,
    );

    const existingThreadId = await this.resolveAccessiblePlanningThreadId(
      task.planningThreadId,
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
      organizationId,
      planModeEnabled: true,
      source: this.buildPlanningThreadSource(id),
      systemPrompt,
      title: this.buildPlanningThreadTitle(task.title),
      userId,
    } as Record<string, unknown>);

    const threadId = String(
      (thread as unknown as Record<string, unknown>)._id ??
        (thread as unknown as { id: string }).id,
    );
    await this.patch(id, {
      planningThreadId: threadId,
    } as Record<string, unknown>);

    return {
      created: true,
      seeded: true,
      threadId,
    };
  }

  async getPlanningPrompt(id: string, organizationId: string): Promise<string> {
    const task = await this.requireTask(id, organizationId);
    return this.buildPlanningKickoffPrompt(task.title);
  }

  async createFollowUpTasks(
    id: string,
    organizationId: string,
    userId: string,
  ): Promise<WorkspaceTaskDocument[]> {
    const task = await this.requireTask(id, organizationId);
    const threadId = await this.resolveAccessiblePlanningThreadId(
      task.planningThreadId,
      organizationId,
    );

    if (!threadId) {
      throw new BadRequestException(
        'No planning conversation exists for this workspace task yet.',
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

    const createdTasks: WorkspaceTaskDocument[] = [];

    for (const step of followUpSteps) {
      const createdTask = await this.create({
        brand: task.brand?.toString(),
        organization: organizationId,
        outputType: step.outputType ?? task.outputType,
        platforms: task.platforms,
        priority: task.priority,
        request: step.request,
        title: step.title,
        user: userId,
      } as CreateWorkspaceTaskDto & {
        organization: string;
        user: string;
      });

      createdTasks.push(createdTask);
    }

    return createdTasks;
  }

  private buildTaskTitle(createDto: CreateWorkspaceTaskDto): string {
    if (createDto.title?.trim()) {
      return createDto.title.trim();
    }

    const compactRequest = createDto.request.replace(/\s+/g, ' ').trim();
    if (compactRequest.length <= 72) {
      return compactRequest;
    }

    return `${compactRequest.slice(0, 69).trimEnd()}...`;
  }

  private async buildRoutingDecision(
    createDto: CreateWorkspaceTaskDto,
  ): Promise<WorkspaceRoutingDecision> {
    const inferredOutputType = this.inferOutputType(createDto);
    const taskIntent = this.buildTaskIntent(createDto, inferredOutputType);
    const brandId =
      typeof createDto.brand === 'string'
        ? createDto.brand || undefined
        : (
            createDto.brand as unknown as { toString(): string } | undefined
          )?.toString() || undefined;
    const organizationId =
      typeof (createDto as Record<string, unknown>).organization === 'string'
        ? ((createDto as Record<string, unknown>).organization as string) ||
          undefined
        : (
            (createDto as Record<string, unknown>).organization as
              | { toString(): string }
              | undefined
          )?.toString() || undefined;

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

    return this.buildFallbackRoutingDecision(createDto, inferredOutputType);
  }

  private buildTaskIntent(
    createDto: CreateWorkspaceTaskDto,
    outputType: WorkspaceTaskDocument['outputType'],
  ): TaskIntent {
    const normalizedPlatforms = (createDto.platforms ?? []).map((platform) =>
      platform.toLowerCase(),
    );
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
    createDto: CreateWorkspaceTaskDto,
  ): WorkspaceTaskDocument['outputType'] {
    const normalizedRequest = createDto.request.toLowerCase();

    return (
      createDto.outputType ??
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
                : 'ingredient')
    );
  }

  private buildSkillDrivenDecision(
    createDto: CreateWorkspaceTaskDto,
    taskIntent: TaskIntent,
    matchedSkill: Awaited<
      ReturnType<SkillsService['resolveBrandSkills']>
    >[number],
  ): WorkspaceRoutingDecision {
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
        ? 'needs_review'
        : executionPathUsed === 'agent_orchestrator'
          ? 'triaged'
          : 'in_progress',
    };
  }

  private buildFallbackRoutingDecision(
    _createDto: CreateWorkspaceTaskDto,
    inferredOutputType: WorkspaceTaskDocument['outputType'],
  ): WorkspaceRoutingDecision {
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
          status: 'triaged',
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
          status: 'triaged',
        };
    }
  }

  private skillRequiresApproval(skill: SkillDocument): boolean {
    const reviewDefaults = skill.reviewDefaults;

    if (!reviewDefaults) {
      return skill.workflowStage === 'review';
    }

    const requiresApproval = reviewDefaults.requiresApproval;

    return typeof requiresApproval === 'boolean' ? requiresApproval : false;
  }

  private async patchTaskAndReturn(
    id: string,
    organizationId: string,
    patch: Record<string, unknown>,
  ): Promise<WorkspaceTaskDocument | null> {
    if (Object.keys(patch).length === 0) {
      return this.findOneById(id, organizationId);
    }

    const result = await this.prisma.workspaceTask.update({
      data: patch as never,
      where: { id },
    });
    return result as unknown as WorkspaceTaskDocument | null;
  }

  private async requireTask(
    id: string,
    organizationId: string,
  ): Promise<WorkspaceTaskDocument> {
    const task = await this.findOneById(id, organizationId);

    if (!task) {
      throw new NotFoundException('WorkspaceTask', id);
    }

    return task;
  }

  private async requireLinkedOutputTask(
    id: string,
    organizationId: string,
    outputId: string,
  ): Promise<WorkspaceTaskDocument> {
    const task = await this.requireTask(id, organizationId);
    const isLinked = task.linkedOutputIds.some(
      (linkedOutputId) => linkedOutputId.toString() === outputId,
    );

    if (!isLinked) {
      throw new BadRequestException(
        'This output is not linked to the requested workspace task.',
      );
    }

    return task;
  }

  private createTaskEvent(input: WorkspaceTaskEventInput): WorkspaceTaskEvent {
    return {
      id: crypto.randomUUID(),
      payload: input.payload,
      timestamp: input.timestamp ?? new Date(),
      type: input.type,
    };
  }

  private serializeTaskProgress(
    progress: WorkspaceTaskDocument['progress'],
  ): WorkspaceTaskProgress {
    return {
      activeRunCount: progress?.activeRunCount ?? 0,
      message: progress?.message,
      percent: progress?.percent ?? 0,
      stage: progress?.stage,
    };
  }

  private serializeTaskEvent(event: WorkspaceTaskEvent) {
    return {
      id: event.id,
      payload: event.payload,
      timestamp: event.timestamp.toISOString(),
      type: event.type,
    };
  }

  private serializeTaskRealtimeSnapshot(task: WorkspaceTaskDocument) {
    return {
      approvedOutputIds: task.approvedOutputIds.map((id) => id.toString()),
      brand: task.brand?.toString(),
      chosenModel: task.chosenModel,
      chosenProvider: task.chosenProvider,
      completedAt: task.completedAt?.toISOString(),
      createdAt: task.createdAt?.toISOString(),
      decomposition: task.decomposition,
      dismissedAt: task.dismissedAt?.toISOString(),
      eventStream: task.eventStream.map((event) =>
        this.serializeTaskEvent(event),
      ),
      executionPathUsed: task.executionPathUsed,
      failureReason: task.failureReason,
      id: task._id.toString(),
      linkedApprovalIds: task.linkedApprovalIds.map((id) => id.toString()),
      linkedIssueId: task.linkedIssueId?.toString(),
      linkedOutputIds: task.linkedOutputIds.map((id) => id.toString()),
      linkedRunIds: task.linkedRunIds.map((id) => id.toString()),
      organization: task.organization.toString(),
      outputType: task.outputType,
      planningThreadId: task.planningThreadId,
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
      skillVariantIds: task.skillVariantIds.map((id) => id.toString()),
      status: task.status,
      title: task.title,
      updatedAt: task.updatedAt?.toISOString(),
      user: task.user.toString(),
    };
  }

  private async appendEventAndBroadcast(
    task: WorkspaceTaskDocument,
    organizationId: string,
    userId: string,
    eventInput: WorkspaceTaskEventInput,
  ): Promise<void> {
    const event = this.createTaskEvent(eventInput);
    const taskId = String(
      (task as unknown as Record<string, unknown>)._id ??
        (task as unknown as { id: string }).id,
    );

    // Read current eventStream then append new event
    const current = await this.prisma.workspaceTask.findFirst({
      where: { id: taskId, isDeleted: false, organizationId },
    });
    if (!current) return;

    const currentDoc = current as unknown as Record<string, unknown>;
    const eventStream = [
      ...((currentDoc.eventStream as unknown[]) ?? []),
      event,
    ];

    const updated = await this.prisma.workspaceTask.update({
      data: { eventStream: eventStream as never } as never,
      where: { id: taskId },
    });

    if (!updated) {
      return;
    }

    const updatedDoc = updated as unknown as WorkspaceTaskDocument;
    const payload: WorkspaceTaskRealtimePayload = {
      event: this.serializeTaskEvent(event),
      organizationId,
      progress: this.serializeTaskProgress(updatedDoc.progress),
      room: `org-${organizationId}`,
      task: this.serializeTaskRealtimeSnapshot(updatedDoc),
      taskId,
      userId,
    };

    await Promise.all([
      this.notificationsPublisher.emit(
        WebSocketPaths.workspaceTask(taskId),
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
    if (!planningThreadId) {
      return null;
    }

    const thread = await this.agentThreadsService.findOne({
      _id: planningThreadId,
      isDeleted: false,
      organizationId,
    });

    return thread
      ? String(
          (thread as unknown as Record<string, unknown>)._id ??
            (thread as unknown as { id: string }).id,
        )
      : null;
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
    return `${WORKSPACE_PLANNING_THREAD_SOURCE_PREFIX}${taskId}`;
  }

  private buildPlanningThreadTitle(taskTitle: string): string {
    const normalized = taskTitle.trim();
    const title = normalized.length > 0 ? normalized : 'Workspace task';

    return `${WORKSPACE_PLANNING_THREAD_TITLE_PREFIX}${title}`.slice(0, 140);
  }

  private buildPlanningKickoffPrompt(taskTitle: string): string {
    const subject = taskTitle.trim() || 'this workspace task';

    return `Review ${subject} and tell me what has already been done, what remains unresolved, what SHOULD happen next, and what COULD happen next.`;
  }

  private async buildPlanningSystemPrompt(
    task: WorkspaceTaskDocument,
    organizationId: string,
  ): Promise<string> {
    const linkedRuns = await this.buildLinkedRunSummaries(task, organizationId);
    const bundle = {
      decomposition: task.decomposition ?? null,
      failureReason: task.failureReason ?? null,
      linkedApprovalIds: task.linkedApprovalIds.map((id) => id.toString()),
      linkedOutputIds: task.linkedOutputIds.map((id) => id.toString()),
      linkedRunIds: task.linkedRunIds.map((id) => id.toString()),
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
      "You are Genfeed's task-aware planning assistant for a single workspace task.",
      'Use the live task bundle below as the source of truth for what has already happened.',
      'Stay conversational and concise, but be explicit about state.',
      'When you answer planning questions, you must:',
      '1. Summarize what has already been done.',
      '2. Separate what is complete from what remains unresolved.',
      '3. Recommend what SHOULD happen next.',
      '4. List what COULD happen next as optional follow-ups.',
      '5. When appropriate, propose a sequenced multi-task plan where each step is concrete enough to become a follow-up workspace task.',
      '',
      'Live workspace task bundle:',
      JSON.stringify(bundle, null, 2),
    ].join('\n');
  }

  private async buildLinkedRunSummaries(
    task: WorkspaceTaskDocument,
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

    for (const linkedRunId of task.linkedRunIds) {
      const run = await this.agentRunsService.getById(
        linkedRunId.toString(),
        organizationId,
      );

      if (!run) {
        continue;
      }

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
      if (message.role !== 'assistant') {
        return false;
      }

      const proposedPlan = message.metadata?.proposedPlan;

      return (
        proposedPlan !== null &&
        typeof proposedPlan === 'object' &&
        !Array.isArray(proposedPlan)
      );
    });

    if (!latestPlanningMessage?.metadata?.proposedPlan) {
      throw new BadRequestException(
        'No proposed plan is available in the planning conversation yet.',
      );
    }

    const plan = latestPlanningMessage.metadata.proposedPlan;
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
    task: WorkspaceTaskDocument,
  ): WorkspaceFollowUpPlanStep[] {
    const steps = Array.isArray(plan.steps) ? plan.steps : [];

    return steps.flatMap((step) => {
      if (!step || typeof step !== 'object' || Array.isArray(step)) {
        return [];
      }

      const title =
        this.readStringField(step, [
          'step',
          'title',
          'task',
          'label',
          'name',
        ]) ?? null;

      if (!title) {
        return [];
      }

      const detail =
        this.readStringField(step, [
          'details',
          'description',
          'request',
          'summary',
          'brief',
        ]) ?? '';

      const request = [
        detail.length > 0 ? `${title}\n\n${detail}` : title,
        `Source workspace task: ${task.title} (${task._id.toString()})`,
        `Original task request: ${task.request}`,
      ].join('\n\n');

      const outputType = this.normalizeOutputType(
        this.readStringField(step, ['outputType', 'type']),
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
  ): WorkspaceTaskDocument['outputType'] | null {
    if (!value) {
      return null;
    }

    return [
      'caption',
      'image',
      'ingredient',
      'newsletter',
      'post',
      'video',
    ].includes(value)
      ? (value as WorkspaceTaskDocument['outputType'])
      : null;
  }

  private readStringField(
    value: Record<string, unknown>,
    keys: string[],
  ): string | null {
    for (const key of keys) {
      const candidate = value[key];
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }

    return null;
  }
}

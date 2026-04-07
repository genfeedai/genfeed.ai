import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { SkillDocument } from '@api/collections/skills/schemas/skill.schema';
import { SkillsService } from '@api/collections/skills/services/skills.service';
import { CreateWorkspaceTaskDto } from '@api/collections/workspace-tasks/dto/create-workspace-task.dto';
import { UpdateWorkspaceTaskDto } from '@api/collections/workspace-tasks/dto/update-workspace-task.dto';
import {
  WorkspaceTask,
  type WorkspaceTaskDocument,
} from '@api/collections/workspace-tasks/schemas/workspace-task.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

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
    @InjectModel(WorkspaceTask.name, DB_CONNECTIONS.CLOUD)
    model: AggregatePaginateModel<WorkspaceTaskDocument>,
    logger: LoggerService,
    private readonly skillsService: SkillsService,
    private readonly agentThreadsService: AgentThreadsService,
    private readonly agentMessagesService: AgentMessagesService,
    private readonly agentRunsService: AgentRunsService,
  ) {
    super(model, logger);
  }

  override async create(
    createDto: CreateWorkspaceTaskDto,
  ): Promise<WorkspaceTaskDocument> {
    const routingDecision = await this.buildRoutingDecision(createDto);
    const normalizedTitle = this.buildTaskTitle(createDto);

    return super.create({
      ...createDto,
      ...routingDecision,
      linkedApprovalIds: [],
      linkedOutputIds: [],
      linkedRunIds: [],
      platforms: createDto.platforms ?? [],
      title: normalizedTitle,
    });
  }

  async findOneById(
    id: string,
    organizationId: string,
  ): Promise<WorkspaceTaskDocument | null> {
    return this.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });
  }

  async listInbox(
    organizationId: string,
    limit: number = 20,
  ): Promise<WorkspaceTaskDocument[]> {
    return this.model
      .find({
        $or: [
          { reviewState: { $in: ['pending_approval', 'changes_requested'] } },
          { status: { $in: ['completed', 'failed'] } },
        ],
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      })
      .sort({
        reviewState: 1,
        updatedAt: -1,
      })
      .limit(limit)
      .exec();
  }

  async approve(
    id: string,
    organizationId: string,
  ): Promise<WorkspaceTaskDocument> {
    const updated = await this.model.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      {
        $set: {
          completedAt: new Date(),
          reviewState: 'approved',
          status: 'completed',
        },
        $unset: {
          failureReason: '',
          requestedChangesReason: '',
        },
      },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('WorkspaceTask', id);
    }

    return updated;
  }

  async requestChanges(
    id: string,
    organizationId: string,
    reason: string,
  ): Promise<WorkspaceTaskDocument> {
    const updated = await this.model.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      {
        $set: {
          requestedChangesReason: reason,
          reviewState: 'changes_requested',
          status: 'needs_review',
        },
      },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('WorkspaceTask', id);
    }

    return updated;
  }

  async dismiss(
    id: string,
    organizationId: string,
    reason?: string,
  ): Promise<WorkspaceTaskDocument> {
    const updated = await this.model.findOneAndUpdate(
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
          status: 'dismissed',
        },
      },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('WorkspaceTask', id);
    }

    return updated;
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
      organization: new Types.ObjectId(organizationId),
      planModeEnabled: true,
      source: this.buildPlanningThreadSource(id),
      systemPrompt,
      title: this.buildPlanningThreadTitle(task.title),
      user: new Types.ObjectId(userId),
    } as Record<string, unknown>);

    const threadId = String(thread._id);
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
      (createDto.brand as unknown as Types.ObjectId | undefined)?.toString() ||
      undefined;
    const organizationId =
      (
        createDto as CreateWorkspaceTaskDto & { organization?: Types.ObjectId }
      ).organization?.toString() || undefined;

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
        : normalizedRequest.match(/\b(caption|copy|text|hook|thread|post)\b/)
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
          : taskIntent.outputType === 'caption'
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
    createDto: CreateWorkspaceTaskDto,
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
        return {
          chosenModel: 'auto',
          chosenProvider: 'genfeed-router',
          executionPathUsed: 'caption_generation',
          outputType: 'caption',
          resultPreview: `Draft caption prepared for review: ${this.buildTaskTitle(createDto)}`,
          reviewState: 'pending_approval',
          reviewTriggered: true,
          routingSummary:
            'Detected a writing request and routed it to the caption generation path for review.',
          skillsUsed: [],
          skillVariantIds: [],
          status: 'needs_review',
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

    return ['caption', 'image', 'ingredient', 'video'].includes(value)
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

import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { TaskCountersService } from '@api/collections/task-counters/services/task-counters.service';
import { CreateTaskDto } from '@api/collections/tasks/dto/create-task.dto';
import { type TaskDocument } from '@api/collections/tasks/schemas/task.schema';
import type { TasksService } from '@api/collections/tasks/services/tasks.service';
import { TASKS_SERVICE } from '@api/collections/tasks/tasks.tokens';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { scopedWhere } from '@api/index';
import { AgentOrchestratorService } from '@api/services/agent-orchestrator/agent-orchestrator.service';
import { WorkspaceTaskWorkflowQueueService } from '@api/services/task-orchestration/workspace-task-workflow-queue.service';
import { serializeWorkspaceTaskDate } from '@genfeedai/serializers';
import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';

const PLANNING_THREAD_SOURCE_PREFIX = 'workspace-planning:';
const PLANNING_THREAD_TITLE_PREFIX = 'Plan next steps: ';

export type PlanningThreadResult = {
  created: boolean;
  seeded: boolean;
  threadId: string;
};

type FollowUpPlanStep = {
  outputType?: TaskDocument['outputType'];
  request: string;
  title: string;
};

/**
 * Planning-thread + follow-up-task orchestration for tasks. Extracted out of
 * `TasksService` (which keeps thin delegating methods so the HTTP contract is
 * unchanged). Persistence/CRUD is delegated back to `TasksService`.
 */
@Injectable()
export class TaskPlanningService {
  constructor(
    @Inject(TASKS_SERVICE)
    private readonly tasksService: TasksService,
    private readonly agentThreadsService: AgentThreadsService,
    private readonly agentMessagesService: AgentMessagesService,
    private readonly workflowExecutionsService: WorkflowExecutionsService,
    private readonly taskCountersService: TaskCountersService,
    private readonly organizationsService: OrganizationsService,
    private readonly agentOrchestratorService: AgentOrchestratorService,
    @Optional()
    private readonly workspaceTaskWorkflowQueue?: WorkspaceTaskWorkflowQueueService,
  ) {}

  async openPlanningThread(
    id: string,
    organizationId: string,
    userId: string,
  ): Promise<PlanningThreadResult> {
    const task = await this.tasksService.requireTask(id, organizationId);
    const systemPrompt = await this.buildPlanningSystemPrompt(
      task,
      organizationId,
    );
    const planningThreadIdStr = task.planningThreadId?.toString();
    const existingThreadId = await this.resolveAccessiblePlanningThreadId(
      planningThreadIdStr,
      organizationId,
    );

    let planThread: PlanningThreadResult;
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
      planThread = {
        created: false,
        seeded: await this.shouldSeedPlanningThread(
          existingThreadId,
          organizationId,
        ),
        threadId: existingThreadId,
      };
    } else {
      const thread = await this.agentThreadsService.create({
        organizationId,
        planModeEnabled: true,
        source: this.buildPlanningThreadSource(id),
        systemPrompt,
        title: this.buildPlanningThreadTitle(task.title),
        userId,
      } as Record<string, unknown>);

      const threadId = (thread as Record<string, unknown>).id as string;
      await this.tasksService.patch(id, {
        planningThreadId: threadId,
      } as Record<string, unknown>);
      planThread = { created: true, seeded: true, threadId };
    }

    if (planThread.seeded) {
      await this.seedPlanningThread(id, organizationId, userId, planThread);
    }

    return planThread;
  }

  async getPlanningPrompt(id: string, organizationId: string): Promise<string> {
    const task = await this.tasksService.requireTask(id, organizationId);
    return this.buildPlanningKickoffPrompt(task.title);
  }

  async createFollowUpTasks(
    id: string,
    organizationId: string,
    userId: string,
  ): Promise<TaskDocument[]> {
    const task = await this.tasksService.requireTask(id, organizationId);
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

    const taskOrgId =
      ((task as Record<string, unknown>).organizationId as string) ??
      organizationId;
    const org = await this.organizationsService.findOne({
      id: taskOrgId,
    });

    const tasks = await Promise.all(
      followUpSteps.map(async (step) => {
        const taskNumber =
          await this.taskCountersService.getNextNumber(taskOrgId);
        const identifier = `${org?.prefix ?? 'TASK'}-${taskNumber}`;
        return this.tasksService.create({
          brandId: (task as Record<string, unknown>).brandId as string,
          identifier,
          organizationId: taskOrgId,
          outputType: step.outputType ?? task.outputType,
          platforms: task.platforms,
          priority: task.priority,
          request: step.request,
          taskNumber,
          title: step.title,
          userId,
        } as CreateTaskDto & {
          identifier: string;
          organizationId: string;
          taskNumber: number;
          userId: string;
        });
      }),
    );

    const workspaceTaskWorkflowQueue = this.workspaceTaskWorkflowQueue;
    if (workspaceTaskWorkflowQueue) {
      await Promise.all(
        tasks.map((createdTask) => {
          const taskExt = createdTask as TaskDocument & {
            outputType?: string;
            platforms?: string[];
            request?: string;
          };
          return workspaceTaskWorkflowQueue.enqueue({
            brandId: createdTask.brandId ?? undefined,
            organizationId,
            outputType: taskExt.outputType,
            platforms: taskExt.platforms,
            request: taskExt.request,
            taskId: createdTask.id.toString(),
            userId,
          });
        }),
      );
    }

    return tasks;
  }

  private async seedPlanningThread(
    id: string,
    organizationId: string,
    userId: string,
    planThread: PlanningThreadResult,
  ): Promise<void> {
    const prompt = await this.getPlanningPrompt(id, organizationId);
    await this.agentOrchestratorService.chat(
      {
        content: prompt,
        planModeEnabled: true,
        source: 'agent',
        threadId: planThread.threadId,
      },
      { organizationId, userId },
    );
  }

  private readObjectRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private async resolveAccessiblePlanningThreadId(
    planningThreadId: string | undefined,
    organizationId: string,
  ): Promise<string | null> {
    if (!planningThreadId) return null;
    const thread = await this.agentThreadsService.findOne(
      scopedWhere(organizationId, { id: planningThreadId }),
    );
    return thread ? ((thread as Record<string, unknown>).id as string) : null;
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
    const linkedExecutions = await this.buildLinkedExecutionSummaries(
      task,
      organizationId,
    );
    const taskId = (task as Record<string, unknown>).id as string;
    const bundle = {
      decomposition: task.decomposition ?? null,
      dismissedReason: task.dismissedReason ?? null,
      failureReason: task.failureReason ?? null,
      linkedApprovalIds: (task.linkedApprovalIds ?? []).map((id) =>
        id.toString(),
      ),
      linkedOutputIds: (task.linkedOutputIds ?? []).map((id) => id.toString()),
      linkedExecutionIds: (task.linkedExecutionIds ?? []).map((id) =>
        id.toString(),
      ),
      linkedExecutions,
      outputType: task.outputType,
      platforms: task.platforms,
      priority: task.priority,
      requestedChangesReason: task.requestedChangesReason ?? null,
      resultPreview: task.resultPreview ?? null,
      reviewState: task.reviewState,
      reviewTriggered: task.reviewTriggered,
      routingSummary: task.routingSummary ?? null,
      status: task.status,
      taskId,
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

  private async buildLinkedExecutionSummaries(
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
    const executionSummaries: Array<{
      completedAt?: string;
      error?: string;
      id: string;
      label: string;
      startedAt?: string;
      status: string;
      summary?: string;
      threadId?: string;
    }> = [];

    for (const linkedExecutionId of task.linkedExecutionIds ?? []) {
      const execution = await this.workflowExecutionsService.findOne(
        scopedWhere(organizationId, { id: linkedExecutionId.toString() }),
      );

      if (!execution) {
        continue;
      }

      const metadata = execution.metadata ?? {};
      const workflow =
        execution.workflow && typeof execution.workflow === 'object'
          ? (execution.workflow as Record<string, unknown>)
          : undefined;

      executionSummaries.push({
        completedAt: serializeWorkspaceTaskDate(execution.completedAt),
        error:
          typeof execution.error === 'string' ? execution.error : undefined,
        id: execution.id,
        label:
          typeof workflow?.label === 'string'
            ? workflow.label
            : typeof metadata.label === 'string'
              ? metadata.label
              : 'Workflow execution',
        startedAt: serializeWorkspaceTaskDate(execution.startedAt),
        status: execution.status,
        summary:
          typeof metadata.summary === 'string' ? metadata.summary : undefined,
        threadId:
          typeof metadata.threadId === 'string' ? metadata.threadId : undefined,
      });
    }

    return executionSummaries;
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
      const metadata = this.readObjectRecord(message.metadata);
      const proposedPlan = metadata?.['proposedPlan'];
      return (
        proposedPlan !== null &&
        typeof proposedPlan === 'object' &&
        !Array.isArray(proposedPlan)
      );
    });

    const latestMetadata = this.readObjectRecord(
      latestPlanningMessage?.metadata,
    );
    const plan = latestMetadata?.['proposedPlan'];

    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
      throw new BadRequestException(
        'No proposed plan is available in the planning conversation yet.',
      );
    }

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
    const taskId = (task as Record<string, unknown>).id as string;

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
        `Source task: ${task.title} (${taskId})`,
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
      'facecam',
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
}

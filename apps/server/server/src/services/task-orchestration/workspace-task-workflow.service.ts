import { AgentExecutionTrigger } from '@genfeedai/enums';
import type { AgentRunJobData } from '@genfeedai/queue-contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, Injectable, type OnModuleInit } from '@nestjs/common';
import { AgentRunsService } from '@server/collections/agent-runs/services/agent-runs.service';
import { TasksService } from '@server/collections/tasks/services/tasks.service';
import { AvatarVideoGenerationService } from '@server/collections/videos/services/avatar-video-generation.service';
import type { SystemWorkflowActionRequest } from '@server/collections/workflows/system-workflow-runner.service';
import { SystemWorkflowRunnerService } from '@server/collections/workflows/system-workflow-runner.service';
import { AgentRunQueueService } from '@server/queues/agent-run/agent-run-queue.service';
import { HeygenPollQueueService } from '@server/queues/heygen-poll/heygen-poll-queue.service';
import type {
  DecomposedSubtask,
  TaskDecompositionResult,
} from '@server/services/task-orchestration/interfaces/task-decomposition.interface';
import { TaskDecompositionService } from '@server/services/task-orchestration/task-decomposition.service';
import {
  WORKSPACE_TASK_ACTION_IDS,
  WORKSPACE_TASK_WORKFLOW_DEFINITIONS,
  type WorkspaceTaskWorkflowRequest,
} from '@server/services/task-orchestration/workspace-task-workflow-definition';

type AgentRunItem = WorkspaceTaskWorkflowRequest & {
  subtask: DecomposedSubtask;
};

type AgentRunState = AgentRunItem & {
  runId: string;
};

type FacecamState = WorkspaceTaskWorkflowRequest & {
  externalId?: string;
  generation: {
    avatarId?: string;
    clonedVoiceId?: string;
    heygenVoiceId?: string;
    text: string;
    useIdentity: boolean;
    voiceProvider?: string;
  };
  ingredientId?: string;
  resolvedVoiceProvider: string;
};

type ForEachResult = {
  count: number;
  results: Array<{ index: number; result: unknown }>;
};

@Injectable()
export class WorkspaceTaskWorkflowService implements OnModuleInit {
  private readonly logContext = 'WorkspaceTaskWorkflowService';

  constructor(
    private readonly decompositionService: TaskDecompositionService,
    private readonly agentRunsService: AgentRunsService,
    private readonly agentRunQueueService: AgentRunQueueService,
    private readonly tasksService: TasksService,
    private readonly avatarVideoGenerationService: AvatarVideoGenerationService,
    private readonly heygenPollQueueService: HeygenPollQueueService,
    private readonly configService: ConfigService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit(): void {
    const actions = [
      [WORKSPACE_TASK_ACTION_IDS.ROUTE, this.routeTask.bind(this)],
      [WORKSPACE_TASK_ACTION_IDS.FINALIZE, this.finalizeTask.bind(this)],
      [
        WORKSPACE_TASK_ACTION_IDS.AGENT_DECOMPOSE,
        this.decomposeTask.bind(this),
      ],
      [
        WORKSPACE_TASK_ACTION_IDS.AGENT_PLAN_RUNS,
        this.planAgentRuns.bind(this),
      ],
      [
        WORKSPACE_TASK_ACTION_IDS.AGENT_RUN_CREATE,
        this.createAgentRun.bind(this),
      ],
      [
        WORKSPACE_TASK_ACTION_IDS.AGENT_RUN_ENQUEUE,
        this.enqueueAgentRun.bind(this),
      ],
      [
        WORKSPACE_TASK_ACTION_IDS.AGENT_RECORD_RUN,
        this.recordAgentRun.bind(this),
      ],
      [
        WORKSPACE_TASK_ACTION_IDS.AGENT_LINK_RUNS,
        this.linkAgentRuns.bind(this),
      ],
      [
        WORKSPACE_TASK_ACTION_IDS.FACECAM_PREPARE,
        this.prepareFacecam.bind(this),
      ],
      [
        WORKSPACE_TASK_ACTION_IDS.FACECAM_RECORD_START,
        this.recordFacecamStart.bind(this),
      ],
      [
        WORKSPACE_TASK_ACTION_IDS.FACECAM_GENERATE,
        this.generateFacecam.bind(this),
      ],
      [
        WORKSPACE_TASK_ACTION_IDS.FACECAM_ATTACH_OUTPUT,
        this.attachFacecamOutput.bind(this),
      ],
      [
        WORKSPACE_TASK_ACTION_IDS.FACECAM_RECORD_DISPATCH,
        this.recordFacecamDispatch.bind(this),
      ],
      [
        WORKSPACE_TASK_ACTION_IDS.FACECAM_SCHEDULE_POLL,
        this.scheduleFacecamPoll.bind(this),
      ],
    ] as const;

    for (const [actionId, execute] of actions) {
      this.workflowRunner.registerAction(actionId, execute);
    }
    for (const definition of WORKSPACE_TASK_WORKFLOW_DEFINITIONS) {
      this.workflowRunner.registerWorkflow(definition);
    }
  }

  private routeTask(request: SystemWorkflowActionRequest): {
    agentItems: WorkspaceTaskWorkflowRequest[];
    facecamItems: WorkspaceTaskWorkflowRequest[];
  } {
    const input = this.readRequest(request);
    const isFacecam = input.outputType === 'facecam';
    return {
      agentItems: isFacecam ? [] : [input],
      facecamItems: isFacecam ? [input] : [],
    };
  }

  private finalizeTask(request: SystemWorkflowActionRequest): unknown {
    const input = this.readRequest(request);
    const batch = this.readForEachResult(
      input.outputType === 'facecam'
        ? request.input.facecamBatch
        : request.input.agentBatch,
    );
    const first = batch.results.at(0);
    if (!first) {
      throw new Error(
        `Workspace task ${input.taskId} completed without result`,
      );
    }
    return first.result;
  }

  private async decomposeTask(
    request: SystemWorkflowActionRequest,
  ): Promise<
    WorkspaceTaskWorkflowRequest & { decomposition: TaskDecompositionResult }
  > {
    const input = this.readRequest(request);
    return this.withTaskFailure(input, async () => {
      const decomposition = await this.decompositionService.decompose(
        {
          brandName: input.brandName,
          outputType: input.outputType,
          platforms: input.platforms,
          request: input.request,
        },
        input.organizationId,
      );
      return { ...input, decomposition };
    });
  }

  private async planAgentRuns(
    request: SystemWorkflowActionRequest,
  ): Promise<{ items: AgentRunItem[] }> {
    const input = this.readRequest(request);
    const state = this.readRecord(request.input.state, 'agent state');
    const decomposition = this.readDecomposition(state.decomposition);

    return this.withTaskFailure(input, async () => {
      await this.tasksService.recordTaskEvent(
        input.taskId,
        input.organizationId,
        input.userId,
        {
          payload: {
            subtaskCount: decomposition.subtasks.length,
            summary: decomposition.routingSummary,
          },
          type: 'task_started',
        },
        {
          decomposition: {
            isSingleAgent: decomposition.isSingleAgent,
            subtasks: decomposition.subtasks.map((subtask) => ({
              agentType: subtask.agentType,
              brief: subtask.brief,
              label: subtask.label,
              order: subtask.order,
            })),
            summary: decomposition.routingSummary,
          },
          executionPathUsed: 'agent_orchestrator',
          progress: {
            activeRunCount: decomposition.subtasks.length,
            message: 'Preparing agent runs for execution.',
            percent: 5,
            stage: 'orchestrating',
          },
          routingSummary: decomposition.routingSummary,
          status: 'in_progress',
        },
      );

      return {
        items: decomposition.subtasks
          .toSorted((left, right) => left.order - right.order)
          .map((subtask) => ({ ...input, subtask })),
      };
    });
  }

  private async createAgentRun(
    request: SystemWorkflowActionRequest,
  ): Promise<AgentRunState> {
    const item = this.readAgentRunItem(request.input.request);
    return this.withTaskFailure(item, async () => {
      const run = await this.agentRunsService.create({
        label: item.subtask.label,
        metadata: {
          workspaceTaskId: item.taskId,
          workflowHandoff: {
            workflowExecutionId: request.provenance.executionId,
            workflowId: request.provenance.workflowId,
            workflowNodeId: request.provenance.nodeId,
          },
        },
        objective: item.subtask.brief,
        organizationId: item.organizationId,
        trigger: AgentExecutionTrigger.EVENT,
        userId: item.userId,
      });
      return { ...item, runId: run.id.toString() };
    });
  }

  private async enqueueAgentRun(
    request: SystemWorkflowActionRequest,
  ): Promise<AgentRunState> {
    const state = this.readAgentRunState(request.input.state);
    return this.withTaskFailure(state, async () => {
      const jobData: AgentRunJobData = {
        agentType: state.subtask.agentType,
        objective: state.subtask.brief,
        organizationId: state.organizationId,
        runId: state.runId,
        userId: state.userId,
      };
      await this.agentRunQueueService.queueRun(jobData);
      return state;
    });
  }

  private async recordAgentRun(
    request: SystemWorkflowActionRequest,
  ): Promise<AgentRunState> {
    const state = this.readAgentRunState(request.input.state);
    return this.withTaskFailure(state, async () => {
      await this.tasksService.recordTaskEvent(
        state.taskId,
        state.organizationId,
        state.userId,
        {
          payload: {
            agentType: state.subtask.agentType,
            label: state.subtask.label,
            runId: state.runId,
          },
          type: 'run_queued',
        },
      );
      return state;
    });
  }

  private async linkAgentRuns(
    request: SystemWorkflowActionRequest,
  ): Promise<{ runIds: string[]; taskId: string }> {
    const input = this.readRequest(request);
    const batch = this.readForEachResult(request.input.batch);
    const runIds = batch.results
      .toSorted((left, right) => left.index - right.index)
      .map((entry) => this.readAgentRunState(entry.result).runId);

    return this.withTaskFailure(input, async () => {
      await this.tasksService.recordTaskEvent(
        input.taskId,
        input.organizationId,
        input.userId,
        { payload: { runIds }, type: 'runs_linked' },
        {
          linkedRunIds: runIds,
          progress: {
            activeRunCount: runIds.length,
            message: `Queued ${runIds.length} run${runIds.length === 1 ? '' : 's'} for execution.`,
            percent: 10,
            stage: 'queued',
          },
          status: 'in_progress',
        },
      );
      return { runIds, taskId: input.taskId };
    });
  }

  private prepareFacecam(request: SystemWorkflowActionRequest): FacecamState {
    const input = this.readRequest(request);
    if (input.request.trim().length === 0) {
      throw new Error('Facecam task requires non-empty request text (script).');
    }

    const hasExplicitAvatar = Boolean(input.heygenAvatarId);
    const voiceProvider =
      input.voiceProvider || (input.voiceId ? 'heygen' : '');
    const hasExplicitVoice = Boolean(input.voiceId && voiceProvider);
    const generation: FacecamState['generation'] = {
      ...(hasExplicitAvatar ? { avatarId: input.heygenAvatarId } : {}),
      text: input.request,
      useIdentity: !hasExplicitAvatar || !hasExplicitVoice,
    };
    if (input.voiceId && voiceProvider === 'heygen') {
      generation.heygenVoiceId = input.voiceId;
    } else if (input.voiceId && voiceProvider) {
      generation.clonedVoiceId = input.voiceId;
      generation.voiceProvider = voiceProvider;
    }

    return { ...input, generation, resolvedVoiceProvider: voiceProvider };
  }

  private async recordFacecamStart(
    request: SystemWorkflowActionRequest,
  ): Promise<FacecamState> {
    const state = this.readFacecamState(request.input.state);
    return this.withTaskFailure(state, async () => {
      await this.tasksService.recordTaskEvent(
        state.taskId,
        state.organizationId,
        state.userId,
        {
          payload: {
            elevenlabsVoiceId: state.elevenlabsVoiceId,
            heygenAvatarId: state.heygenAvatarId,
            useIdentity: state.generation.useIdentity,
            voiceId: state.voiceId,
            voiceProvider: state.resolvedVoiceProvider,
          },
          type: 'task_started',
        },
        {
          chosenProvider: state.resolvedVoiceProvider || 'heygen',
          executionPathUsed: 'video_generation',
          progress: {
            activeRunCount: 1,
            message: 'Generating facecam video.',
            percent: 10,
            stage: 'generating',
          },
          status: 'in_progress',
        },
      );
      return state;
    });
  }

  private async generateFacecam(
    request: SystemWorkflowActionRequest,
  ): Promise<FacecamState> {
    const state = this.readFacecamState(request.input.state);
    return this.withTaskFailure(state, async () => {
      const result =
        await this.avatarVideoGenerationService.generateAvatarVideo(
          { aspectRatio: '9:16', ...state.generation },
          {
            brandId: state.brandId,
            organizationId: state.organizationId,
            userId: state.userId,
          },
        );
      return {
        ...state,
        externalId: result.externalId,
        ingredientId: result.ingredientId,
      };
    });
  }

  private async attachFacecamOutput(
    request: SystemWorkflowActionRequest,
  ): Promise<FacecamState> {
    const state = this.readCompletedFacecamState(request.input.state);
    return this.withTaskFailure(state, async () => {
      await this.tasksService.attachOutput(
        state.taskId,
        state.ingredientId,
        state.organizationId,
        state.userId,
      );
      return state;
    });
  }

  private async recordFacecamDispatch(
    request: SystemWorkflowActionRequest,
  ): Promise<FacecamState> {
    const state = this.readCompletedFacecamState(request.input.state);
    return this.withTaskFailure(state, async () => {
      await this.tasksService.recordTaskEvent(
        state.taskId,
        state.organizationId,
        state.userId,
        {
          payload: {
            externalId: state.externalId,
            ingredientId: state.ingredientId,
          },
          type: 'facecam_dispatched',
        },
        {
          progress: {
            activeRunCount: 1,
            message: 'Facecam video generation in progress.',
            percent: 35,
            stage: 'waiting_for_provider',
          },
        },
      );
      return state;
    });
  }

  private async scheduleFacecamPoll(
    request: SystemWorkflowActionRequest,
  ): Promise<FacecamState & { tracking: 'poll' | 'webhook' }> {
    const state = this.readCompletedFacecamState(request.input.state);
    return this.withTaskFailure(state, async () => {
      const webhooksUrl = this.configService.get('GENFEEDAI_WEBHOOKS_URL');
      if (typeof webhooksUrl === 'string' && webhooksUrl.length > 0) {
        return { ...state, tracking: 'webhook' };
      }

      await this.heygenPollQueueService.schedule({
        externalId: state.externalId,
        ingredientId: state.ingredientId,
        organizationId: state.organizationId,
        taskId: state.taskId,
        userId: state.userId,
      });
      return { ...state, tracking: 'poll' };
    });
  }

  private async withTaskFailure<T>(
    input: WorkspaceTaskWorkflowRequest,
    execute: () => Promise<T>,
  ): Promise<T> {
    try {
      return await execute();
    } catch (error: unknown) {
      const errorDetail =
        error instanceof HttpException
          ? ((error.getResponse() as { detail?: string }).detail ??
            error.message)
          : error instanceof Error
            ? error.message
            : String(error);
      this.logger.error(
        `${this.logContext}: Task ${input.taskId} failed`,
        error,
      );
      await this.tasksService
        .recordTaskEvent(
          input.taskId,
          input.organizationId,
          input.userId,
          { payload: { error: errorDetail }, type: 'task_failed' },
          {
            failureReason: errorDetail,
            progress: {
              activeRunCount: 0,
              message: errorDetail,
              percent: 100,
              stage: 'failed',
            },
            status: 'failed',
          },
        )
        .catch((patchError: unknown) => {
          this.logger.error(
            `${this.logContext}: Failed to record task failure`,
            patchError,
          );
        });
      throw error;
    }
  }

  private readRequest(
    request: SystemWorkflowActionRequest,
  ): WorkspaceTaskWorkflowRequest {
    const record = this.readRecord(request.input.request, 'request');
    const organizationId = this.requiredString(
      record.organizationId,
      'organizationId',
    );
    if (organizationId !== request.context.organizationId) {
      throw new Error('Workspace task workflow organization mismatch');
    }
    return {
      brandId: this.optionalString(record.brandId),
      brandName: this.optionalString(record.brandName),
      elevenlabsVoiceId: this.optionalString(record.elevenlabsVoiceId),
      heygenAvatarId: this.optionalString(record.heygenAvatarId),
      organizationId,
      outputType: this.optionalString(record.outputType),
      platforms: this.stringArray(record.platforms),
      request: this.requiredString(record.request, 'request'),
      taskId: this.requiredString(record.taskId, 'taskId'),
      userId: this.requiredString(record.userId, 'userId'),
      voiceId: this.optionalString(record.voiceId),
      voiceProvider: this.optionalString(record.voiceProvider),
    };
  }

  private readAgentRunItem(value: unknown): AgentRunItem {
    const record = this.readRecord(value, 'agent run item');
    return {
      ...this.readRequestValue(record),
      subtask: this.readSubtask(record.subtask),
    };
  }

  private readAgentRunState(value: unknown): AgentRunState {
    const record = this.readRecord(value, 'agent run state');
    return {
      ...this.readAgentRunItem(record),
      runId: this.requiredString(record.runId, 'runId'),
    };
  }

  private readFacecamState(value: unknown): FacecamState {
    const record = this.readRecord(value, 'facecam state');
    const generation = this.readRecord(record.generation, 'generation');
    return {
      ...this.readRequestValue(record),
      externalId: this.optionalString(record.externalId),
      generation: {
        avatarId: this.optionalString(generation.avatarId),
        clonedVoiceId: this.optionalString(generation.clonedVoiceId),
        heygenVoiceId: this.optionalString(generation.heygenVoiceId),
        text: this.requiredString(generation.text, 'generation.text'),
        useIdentity: generation.useIdentity === true,
        voiceProvider: this.optionalString(generation.voiceProvider),
      },
      ingredientId: this.optionalString(record.ingredientId),
      resolvedVoiceProvider:
        this.optionalString(record.resolvedVoiceProvider) ?? '',
    };
  }

  private readCompletedFacecamState(value: unknown): FacecamState & {
    externalId: string;
    ingredientId: string;
  } {
    const state = this.readFacecamState(value);
    return {
      ...state,
      externalId: this.requiredString(state.externalId, 'externalId'),
      ingredientId: this.requiredString(state.ingredientId, 'ingredientId'),
    };
  }

  private readRequestValue(
    record: Record<string, unknown>,
  ): WorkspaceTaskWorkflowRequest {
    return {
      brandId: this.optionalString(record.brandId),
      brandName: this.optionalString(record.brandName),
      elevenlabsVoiceId: this.optionalString(record.elevenlabsVoiceId),
      heygenAvatarId: this.optionalString(record.heygenAvatarId),
      organizationId: this.requiredString(
        record.organizationId,
        'organizationId',
      ),
      outputType: this.optionalString(record.outputType),
      platforms: this.stringArray(record.platforms),
      request: this.requiredString(record.request, 'request'),
      taskId: this.requiredString(record.taskId, 'taskId'),
      userId: this.requiredString(record.userId, 'userId'),
      voiceId: this.optionalString(record.voiceId),
      voiceProvider: this.optionalString(record.voiceProvider),
    };
  }

  private readDecomposition(value: unknown): TaskDecompositionResult {
    const record = this.readRecord(value, 'decomposition');
    if (!Array.isArray(record.subtasks) || record.subtasks.length === 0) {
      throw new Error('Workspace task decomposition requires subtasks');
    }
    return {
      isSingleAgent: record.isSingleAgent === true,
      routingSummary: this.requiredString(
        record.routingSummary,
        'routingSummary',
      ),
      subtasks: record.subtasks.map((item) => this.readSubtask(item)),
    };
  }

  private readSubtask(value: unknown): DecomposedSubtask {
    const record = this.readRecord(value, 'subtask');
    return {
      agentType: this.requiredString(
        record.agentType,
        'agentType',
      ) as DecomposedSubtask['agentType'],
      brief: this.requiredString(record.brief, 'brief'),
      label: this.requiredString(record.label, 'label'),
      order: this.requiredNumber(record.order, 'order'),
    };
  }

  private readForEachResult(value: unknown): ForEachResult {
    const record = this.readRecord(value, 'for-each result');
    if (!Array.isArray(record.results)) {
      throw new Error('Workspace task workflow requires child results');
    }
    return {
      count: this.requiredNumber(record.count, 'count'),
      results: record.results.map((item) => {
        const entry = this.readRecord(item, 'child result');
        return {
          index: this.requiredNumber(entry.index, 'index'),
          result: entry.result,
        };
      }),
    };
  }

  private readRecord(value: unknown, field: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Workspace task workflow requires ${field}`);
    }
    return value as Record<string, unknown>;
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`Workspace task workflow requires ${field}`);
    }
    return value.trim();
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  private requiredNumber(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Workspace task workflow requires numeric ${field}`);
    }
    return value;
  }

  private stringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const strings = value.filter(
      (item): item is string => typeof item === 'string' && item.length > 0,
    );
    return strings.length > 0 ? strings : undefined;
  }
}

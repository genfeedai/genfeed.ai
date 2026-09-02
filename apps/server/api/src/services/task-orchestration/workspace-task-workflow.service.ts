import { TasksService } from '@api/collections/tasks/services/tasks.service';
import { AvatarVideoGenerationService } from '@api/collections/videos/services/avatar-video-generation.service';
import { WorkflowNodeContinuationService } from '@api/collections/workflows/services/workflow-node-continuation.service';
import type { SystemWorkflowActionRequest } from '@api/collections/workflows/system-workflow-runner.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import type {
  DecomposedSubtask,
  TaskDecompositionResult,
} from '@api/services/task-orchestration/interfaces/task-decomposition.interface';
import { TaskDecompositionService } from '@api/services/task-orchestration/task-decomposition.service';
import {
  WORKSPACE_TASK_ACTION_IDS,
  WORKSPACE_TASK_WORKFLOW_DEFINITIONS,
  type WorkspaceTaskWorkflowRequest,
} from '@api/services/task-orchestration/workspace-task-workflow-definition';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, Injectable, type OnModuleInit } from '@nestjs/common';

const AGENT_TURN_WORKFLOW_ID = 'agent.turn.execute';

type AgentExecutionItem = WorkspaceTaskWorkflowRequest & {
  subtask: DecomposedSubtask;
};

type AgentExecutionState = AgentExecutionItem & {
  executionId: string;
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
    private readonly tasksService: TasksService,
    private readonly avatarVideoGenerationService: AvatarVideoGenerationService,
    private readonly nodeContinuations: WorkflowNodeContinuationService,
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
        WORKSPACE_TASK_ACTION_IDS.AGENT_PLAN_EXECUTIONS,
        this.planAgentExecutions.bind(this),
      ],
      [
        WORKSPACE_TASK_ACTION_IDS.AGENT_ENQUEUE_EXECUTION,
        this.enqueueAgentExecution.bind(this),
      ],
      [
        WORKSPACE_TASK_ACTION_IDS.AGENT_LINK_EXECUTIONS,
        this.linkAgentExecutions.bind(this),
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
        WORKSPACE_TASK_ACTION_IDS.FACECAM_FINALIZE,
        this.finalizeFacecam.bind(this),
      ],
      [
        WORKSPACE_TASK_ACTION_IDS.FACECAM_FINALIZE_FAILURE,
        this.finalizeFacecamFailure.bind(this),
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

  private async planAgentExecutions(
    request: SystemWorkflowActionRequest,
  ): Promise<{ items: AgentExecutionItem[] }> {
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
            message: 'Preparing agent workflow executions.',
            percent: 5,
            stage: 'orchestrating',
          },
          routingSummary: decomposition.routingSummary,
          status: 'in_progress',
        },
      );

      return {
        items: [...decomposition.subtasks]
          .sort((left, right) => left.order - right.order)
          .map((subtask) => ({ ...input, subtask })),
      };
    });
  }

  private async enqueueAgentExecution(
    request: SystemWorkflowActionRequest,
  ): Promise<AgentExecutionState> {
    const item = this.readAgentExecutionItem(request.input.request);
    return this.withTaskFailure(item, async () => {
      const { executionId } = await this.workflowRunner.enqueueWorkflow({
        actionType: AGENT_TURN_WORKFLOW_ID,
        canonicalId: AGENT_TURN_WORKFLOW_ID,
        idempotencyKey: `${this.requiredString(request.provenance.idempotencyKey, 'workflow action idempotency key')}:agent-turn`,
        inputValues: {
          request: {
            agentType: item.subtask.agentType,
            content: item.subtask.brief,
          },
        },
        metadata: {
          label: item.subtask.label,
          parentExecutionId: request.provenance.executionId,
          parentNodeId: request.provenance.nodeId,
          source: 'workspace-task',
          workspaceTaskId: item.taskId,
        },
        organizationId: item.organizationId,
        source: 'WorkspaceTaskWorkflowService.enqueueAgentExecution',
        userId: item.userId,
      });
      return { ...item, executionId };
    });
  }

  private async linkAgentExecutions(
    request: SystemWorkflowActionRequest,
  ): Promise<{ executionIds: string[]; taskId: string }> {
    const input = this.readRequest(request);
    const batch = this.readForEachResult(request.input.batch);
    const executionIds = [...batch.results]
      .sort((left, right) => left.index - right.index)
      .map((entry) => this.readAgentExecutionState(entry.result).executionId);

    return this.withTaskFailure(input, async () => {
      await this.tasksService.recordTaskEvent(
        input.taskId,
        input.organizationId,
        input.userId,
        {
          payload: { executionIds },
          type: 'execution_started',
        },
        {
          linkedExecutionIds: executionIds,
          progress: {
            activeRunCount: executionIds.length,
            message: `Queued ${executionIds.length} execution${executionIds.length === 1 ? '' : 's'}.`,
            percent: 10,
            stage: 'queued',
          },
          status: 'in_progress',
        },
      );
      return { executionIds, taskId: input.taskId };
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
      let continuationId: string | undefined;
      try {
        const result =
          await this.avatarVideoGenerationService.generateAvatarVideo(
            { aspectRatio: '9:16', ...state.generation },
            {
              brandId: state.brandId,
              organizationId: state.organizationId,
              userId: state.userId,
            },
            async (ingredientId) => {
              const continuation =
                await this.nodeContinuations.createBeforeProviderSubmission({
                  actionId: WORKSPACE_TASK_ACTION_IDS.FACECAM_GENERATE,
                  executionId: request.provenance.executionId,
                  ingredientId,
                  nodeId: this.requiredString(
                    request.provenance.nodeId,
                    'workflow node id',
                  ),
                  organizationId: state.organizationId,
                  provider: 'heygen',
                  workflowVersionId: request.context.workflowVersionId,
                });
              continuationId = continuation.continuationId;
            },
          );
        if (!continuationId) {
          throw new Error(
            'Facecam provider submitted without a durable workflow continuation',
          );
        }
        await this.nodeContinuations.markProviderSubmitted({
          continuationId,
          externalId: result.externalId,
          organizationId: state.organizationId,
        });
        return {
          ...state,
          externalId: this.requiredString(
            result.externalId,
            'provider externalId',
          ),
          ingredientId: this.requiredString(
            result.ingredientId,
            'ingredientId',
          ),
        };
      } catch (error: unknown) {
        if (continuationId) {
          await this.nodeContinuations.failProviderSubmission({
            continuationId,
            error: error instanceof Error ? error.message : String(error),
            organizationId: state.organizationId,
          });
        }
        throw error;
      }
    });
  }

  private async finalizeFacecam(
    request: SystemWorkflowActionRequest,
  ): Promise<FacecamState & { tracking: 'continuation' }> {
    const state = this.readCompletedFacecamState(request.input.state);
    return this.withTaskFailure(state, async () => {
      await this.tasksService.attachOutput(
        state.taskId,
        state.ingredientId,
        state.organizationId,
        state.userId,
      );
      await this.tasksService.recordTaskEvent(
        state.taskId,
        state.organizationId,
        state.userId,
        {
          payload: {
            ingredientId: state.ingredientId,
            videoUrl: `/videos/${state.ingredientId}`,
          },
          type: 'facecam_completed',
        },
        {
          progress: {
            activeRunCount: 0,
            message: 'Facecam video ready.',
            percent: 100,
            stage: 'completed',
          },
          status: 'done',
        },
      );
      return { ...state, tracking: 'continuation' };
    });
  }

  private async finalizeFacecamFailure(
    request: SystemWorkflowActionRequest,
  ): Promise<{ error: string; failed: true; taskId: string }> {
    const taskRequest = this.readRequest(request);
    const failure = this.readRecord(request.input.failure, 'facecam failure');
    const error = this.requiredString(failure.error, 'facecam failure error');
    await this.tasksService.recordTaskEvent(
      taskRequest.taskId,
      taskRequest.organizationId,
      taskRequest.userId,
      {
        payload: { error },
        type: 'facecam_failed',
      },
      {
        failureReason: error,
        progress: {
          activeRunCount: 0,
          message: error,
          percent: 100,
          stage: 'failed',
        },
        status: 'failed',
      },
    );
    return { error, failed: true, taskId: taskRequest.taskId };
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
    const parsed = this.readRequestValue(record);
    if (parsed.organizationId !== request.context.organizationId) {
      throw new Error('Workspace task workflow organization mismatch');
    }
    return parsed;
  }

  private readAgentExecutionItem(value: unknown): AgentExecutionItem {
    const record = this.readRecord(value, 'agent execution item');
    return {
      ...this.readRequestValue(record),
      subtask: this.readSubtask(record.subtask),
    };
  }

  private readAgentExecutionState(value: unknown): AgentExecutionState {
    const record = this.readRecord(value, 'agent execution state');
    return {
      ...this.readAgentExecutionItem(record),
      executionId: this.requiredString(record.executionId, 'executionId'),
    };
  }

  private readFacecamState(value: unknown): FacecamState {
    const record = this.readRecord(value, 'facecam state');
    const generation = this.readRecord(record.generation, 'generation');
    const externalId = this.optionalString(record.externalId);
    const ingredientId = this.optionalString(record.ingredientId);
    const avatarId = this.optionalString(generation.avatarId);
    const clonedVoiceId = this.optionalString(generation.clonedVoiceId);
    const heygenVoiceId = this.optionalString(generation.heygenVoiceId);
    const voiceProvider = this.optionalString(generation.voiceProvider);
    return {
      ...this.readRequestValue(record),
      ...(externalId === undefined ? {} : { externalId }),
      generation: {
        ...(avatarId === undefined ? {} : { avatarId }),
        ...(clonedVoiceId === undefined ? {} : { clonedVoiceId }),
        ...(heygenVoiceId === undefined ? {} : { heygenVoiceId }),
        text: this.requiredString(generation.text, 'generation.text'),
        useIdentity: generation.useIdentity === true,
        ...(voiceProvider === undefined ? {} : { voiceProvider }),
      },
      ...(ingredientId === undefined ? {} : { ingredientId }),
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
    const brandId = this.optionalString(record.brandId);
    const brandName = this.optionalString(record.brandName);
    const elevenlabsVoiceId = this.optionalString(record.elevenlabsVoiceId);
    const heygenAvatarId = this.optionalString(record.heygenAvatarId);
    const outputType = this.optionalString(record.outputType);
    const platforms = this.stringArray(record.platforms);
    const voiceId = this.optionalString(record.voiceId);
    const voiceProvider = this.optionalString(record.voiceProvider);
    return {
      ...(brandId === undefined ? {} : { brandId }),
      ...(brandName === undefined ? {} : { brandName }),
      ...(elevenlabsVoiceId === undefined ? {} : { elevenlabsVoiceId }),
      ...(heygenAvatarId === undefined ? {} : { heygenAvatarId }),
      organizationId: this.requiredString(
        record.organizationId,
        'organizationId',
      ),
      ...(outputType === undefined ? {} : { outputType }),
      ...(platforms === undefined ? {} : { platforms }),
      request: this.requiredString(record.request, 'request'),
      taskId: this.requiredString(record.taskId, 'taskId'),
      userId: this.requiredString(record.userId, 'userId'),
      ...(voiceId === undefined ? {} : { voiceId }),
      ...(voiceProvider === undefined ? {} : { voiceProvider }),
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

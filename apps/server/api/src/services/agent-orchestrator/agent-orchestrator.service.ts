import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import { AgentTurnAcceptanceService } from '@api/services/agent-orchestrator/agent-turn-acceptance.service';
import type {
  AgentChatContext,
  AgentChatRequest,
  AgentThreadUiActionRequest,
  AgentTurnAcknowledgement,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { describeThreadUiAction } from '@api/services/agent-orchestrator/utils/agent-thread-ui-action-description.util';
import {
  getAgentUiActionSourceId,
  type ValidatedAgentScope,
} from '@genfeedai/contracts/interfaces';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';

const AGENT_INPUT_RESPONSE_WORKFLOW_ID = 'agent.thread.input-response';
const AGENT_UI_ACTION_WORKFLOW_ID = 'agent.thread.ui-action';

@Injectable()
export class AgentOrchestratorService {
  constructor(
    private readonly turnAcceptanceService: AgentTurnAcceptanceService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
    @Optional()
    private readonly threadEventRecorder?: AgentThreadEventRecorderService,
  ) {}

  async acceptChatStream(
    request: AgentChatRequest,
    context: AgentChatContext,
  ): Promise<AgentTurnAcknowledgement> {
    if (!request.clientRequestId) {
      throw new BadRequestException('clientRequestId is required.');
    }
    return this.turnAcceptanceService.accept(
      request as AgentChatRequest & { clientRequestId: string },
      context,
    );
  }

  async chat(
    request: AgentChatRequest,
    context: AgentChatContext,
  ): Promise<AgentTurnAcknowledgement> {
    return this.acceptChatStream(request, context);
  }

  async handleThreadUiAction(
    request: AgentThreadUiActionRequest,
    context: AgentChatContext,
  ): Promise<{ executionId: string; status: 'queued'; threadId: string }> {
    const { executionId } = await this.workflowRunner.enqueueWorkflow(
      {
        actionType: AGENT_UI_ACTION_WORKFLOW_ID,
        canonicalId: AGENT_UI_ACTION_WORKFLOW_ID,
        inputValues: {
          request: {
            action: request.action,
            threadId: request.threadId,
            ...(request.brandId !== undefined
              ? { brandId: request.brandId }
              : {}),
            ...(request.expectedContextVersion !== undefined
              ? { expectedContextVersion: request.expectedContextVersion }
              : {}),
            ...(request.payload ? { payload: request.payload } : {}),
          },
        },
        metadata: { threadId: request.threadId },
        organizationId: context.organizationId,
        source: 'AgentOrchestratorService.handleThreadUiAction',
        userId: context.userId,
      },
      { dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE },
    );
    await this.recordUiActionQueued(request, context, executionId);
    return { executionId, status: 'queued', threadId: request.threadId };
  }

  /**
   * The ack is a position in the thread's event log: the queued run and the
   * source it acts on are projected before the client hears of it, so a
   * reload or remount while it waits for a worker still finds it. It is
   * recorded as queued, never as the thread's active run: an earlier run
   * still owns the lane, and its events must keep applying.
   */
  private async recordUiActionQueued(
    request: AgentThreadUiActionRequest,
    context: AgentChatContext,
    executionId: string,
  ): Promise<void> {
    try {
      await this.threadEventRecorder?.recordUiActionQueued({
        content: describeThreadUiAction(request.action, request.payload),
        context: { ...context, executionId },
        runId: executionId,
        threadId: request.threadId,
        uiAction: {
          action: request.action,
          sourceId: getAgentUiActionSourceId(request.payload),
        },
      });
    } catch {
      // The worker records the run's ui-action when it starts it; only the
      // queued window is lost.
    }
  }

  async resumeRecurringTaskDraftFromInput(params: {
    answer: string;
    fieldId?: string;
    organizationId: string;
    scope: ValidatedAgentScope;
    threadId: string;
    userId: string;
  }): Promise<boolean> {
    await this.workflowRunner.enqueueWorkflow(
      {
        actionType: AGENT_INPUT_RESPONSE_WORKFLOW_ID,
        canonicalId: AGENT_INPUT_RESPONSE_WORKFLOW_ID,
        inputValues: {
          request: {
            answer: params.answer,
            scope: params.scope,
            threadId: params.threadId,
            ...(params.fieldId ? { fieldId: params.fieldId } : {}),
          },
        },
        metadata: { threadId: params.threadId },
        organizationId: params.organizationId,
        source: 'AgentOrchestratorService.resumeRecurringTaskDraftFromInput',
        userId: params.userId,
      },
      { dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE },
    );
    return true;
  }
}

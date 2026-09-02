import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { AgentTurnAcceptanceService } from '@api/services/agent-orchestrator/agent-turn-acceptance.service';
import type {
  AgentChatContext,
  AgentChatRequest,
  AgentThreadUiActionRequest,
  AgentTurnAcknowledgement,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { ValidatedAgentScope } from '@genfeedai/interfaces';
import { BadRequestException, Injectable } from '@nestjs/common';

const AGENT_INPUT_RESPONSE_WORKFLOW_ID = 'agent.thread.input-response';
const AGENT_UI_ACTION_WORKFLOW_ID = 'agent.thread.ui-action';

@Injectable()
export class AgentOrchestratorService {
  constructor(
    private readonly turnAcceptanceService: AgentTurnAcceptanceService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
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
    const { executionId } = await this.workflowRunner.enqueueWorkflow({
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
    });
    return { executionId, status: 'queued', threadId: request.threadId };
  }

  async resumeRecurringTaskDraftFromInput(params: {
    answer: string;
    fieldId?: string;
    organizationId: string;
    scope: ValidatedAgentScope;
    threadId: string;
    userId: string;
  }): Promise<boolean> {
    await this.workflowRunner.enqueueWorkflow({
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
    });
    return true;
  }
}

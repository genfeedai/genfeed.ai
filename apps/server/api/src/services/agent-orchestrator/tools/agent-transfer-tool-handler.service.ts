import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentToolInternalApiService } from '@api/services/agent-orchestrator/tools/agent-tool-internal-api.service';
import type { AgentToolResult, AgentUiAction } from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AgentTransferToolHandler {
  constructor(private readonly internalApi: AgentToolInternalApiService) {}

  async listConversations(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!ctx.threadId) {
      return this.failure('A source conversation is required.');
    }
    const query =
      typeof params.query === 'string' && params.query.trim()
        ? `&q=${encodeURIComponent(params.query.trim())}`
        : '';
    const data = await this.internalApi.callInternalApi(
      'GET',
      `/agent/transfers/conversations?sourceThreadId=${encodeURIComponent(ctx.threadId)}${query}`,
      undefined,
      ctx,
    );
    return { creditsUsed: 0, data, success: true };
  }

  async transfer(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!ctx.threadId) {
      return this.failure('A source conversation is required.');
    }
    const content = this.readString(params.content);
    const idempotencyKey = this.readString(params.idempotencyKey);
    const deliveryMode = this.readString(params.deliveryMode);
    if (
      !content ||
      !idempotencyKey ||
      !['SEND', 'SEND_AND_RUN'].includes(deliveryMode)
    ) {
      return this.failure(
        'content, idempotencyKey, and a valid deliveryMode are required.',
      );
    }

    const payload = {
      ...params,
      content,
      deliveryMode,
      idempotencyKey,
      sourceThreadId: ctx.threadId,
    };
    if (
      deliveryMode === 'SEND_AND_RUN' &&
      ctx.confirmationOrigin !== 'thread-ui-action'
    ) {
      const action: AgentUiAction = {
        ctas: [
          {
            action: 'confirm_agent_transfer',
            label: 'Send and run',
            payload: {
              ...payload,
              sourceActionId: `agent-transfer:${idempotencyKey}`,
            },
          },
        ],
        data: {
          ...payload,
          direction: 'outbound',
          idempotencyKey,
          status: 'PENDING',
        },
        description:
          'Review the bounded context before starting the destination conversation.',
        id: `agent-transfer:${idempotencyKey}`,
        requiresConfirmation: true,
        riskLevel: 'medium',
        title: 'Send to specialist and run',
        type: 'agent_transfer_card',
      };
      return {
        creditsUsed: 0,
        data: { pendingConfirmation: true },
        nextActions: [action],
        requiresConfirmation: true,
        riskLevel: 'medium',
        success: true,
      };
    }

    const data = await this.internalApi.callInternalApi(
      'POST',
      '/agent/transfers',
      {
        ...payload,
        explicitUserIntent: deliveryMode === 'SEND_AND_RUN',
        ...(ctx.sourceActionId ? { sourceActionId: ctx.sourceActionId } : {}),
      },
      ctx,
    );
    return { creditsUsed: 0, data, success: true };
  }

  private failure(error: string): AgentToolResult {
    return { creditsUsed: 0, error, success: false };
  }

  private readString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }
}

import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import type {
  AgentArtifactReference,
  AgentToolResult,
  AgentUiAction,
} from '@genfeedai/interfaces';
import { Inject, Injectable } from '@nestjs/common';

interface AgentTransferActor {
  organizationId: string;
  userId: string;
}

interface CreateAgentTransferInput {
  artifactReferences?: AgentArtifactReference[];
  artifactVersionPinIds?: string[];
  content: string;
  deliveryMode: string;
  destinationBrandId?: string;
  destinationThreadId?: string;
  destinationTitle?: string;
  explicitUserIntent?: boolean;
  idempotencyKey: string;
  parentCorrelationId?: string;
  selectedContext?: Record<string, unknown>;
  sourceActionId?: string;
  sourceThreadId: string;
}

interface AgentTransfersServiceLike {
  create(
    input: CreateAgentTransferInput,
    actor: AgentTransferActor,
  ): Promise<unknown>;
  discoverConversations(
    actor: AgentTransferActor,
    sourceThreadId: string,
    query?: string,
    limit?: number,
  ): Promise<unknown[]>;
}

@Injectable()
export class AgentTransferToolHandler {
  constructor(
    @Inject('AGENT_TRANSFERS_SERVICE')
    private readonly transfersService: AgentTransfersServiceLike,
  ) {}

  async listConversations(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!ctx.threadId) {
      return this.failure('A source conversation is required.');
    }
    const query =
      typeof params.query === 'string' && params.query.trim()
        ? params.query.trim()
        : undefined;
    const conversations = await this.transfersService.discoverConversations(
      this.actor(ctx),
      ctx.threadId,
      query,
    );
    return { creditsUsed: 0, data: { conversations }, success: true };
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
      artifactReferences: this.readArtifactReferences(
        params.artifactReferences,
      ),
      artifactVersionPinIds: this.readStringArray(params.artifactVersionPinIds),
      content,
      deliveryMode,
      destinationBrandId: readOptionalString(params.destinationBrandId),
      destinationThreadId: readOptionalString(params.destinationThreadId),
      destinationTitle: readOptionalString(params.destinationTitle),
      idempotencyKey,
      parentCorrelationId: readOptionalString(params.parentCorrelationId),
      selectedContext: this.readSelectedContext(params.selectedContext),
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

    const transfer = await this.transfersService.create(
      {
        ...payload,
        explicitUserIntent: deliveryMode === 'SEND_AND_RUN',
        ...(ctx.sourceActionId ? { sourceActionId: ctx.sourceActionId } : {}),
      },
      this.actor(ctx),
    );
    return { creditsUsed: 0, data: { transfer }, success: true };
  }

  private actor(ctx: ToolExecutionContext): AgentTransferActor {
    return { organizationId: ctx.organizationId, userId: ctx.userId };
  }

  private failure(error: string): AgentToolResult {
    return { creditsUsed: 0, error, success: false };
  }

  private readArtifactReferences(
    value: unknown,
  ): AgentArtifactReference[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }
    return value.filter(
      (entry): entry is AgentArtifactReference =>
        typeof entry === 'object' && entry !== null,
    );
  }

  private readSelectedContext(
    value: unknown,
  ): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private readString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private readStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
}

import type {
  AgentChatContext,
  AgentChatRequest,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import {
  AgentThreadEngineService,
  type AppendAgentThreadEventParams,
} from '@api/services/agent-threading/services/agent-thread-engine.service';
import type {
  AgentDashboardOperation,
  AgentUIBlock,
} from '@genfeedai/contracts/interfaces';
import { toAgentScopeMetadata } from '@genfeedai/contracts/interfaces';
import { Injectable, Optional } from '@nestjs/common';

@Injectable()
export class AgentThreadEventRecorderService {
  constructor(
    @Optional()
    private readonly agentThreadEngineService?: AgentThreadEngineService,
  ) {}

  async recordThreadTurnRequested(params: {
    threadId: string;
    context: AgentChatContext;
    model: string;
    content: string;
    runId?: string;
    source?: AgentChatRequest['source'];
  }): Promise<void> {
    if (!this.agentThreadEngineService) {
      return;
    }

    await this.appendThreadEvent({
      commandId: `turn-requested:${params.threadId}:${params.runId ?? Date.now()}`,
      metadata: {
        ...this.scopeMetadata(params.context),
        source: params.source ?? 'agent',
      },
      organizationId: params.context.organizationId,
      payload: {
        content: params.content,
        model: params.model,
        requestedModel: params.model,
        source: params.source ?? 'agent',
        startedAt: new Date().toISOString(),
      },
      runId: params.runId,
      threadId: params.threadId,
      type: 'thread.turn_requested',
      userId: params.context.userId,
    });
  }

  async recordAssistantFinalized(params: {
    threadId: string;
    context: AgentChatContext;
    content: string;
    idempotencyKey?: string;
    metadata: Record<string, unknown>;
    runId?: string;
  }): Promise<void> {
    if (!this.agentThreadEngineService) {
      return;
    }

    await this.appendThreadEvent({
      commandId: `assistant-finalized:${params.threadId}:${params.idempotencyKey ?? params.runId ?? Date.now()}`,
      metadata: {
        ...this.scopeMetadata(params.context),
        origin: 'agent-orchestrator',
      },
      organizationId: params.context.organizationId,
      payload: {
        content: params.content,
        messageId: `${params.threadId}:${params.runId ?? 'sync'}`,
        metadata: params.metadata,
      },
      runId: params.runId,
      threadId: params.threadId,
      type: 'assistant.finalized',
      userId: params.context.userId,
    });
  }

  async recordPlanUpserted(params: {
    context: AgentChatContext;
    threadId: string;
    plan: {
      id: string;
      content: string;
      explanation?: string;
      steps?: Record<string, unknown>[];
      status: 'awaiting_approval' | 'approved';
      awaitingApproval: boolean;
      lastReviewAction?: 'approve' | 'request_changes';
      revisionNote?: string;
      approvedAt?: string;
    };
    runId?: string;
  }): Promise<void> {
    if (!this.agentThreadEngineService) {
      return;
    }

    await this.appendThreadEvent({
      commandId: `plan-upserted:${params.threadId}:${params.plan.id}:${params.runId ?? Date.now()}`,
      metadata: {
        ...this.scopeMetadata(params.context),
        origin: 'agent-orchestrator',
      },
      organizationId: params.context.organizationId,
      payload: {
        approvedAt: params.plan.approvedAt,
        awaitingApproval: params.plan.awaitingApproval,
        content: params.plan.content,
        explanation: params.plan.explanation,
        id: params.plan.id,
        lastReviewAction: params.plan.lastReviewAction,
        revisionNote: params.plan.revisionNote,
        status: params.plan.status,
        steps: params.plan.steps,
      },
      runId: params.runId,
      threadId: params.threadId,
      type: 'plan.upserted',
      userId: params.context.userId,
    });
  }

  async recordThreadTurnStarted(params: {
    context: AgentChatContext;
    threadId: string;
    model: string;
    runId?: string;
    source?: AgentChatRequest['source'];
  }): Promise<void> {
    if (!this.agentThreadEngineService) {
      return;
    }

    await this.appendThreadEvent({
      commandId: `turn-started:${params.threadId}:${params.runId ?? Date.now()}`,
      metadata: {
        ...this.scopeMetadata(params.context),
        origin: 'agent-orchestrator',
        source: params.source ?? 'agent',
      },
      organizationId: params.context.organizationId,
      payload: {
        detail: 'Agent turn started',
        model: params.model,
        requestedModel: params.model,
        source: params.source ?? 'agent',
        startedAt: new Date().toISOString(),
      },
      runId: params.runId,
      threadId: params.threadId,
      type: 'thread.turn_started',
      userId: params.context.userId,
    });
  }

  async recordToolStarted(params: {
    context: AgentChatContext;
    threadId: string;
    parameters: Record<string, unknown>;
    runId?: string;
    toolCallId?: string;
    toolName: string;
  }): Promise<void> {
    if (!this.agentThreadEngineService) {
      return;
    }

    await this.appendThreadEvent({
      commandId: `tool-started:${params.threadId}:${params.toolCallId ?? params.toolName}:${params.runId ?? Date.now()}`,
      metadata: {
        ...this.scopeMetadata(params.context),
        origin: 'agent-orchestrator',
      },
      organizationId: params.context.organizationId,
      payload: {
        parameters: params.parameters,
        toolCallId: params.toolCallId,
        toolName: params.toolName,
      },
      runId: params.runId,
      threadId: params.threadId,
      type: 'tool.started',
      userId: params.context.userId,
    });
  }

  async recordToolCompleted(params: {
    context: AgentChatContext;
    threadId: string;
    durationMs: number;
    error?: string;
    runId?: string;
    status: 'completed' | 'failed';
    toolCallId?: string;
    toolName: string;
  }): Promise<void> {
    if (!this.agentThreadEngineService) {
      return;
    }

    await this.appendThreadEvent({
      commandId: `tool-completed:${params.threadId}:${params.toolCallId ?? params.toolName}:${params.runId ?? Date.now()}`,
      metadata: {
        ...this.scopeMetadata(params.context),
        origin: 'agent-orchestrator',
      },
      organizationId: params.context.organizationId,
      payload: {
        durationMs: params.durationMs,
        error: params.error,
        status: params.status,
        toolCallId: params.toolCallId,
        toolName: params.toolName,
      },
      runId: params.runId,
      threadId: params.threadId,
      type: 'tool.completed',
      userId: params.context.userId,
    });
  }

  async recordUiBlocksUpdated(params: {
    blockIds?: string[];
    blocks?: AgentUIBlock[];
    context: AgentChatContext;
    threadId: string;
    operation: AgentDashboardOperation;
    runId?: string;
  }): Promise<void> {
    if (!this.agentThreadEngineService) {
      return;
    }

    await this.appendThreadEvent({
      commandId: `ui-blocks:${params.threadId}:${params.runId ?? Date.now()}:${params.operation}`,
      metadata: {
        ...this.scopeMetadata(params.context),
        origin: 'agent-orchestrator',
      },
      organizationId: params.context.organizationId,
      payload: {
        blockIds: params.blockIds,
        blocks: params.blocks,
        operation: params.operation,
      },
      runId: params.runId,
      threadId: params.threadId,
      type: 'ui.blocks_updated',
      userId: params.context.userId,
    });
  }

  async recordRunCompleted(params: {
    context: AgentChatContext;
    threadId: string;
    detail: string;
    idempotencyKey?: string;
    runId?: string;
  }): Promise<void> {
    if (!this.agentThreadEngineService) {
      return;
    }

    await this.appendThreadEvent({
      commandId: `run-completed:${params.threadId}:${params.idempotencyKey ?? params.runId ?? Date.now()}`,
      metadata: {
        ...this.scopeMetadata(params.context),
        origin: 'agent-orchestrator',
      },
      organizationId: params.context.organizationId,
      payload: {
        detail: params.detail,
        label: 'Agent completed',
        status: 'completed',
      },
      runId: params.runId,
      threadId: params.threadId,
      type: 'run.completed',
      userId: params.context.userId,
    });
  }

  async recordRunFailed(params: {
    context: AgentChatContext;
    threadId: string;
    error: string;
    runId?: string;
  }): Promise<void> {
    if (!this.agentThreadEngineService) {
      return;
    }

    await this.appendThreadEvent({
      commandId: `run-failed:${params.threadId}:${params.runId ?? Date.now()}`,
      metadata: {
        ...this.scopeMetadata(params.context),
        origin: 'agent-orchestrator',
      },
      organizationId: params.context.organizationId,
      payload: {
        error: params.error,
        label: 'Agent failed',
        status: 'failed',
      },
      runId: params.runId,
      threadId: params.threadId,
      type: 'run.failed',
      userId: params.context.userId,
    });
  }

  private async appendThreadEvent(
    params: AppendAgentThreadEventParams,
  ): Promise<void> {
    if (!this.agentThreadEngineService) {
      return;
    }

    await this.agentThreadEngineService.appendEvent(params);
  }

  private scopeMetadata(context: AgentChatContext): Record<string, unknown> {
    return context.scope
      ? { agentScope: toAgentScopeMetadata(context.scope) }
      : {};
  }
}

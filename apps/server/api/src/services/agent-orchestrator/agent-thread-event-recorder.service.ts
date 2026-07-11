import { runEffectPromise } from '@api/helpers/utils/effect/effect.util';
import type {
  AgentChatContext,
  AgentChatRequest,
} from '@api/services/agent-orchestrator/agent-orchestrator.service';
import {
  AgentThreadEngineService,
  type AppendAgentThreadEventParams,
} from '@api/services/agent-threading/services/agent-thread-engine.service';
import type {
  AgentDashboardOperation,
  AgentUIBlock,
} from '@genfeedai/interfaces';
import { Injectable, Optional } from '@nestjs/common';
import { Effect } from 'effect';

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

    await runEffectPromise(
      this.appendThreadEventEffect({
        commandId: `turn-requested:${params.threadId}:${params.runId ?? Date.now()}`,
        metadata: {
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
      }),
    );
  }

  async recordAssistantFinalized(params: {
    threadId: string;
    context: AgentChatContext;
    content: string;
    metadata: Record<string, unknown>;
    runId?: string;
  }): Promise<void> {
    if (!this.agentThreadEngineService) {
      return;
    }

    await runEffectPromise(
      this.appendThreadEventEffect({
        commandId: `assistant-finalized:${params.threadId}:${params.runId ?? Date.now()}`,
        metadata: {
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
      }),
    );
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

    await runEffectPromise(
      this.appendThreadEventEffect({
        commandId: `plan-upserted:${params.threadId}:${params.plan.id}:${params.runId ?? Date.now()}`,
        metadata: {
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
      }),
    );
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

    await runEffectPromise(
      this.appendThreadEventEffect({
        commandId: `turn-started:${params.threadId}:${params.runId ?? Date.now()}`,
        metadata: {
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
      }),
    );
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

    await runEffectPromise(
      this.appendThreadEventEffect({
        commandId: `tool-started:${params.threadId}:${params.toolCallId ?? params.toolName}:${params.runId ?? Date.now()}`,
        metadata: {
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
      }),
    );
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

    await runEffectPromise(
      this.appendThreadEventEffect({
        commandId: `tool-completed:${params.threadId}:${params.toolCallId ?? params.toolName}:${params.runId ?? Date.now()}`,
        metadata: {
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
      }),
    );
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

    await runEffectPromise(
      this.appendThreadEventEffect({
        commandId: `ui-blocks:${params.threadId}:${params.runId ?? Date.now()}:${params.operation}`,
        metadata: {
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
      }),
    );
  }

  async recordRunCompleted(params: {
    context: AgentChatContext;
    threadId: string;
    detail: string;
    runId?: string;
  }): Promise<void> {
    if (!this.agentThreadEngineService) {
      return;
    }

    await runEffectPromise(
      this.appendThreadEventEffect({
        commandId: `run-completed:${params.threadId}:${params.runId ?? Date.now()}`,
        metadata: {
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
      }),
    );
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

    await runEffectPromise(
      this.appendThreadEventEffect({
        commandId: `run-failed:${params.threadId}:${params.runId ?? Date.now()}`,
        metadata: {
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
      }),
    );
  }

  private appendThreadEventEffect(
    params: AppendAgentThreadEventParams,
  ): Effect.Effect<void, unknown> {
    if (!this.agentThreadEngineService) {
      return Effect.void;
    }

    return this.agentThreadEngineService
      .appendEventEffect(params)
      .pipe(Effect.asVoid);
  }
}

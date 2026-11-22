import { isStrategyEnabled } from '@api/collections/agent-strategies/services/agent-strategy-schedule-actor.util';
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { runSerializableWithRetry } from '@api/collections/workflows/utils/serializable-retry.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AgentRuntimeService } from '@api/services/agent-runtime/agent-runtime.service';
import { requireAgentType } from '@api/services/agent-campaign/content-engine-parsing.util';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { AgentEventRunStatus } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AGENT_EVENT_RUN_CLAIM_LEASE_MS,
  AGENT_EVENT_RUN_WINDOW_MS,
} from './agent-event-run.constants';
import type {
  AgentEventClaim,
  AgentEventContentGate,
  AgentEventRunOutcome,
  AgentEventRunRequest,
} from './agent-event-run.types';
import {
  buildAgentEventKey,
  buildAgentEventObjective,
  resolveAgentEventDailyCap,
} from './agent-event-run.util';

/**
 * Starts a hired content agent's run from a workflow trigger event (#10897).
 *
 * The event only ever supplies the text the agent is asked about. Which agent
 * runs, as whom, for which brand, with which tools and budget, and whether the
 * result may publish all come from the strategy and the workflow's own step.
 * Every event for an agent takes one `AgentEventRun` row first: that row is
 * what makes a replayed event start nothing, and the rows of the last day are
 * the agent's cap on event-started runs.
 */
@Injectable()
export class AgentEventRunService {
  private contentGate: AgentEventContentGate | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly strategies: AgentStrategiesService,
    private readonly agentRuntime: AgentRuntimeService,
    private readonly logger: LoggerService,
  ) {}

  /** Bound by the module that owns the injection classifier; absent, the fence alone applies. */
  bindContentGate(gate: AgentEventContentGate): void {
    this.contentGate = gate;
  }

  async runForEvent(
    request: AgentEventRunRequest,
  ): Promise<AgentEventRunOutcome> {
    const strategy = await this.strategies.findOneById(
      request.strategyId,
      request.organizationId,
    );
    if (!strategy) {
      throw new BadRequestException(
        'The agent chosen for this step no longer exists. Choose another agent.',
      );
    }
    const agentLabel = strategy.label ?? 'The agent';
    if (!isStrategyEnabled(strategy.isActive, strategy.config)) {
      throw new BadRequestException(
        `${agentLabel} is disabled. Enable it or choose another agent.`,
      );
    }
    if (
      strategy.dailyCreditBudget > 0 &&
      strategy.dailyCreditsUsed >= strategy.dailyCreditBudget
    ) {
      return { reason: 'budget_reached', started: false };
    }

    const eventKey = buildAgentEventKey(request);
    const isWithheld = await this.contentGate?.isWithheld({
      content: request.eventText,
      eventKey,
      executionId: request.workflowExecutionId,
      organizationId: request.organizationId,
      strategyId: request.strategyId,
      userId: request.userId,
    });
    if (isWithheld) {
      return { reason: 'event_withheld', started: false };
    }

    const claim = await this.claim(request, eventKey);
    if (claim.kind === 'duplicate') {
      return { reason: 'duplicate_event', started: false };
    }
    if (claim.kind === 'capped') {
      return { reason: 'daily_cap_reached', started: false };
    }

    try {
      const handle = await this.agentRuntime.startTurn({
        agentType: requireAgentType(strategy.agentType),
        autonomyMode: strategy.autonomyMode,
        brandId: strategy.brandId ?? undefined,
        creditBudget: strategy.dailyCreditBudget || undefined,
        dispatchClass: SystemWorkflowDispatchClass.BACKGROUND,
        label: `Event run: ${agentLabel}`,
        metadata: {
          clientRequestId: `agent-event:${request.strategyId}:${eventKey}`,
          dispatchedBy: 'workflow_event',
          dispatchedStrategyId: request.strategyId,
          workflowExecutionId: request.workflowExecutionId,
          workflowId: request.workflowId,
        },
        model: strategy.model ?? undefined,
        objective: buildAgentEventObjective(request),
        organizationId: request.organizationId,
        strategyId: request.strategyId,
        threadTitle: `${agentLabel} · event`,
        userId: request.userId,
      });
      await this.prisma.agentEventRun.updateMany({
        data: {
          agentExecutionId: handle.executionId,
          status: AgentEventRunStatus.STARTED,
          threadId: handle.threadId,
        },
        where: scopedWhere(request.organizationId, { id: claim.runId }),
      });
      return {
        agentExecutionId: handle.executionId,
        started: true,
        threadId: handle.threadId,
      };
    } catch (error: unknown) {
      await this.releaseClaim(request.organizationId, claim.runId);
      throw error;
    }
  }

  /**
   * One transaction decides whether this delivery owns the event: not already
   * started, not held by a live claim, and the agent still under its cap. A
   * failed claim, or one whose lease ran out, is taken over in place.
   */
  async claim(
    request: AgentEventRunRequest,
    eventKey: string,
  ): Promise<AgentEventClaim> {
    const now = new Date();
    const cap = resolveAgentEventDailyCap(request.dailyCap);
    return runSerializableWithRetry(this.prisma, async (tx) => {
      const existing = await tx.agentEventRun.findFirst({
        where: scopedWhere(request.organizationId, {
          eventKey,
          strategyId: request.strategyId,
        }),
      });
      if (
        existing &&
        existing.status !== AgentEventRunStatus.FAILED &&
        (existing.status === AgentEventRunStatus.STARTED ||
          now.getTime() - existing.claimedAt.getTime() <
            AGENT_EVENT_RUN_CLAIM_LEASE_MS)
      ) {
        return { kind: 'duplicate' };
      }

      const active = await tx.agentEventRun.count({
        where: scopedWhere(request.organizationId, {
          createdAt: {
            gte: new Date(now.getTime() - AGENT_EVENT_RUN_WINDOW_MS),
          },
          ...(existing ? { id: { not: existing.id } } : {}),
          status: {
            in: [AgentEventRunStatus.CLAIMED, AgentEventRunStatus.STARTED],
          },
          strategyId: request.strategyId,
        }),
      });
      if (active >= cap) {
        return { kind: 'capped' };
      }

      const fields = {
        claimedAt: now,
        status: AgentEventRunStatus.CLAIMED,
        workflowExecutionId: request.workflowExecutionId ?? null,
        workflowId: request.workflowId ?? null,
      };
      const run = existing
        ? await tx.agentEventRun.update({
            data: fields,
            where: { id: existing.id },
          })
        : await tx.agentEventRun.create({
            data: {
              ...fields,
              eventKey,
              organizationId: request.organizationId,
              strategyId: request.strategyId,
            },
          });
      return { kind: 'claimed', runId: run.id };
    });
  }

  /** A claim whose turn never started goes back to FAILED so the event can be delivered again. */
  private async releaseClaim(
    organizationId: string,
    runId: string,
  ): Promise<void> {
    try {
      await this.prisma.agentEventRun.updateMany({
        data: { status: AgentEventRunStatus.FAILED },
        where: scopedWhere(organizationId, {
          id: runId,
          status: AgentEventRunStatus.CLAIMED,
        }),
      });
    } catch (error: unknown) {
      this.logger.warn('Failed to release an agent event claim', {
        error: error instanceof Error ? error.message : String(error),
        runId,
      });
    }
  }
}

import { randomUUID } from 'node:crypto';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { ActivitySource } from '@genfeedai/contracts';
import { traced } from '@libs/tracing/traced';

type ToolHoldCreditsClient = Pick<
  CreditsUtilsService,
  'releaseReservation' | 'reserveCredits' | 'settleReservation'
>;

const AGENT_TOOL_WORKLOAD_TYPE = 'agent-tool';

export interface AgentToolCreditHold {
  amount: number;
  reservationId: string;
}

/**
 * Holds an orchestrator-billed tool's credit cost before the tool runs.
 * Resolves to `null` when the balance cannot cover it, so concurrent calls on
 * a balance that pays for one start only one. Any other failure is rethrown.
 */
export const reserveAgentToolCredits = traced(
  'reserveAgentToolCredits',
  async (params: {
    actorUserId: string;
    amount: number;
    brandId?: string | null;
    credits: ToolHoldCreditsClient;
    organizationId: string;
    scopeId: string;
    toolName: string;
  }): Promise<AgentToolCreditHold | null> => {
    const idempotencyKey = `${params.scopeId}:agent-tool:${randomUUID()}`;
    try {
      const reservation = await params.credits.reserveCredits({
        actorUserId: params.actorUserId,
        amount: params.amount,
        ...(params.brandId ? { brandId: params.brandId } : {}),
        description: `Agent tool: ${params.toolName}`,
        idempotencyKey,
        metadata: {
          toolName: params.toolName,
          workloadType: AGENT_TOOL_WORKLOAD_TYPE,
        },
        organizationId: params.organizationId,
        source: ActivitySource.SCRIPT,
        workloadId: idempotencyKey,
        workloadType: AGENT_TOOL_WORKLOAD_TYPE,
      });
      return {
        amount: reservation.amount ?? params.amount,
        reservationId: reservation.id,
      };
    } catch (error: unknown) {
      if (
        error instanceof BusinessLogicException &&
        error.errorCode === 'INSUFFICIENT_CREDITS'
      ) {
        return null;
      }
      throw error;
    }
  },
);

/** Charges the hold at the tool's price once the tool succeeded. */
export const settleAgentToolCredits = traced(
  'settleAgentToolCredits',
  async (params: {
    actorUserId: string;
    credits: ToolHoldCreditsClient;
    hold: AgentToolCreditHold;
    organizationId: string;
    toolName: string;
  }): Promise<void> => {
    await params.credits.settleReservation({
      actualAmount: params.hold.amount,
      actorUserId: params.actorUserId,
      description: `Agent tool: ${params.toolName}`,
      metadata: {
        toolName: params.toolName,
        workloadType: AGENT_TOOL_WORKLOAD_TYPE,
      },
      organizationId: params.organizationId,
      reservationId: params.hold.reservationId,
      source: ActivitySource.SCRIPT,
    });
  },
);

/** Gives the hold back when the tool failed, was cancelled or billed itself. */
export const releaseAgentToolCredits = traced(
  'releaseAgentToolCredits',
  async (params: {
    credits: ToolHoldCreditsClient;
    hold: AgentToolCreditHold;
    organizationId: string;
  }): Promise<void> => {
    // A hold that cannot be released expires on its own, so this never throws
    // over the error that made the tool fail.
    await params.credits
      .releaseReservation({
        organizationId: params.organizationId,
        reservationId: params.hold.reservationId,
      })
      .catch(() => undefined);
  },
);

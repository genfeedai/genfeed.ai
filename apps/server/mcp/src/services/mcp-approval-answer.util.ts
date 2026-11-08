import {
  describeCreditPricing,
  estimateToolCreditCost,
  getToolByName,
} from '@genfeedai/actions';
import { McpApprovalStatus } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ClientService } from '@mcp/services/client.service';
import type {
  McpApprovalAnswer,
  McpApprovalAnswerOutcome,
  McpApprovalResource,
} from '@mcp/shared/interfaces/approval.interface';
import { approvalPendingToolResult } from '@mcp/tools/mcp-tool-error';

const NOTHING_RUN =
  'Nothing was run; the action is waiting in the Genfeed review inbox.';

/**
 * Settle the requester's in-conversation answer (#9647) against the approval
 * the prompt named, before the current approval policy is applied, so a
 * decline holds even when the policy changed or a reviewer acted meanwhile.
 * Fails closed: an answer that cannot be read or matched runs nothing.
 */
export async function settleApprovalAnswer(
  clientService: Pick<ClientService, 'confirmApproval' | 'getApproval'>,
  logger: Pick<LoggerService, 'warn'>,
  toolName: string,
  answer: McpApprovalAnswer,
): Promise<McpApprovalAnswerOutcome> {
  let approval: McpApprovalResource | null;
  try {
    approval = await clientService.getApproval(answer.approvalId);
  } catch (error: unknown) {
    logger.warn(`Could not read approval ${answer.approvalId}`, error);
    return {
      kind: 'message',
      message: `Your answer could not be read. ${NOTHING_RUN}`,
    };
  }
  if (!approval || approval.toolName !== toolName) {
    return {
      kind: 'message',
      message: `Your answer does not match this action. ${NOTHING_RUN}`,
    };
  }
  if (approval.status === McpApprovalStatus.PENDING) {
    try {
      approval = await clientService.confirmApproval(
        approval.id,
        answer.decision,
      );
    } catch (error: unknown) {
      logger.warn(
        `In-conversation answer to approval ${approval.id} was not accepted`,
        error,
      );
      return { approval, kind: 'pending' };
    }
  }
  if (approval.status === McpApprovalStatus.DECLINED) {
    return { kind: 'message', message: 'Declined. The action was not run.' };
  }
  if (answer.decision === 'decline') {
    return {
      kind: 'message',
      message:
        'This action was already approved in the Genfeed review inbox, so your decline could not cancel it. It was not run now.',
    };
  }
  if (approval.result) {
    return { kind: 'message', message: 'This action has already run.' };
  }
  return { approval, kind: 'run' };
}

/**
 * The pending-approval result for a queued call: its review-inbox link and the
 * credit estimate the person is asked to accept (the frozen model quote for a
 * generation, the catalog estimate otherwise).
 */
export function pendingApprovalResult(
  approval: McpApprovalResource,
  args: Record<string, unknown>,
  canResolveApproval: boolean,
) {
  const tool = getToolByName(approval.toolName);
  if (approval.toolName === 'generate') {
    const quote = approval.generationQuote;
    const estimatedCredits =
      quote?.isAvailable === true &&
      typeof quote.credits === 'number' &&
      Number.isFinite(quote.credits) &&
      quote.credits >= 0 &&
      typeof quote.modelKey === 'string' &&
      quote.modelKey.trim()
        ? quote.credits
        : null;
    return approvalPendingToolResult(
      approval,
      {
        estimatedCredits,
        pricingSummary:
          estimatedCredits === null
            ? 'A model-specific credit quote is unavailable. Request fresh consent with a supported model and complete settings.'
            : undefined,
      },
      canResolveApproval,
    );
  }
  if (!tool?.creditPricing)
    return approvalPendingToolResult(approval, undefined, canResolveApproval);
  const estimatedCredits = estimateToolCreditCost(
    approval.toolName,
    args,
    tool.creditPricing,
  );
  return approvalPendingToolResult(
    approval,
    {
      estimatedCredits,
      pricingSummary:
        estimatedCredits === null
          ? describeCreditPricing(tool.creditPricing)
          : undefined,
    },
    canResolveApproval,
  );
}

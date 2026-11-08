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
  McpApprovalResource,
} from '@mcp/shared/interfaces/approval.interface';
import { approvalPendingToolResult } from '@mcp/tools/mcp-tool-error';

/**
 * Apply the requester's in-conversation answer (#9647) to the approval this
 * call found or queued. Returns the decided approval, or null when the call
 * carries no answer for this pending approval or the API refused it (for
 * example a member without approval rights), so the caller falls back to the
 * pending result and its review-inbox link.
 */
export async function answerApprovalInConversation(
  clientService: Pick<ClientService, 'confirmApproval'>,
  logger: Pick<LoggerService, 'warn'>,
  approval: McpApprovalResource,
  answer: McpApprovalAnswer | undefined,
): Promise<McpApprovalResource | null> {
  if (
    !answer ||
    answer.approvalId !== approval.id ||
    approval.status !== McpApprovalStatus.PENDING
  ) {
    return null;
  }
  try {
    return await clientService.confirmApproval(approval.id, answer.decision);
  } catch (error: unknown) {
    logger.warn(
      `In-conversation answer to approval ${approval.id} was not accepted`,
      error,
    );
    return null;
  }
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

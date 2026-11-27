import { estimateToolCreditCost, getToolByName } from '@genfeedai/actions';
import { McpApprovalStatus } from '@genfeedai/contracts';
import type { IScheduledReleaseBatchPending } from '@genfeedai/contracts/interfaces';
import { describeCreditPricing } from '@genfeedai/mcp-kit';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ClientService } from '@mcp/services/client.service';
import type { CardApprovalProofs } from '@mcp/services/mcp-card-approval-proof.util';
import type {
  McpApprovalAnswer,
  McpApprovalAnswerOutcome,
  McpApprovalResource,
} from '@mcp/shared/interfaces/approval.interface';
import {
  approvalPendingToolResult,
  generateApprovalCostEstimate,
} from '@mcp/tools/mcp-tool-error';
import { CARD_APPROVAL_PROOF_ARGUMENT } from '@mcp/ui/card-approval-proof';

const NOTHING_RUN =
  'Nothing was run; the action is waiting in the Genfeed review inbox.';

/**
 * A dismissed prompt never runs anything, even if the approval policy was
 * waived or a reviewer approved the action while the prompt was open.
 */
function settleCancelledPrompt(
  approval: McpApprovalResource,
): McpApprovalAnswerOutcome {
  if (approval.status === McpApprovalStatus.PENDING) {
    return { approval, kind: 'pending' };
  }
  if (approval.status === McpApprovalStatus.DECLINED) {
    return { kind: 'message', message: 'Declined. The action was not run.' };
  }
  return {
    kind: 'message',
    message: approval.result
      ? 'This action has already run.'
      : 'This action was approved in the Genfeed review inbox. It was not run from the dismissed prompt; call it again to run it.',
  };
}

/**
 * Settle the requester's in-conversation answer (#9647) against the approval
 * the prompt named, before the current approval policy is applied, so a
 * decline holds even when the policy changed or a reviewer acted meanwhile.
 * Fails closed: an answer that cannot be read or matched runs nothing. A click
 * on the approval card (#9754) names no tool, since the approval is its own
 * match.
 */
export async function settleApprovalAnswer(
  clientService: Pick<ClientService, 'confirmApproval' | 'getApproval'>,
  logger: Pick<LoggerService, 'warn'>,
  toolName: string | undefined,
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
  if (!approval || (toolName !== undefined && approval.toolName !== toolName)) {
    return {
      kind: 'message',
      message: `Your answer does not match this action. ${NOTHING_RUN}`,
    };
  }
  if (answer.decision === 'cancel') {
    return settleCancelledPrompt(approval);
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
 * The person's click on the approval card (#9754), as an answer. Refused unless
 * it carries the proof minted for this approval and this member, which only
 * the card view holds, so a model's own call never counts.
 */
export function readCardApprovalAnswer(
  proofs: CardApprovalProofs | undefined,
  args: Record<string, unknown>,
): McpApprovalAnswer {
  const approvalId = String(args.approvalId ?? '');
  const { decision } = args;
  if (!approvalId || (decision !== 'approve' && decision !== 'decline')) {
    throw new Error('approvalId and decision (approve | decline) are required');
  }
  if (!proofs?.verify(approvalId, args[CARD_APPROVAL_PROOF_ARGUMENT])) {
    throw new Error(
      'Only the Approve and Decline buttons on the approval card can answer this. Nothing was run; review the action in Genfeed.',
    );
  }
  return { approvalId, decision };
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
  batch?: IScheduledReleaseBatchPending,
  canApproveInCard = false,
) {
  if (batch) {
    return approvalPendingToolResult(
      approval,
      undefined,
      canResolveApproval,
      batch,
      canApproveInCard,
    );
  }
  const tool = getToolByName(approval.toolName);
  if (approval.toolName === 'generate') {
    return approvalPendingToolResult(
      approval,
      generateApprovalCostEstimate(approval, args),
      canResolveApproval,
      undefined,
      canApproveInCard,
    );
  }
  if (!tool?.creditPricing)
    return approvalPendingToolResult(
      approval,
      undefined,
      canResolveApproval,
      undefined,
      canApproveInCard,
    );
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
    undefined,
    canApproveInCard,
  );
}

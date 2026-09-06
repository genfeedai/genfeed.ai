import type { McpApprovalDocument } from '@api/collections/mcp-approvals/schemas/mcp-approval.schema';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import {
  buildLogicalWriteKey,
  type CuratedActionName,
} from '@genfeedai/actions';
import { McpApprovalStatus } from '@genfeedai/prisma';

export function specializedConfirmationTool(
  toolName: CuratedActionName,
  parameters: Record<string, unknown>,
): boolean {
  switch (toolName) {
    case 'create_brand':
    case 'rename_brand':
    case 'install_official_workflow':
    case 'start_outreach_sequence':
    case 'pause_outreach_sequence':
      return true;
    case 'create_post':
      return Boolean(
        readOptionalString(parameters.contentId) ??
          readOptionalString(parameters.ingredientId),
      );
    case 'transfer_agent_conversation':
      return parameters.deliveryMode === 'SEND_AND_RUN';
    default:
      return false;
  }
}

export function hasTrustedMutationApproval(
  toolName: CuratedActionName,
  parameters: Record<string, unknown>,
  context: ToolExecutionContext,
  claimed: McpApprovalDocument | null,
): boolean {
  if (context.approvedApprovalId) {
    const isAuthorizedReviewer =
      context.approvalReviewerAuthorized === true &&
      !context.threadId &&
      !context.validatedScope;
    if (
      !claimed ||
      claimed.status !== McpApprovalStatus.APPROVED ||
      claimed.toolName !== toolName ||
      (claimed.userId !== context.userId && !isAuthorizedReviewer) ||
      claimed.isDeleted ||
      !claimed.arguments ||
      typeof claimed.arguments !== 'object' ||
      Array.isArray(claimed.arguments)
    ) {
      throw new Error('Approval does not authorize this exact tool invocation');
    }
    const invocation = {
      organizationId: context.organizationId,
      toolName,
      userId: isAuthorizedReviewer ? claimed.userId : context.userId,
      threadId: context.threadId,
      scope: context.validatedScope,
    };
    if (
      buildLogicalWriteKey({
        ...invocation,
        arguments: claimed.arguments,
      }) !== buildLogicalWriteKey({ ...invocation, arguments: parameters }) ||
      claimed.idempotencyKey !==
        buildLogicalWriteKey({ ...invocation, arguments: parameters })
    ) {
      throw new Error('Approval does not authorize this exact tool invocation');
    }
    return true;
  }
  return context.confirmationOrigin === 'thread-ui-action';
}

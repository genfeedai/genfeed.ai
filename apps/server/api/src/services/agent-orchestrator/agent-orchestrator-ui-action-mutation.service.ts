import { createHash } from 'node:crypto';
import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { McpApprovalsService } from '@api/collections/mcp-approvals/services/mcp-approvals.service';
import type { ThreadUiActionExecutionParams } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action.types';
import { AgentOrchestratorUiActionFinalizerService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-finalizer.service';
import { AgentToolExecutorService } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import {
  buildLogicalWriteKey,
  type CuratedActionName,
  getToolByName,
} from '@genfeedai/actions';
import type {
  AgentToolResult,
  AgentUiAction,
} from '@genfeedai/contracts/interfaces';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

interface PersistedMutationProposal {
  actions: unknown[];
  data: Record<string, unknown>;
  messageId: string;
  metadata: Record<string, unknown>;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

@Injectable()
export class AgentOrchestratorUiActionMutationService {
  constructor(
    private readonly approvals: McpApprovalsService,
    private readonly messages: AgentMessagesService,
    private readonly executor: AgentToolExecutorService,
    private readonly finalizer: AgentOrchestratorUiActionFinalizerService,
  ) {}

  async execute(
    action: 'confirm_mutation' | 'decline_mutation',
    params: ThreadUiActionExecutionParams,
  ) {
    const { payload, context, threadId } = params;
    if (
      !payload ||
      Object.keys(payload).some(
        (key) => !['approvalId', 'sourceActionId'].includes(key),
      ) ||
      typeof payload.approvalId !== 'string' ||
      typeof payload.sourceActionId !== 'string' ||
      payload.sourceActionId !== `mutation-approval:${payload.approvalId}`
    ) {
      throw new BadRequestException(
        'Approval requires only the original approvalId and sourceActionId.',
      );
    }
    const approvalId = payload.approvalId;
    const sourceActionId = payload.sourceActionId;
    const approval = await this.approvals.findOwned(
      approvalId,
      context.organizationId,
    );
    const args = record(approval.arguments);
    if (
      approval.isDeleted ||
      approval.userId !== context.userId ||
      approval.organizationId !== context.organizationId
    ) {
      throw new BadRequestException(
        'Approval does not belong to this user and thread.',
      );
    }
    const proposals = await this.loadProposals(
      params,
      sourceActionId,
      approvalId,
    );
    const proposal = proposals[0];
    const scope = context.scope;
    if (
      !scope ||
      proposals.some(
        (copy) =>
          copy.data.scopeVersion !== scope.contextVersion ||
          (copy.data.brandId ?? null) !== (scope.brandId ?? null),
      )
    ) {
      throw new ConflictException(
        'This approval is stale. Prepare the action again in the current brand context.',
      );
    }
    if (
      approval.idempotencyKey !==
      buildLogicalWriteKey({
        arguments: args,
        organizationId: context.organizationId,
        userId: context.userId,
        threadId,
        scope,
        toolName: approval.toolName,
      })
    ) {
      throw new BadRequestException(
        'Approval does not belong to this user and thread. Prepare the action again in the current scope.',
      );
    }
    if (!getToolByName(approval.toolName)?.surfaces.agent) {
      throw new ConflictException('This action is no longer available.');
    }
    if (
      approval.status === 'PENDING' &&
      (!Number.isFinite(Date.parse(String(proposal.data.expiresAt))) ||
        Date.parse(String(proposal.data.expiresAt)) <= Date.now())
    ) {
      throw new ConflictException(
        'This approval expired. Prepare the action again.',
      );
    }
    if (approval.status === 'DECLINED' && action === 'confirm_mutation') {
      throw new ConflictException(
        'This action was declined. Prepare a new action to continue.',
      );
    }
    if (approval.status === 'APPROVED' && action === 'decline_mutation') {
      throw new ConflictException('This action was already approved.');
    }
    if (approval.status === 'PENDING') {
      await this.approvals.resolve(
        approvalId,
        context.organizationId,
        action === 'confirm_mutation' ? 'approve' : 'decline',
        undefined,
        context.apiKeyContext,
      );
    }
    const status = action === 'confirm_mutation' ? 'approved' : 'declined';
    const result: AgentToolResult =
      status === 'approved'
        ? await this.executor.executeTool(
            approval.toolName as CuratedActionName,
            args,
            {
              apiKeyContext: context.apiKeyContext,
              approvedApprovalId: approvalId,
              brandId: scope.brandId,
              hostSupportsApproval: true,
              organizationId: context.organizationId,
              userId: context.userId,
              threadId,
              validatedScope: scope,
              runId: context.executionId,
              generationPriority: context.generationPriority,
            },
          )
        : { creditsUsed: 0, success: true };
    let resolvedCard: AgentUiAction | undefined;
    for (const copy of proposals) {
      const actions = copy.actions.map((candidate) => {
        const card = record(candidate);
        if (card.id !== sourceActionId) return candidate;
        const resolved = {
          ...card,
          ctas: [],
          requiresConfirmation: false,
          data: {
            ...record(card.data),
            status,
            executionStatus:
              status === 'declined'
                ? 'cancelled'
                : result.success
                  ? 'completed'
                  : 'failed',
            ...(result.error ? { error: result.error } : {}),
          },
        } as AgentUiAction;
        resolvedCard ??= resolved;
        return resolved;
      });
      const patched = await this.messages.patchAll(
        {
          id: copy.messageId,
          threadId,
          organizationId: context.organizationId,
          isDeleted: false,
        },
        {
          metadata: { ...copy.metadata, uiActions: actions },
        },
      );
      if (patched.modifiedCount !== 1 && copy.data.status !== status) {
        throw new ConflictException(
          'Unable to update the original approval card. Retry this action.',
        );
      }
    }
    if (!resolvedCard)
      throw new ConflictException('The approval card is unavailable.');
    const digest = createHash('sha256')
      .update(
        [
          context.organizationId,
          context.userId,
          threadId,
          approvalId,
          status,
        ].join('\u001f'),
      )
      .digest('hex');
    const messageId = [
      digest.slice(0, 8),
      digest.slice(8, 12),
      `5${digest.slice(13, 16)}`,
      `a${digest.slice(17, 20)}`,
      digest.slice(20, 32),
    ].join('-');
    return this.finalizer.finalizeStructuredAssistantTurn({
      content:
        status === 'declined'
          ? 'Action declined. Nothing was executed.'
          : result.success
            ? 'Approved action completed.'
            : `Approved action failed: ${result.error ?? 'Please retry later.'}`,
      context,
      messageId,
      model: params.model,
      result: {
        ...result,
        nextActions: [resolvedCard, ...(result.nextActions ?? [])],
      },
      threadId,
      eventIdempotencyKey: `mutation-result:${approvalId}:${status}`,
      toolCalls:
        status === 'approved'
          ? [
              {
                toolName: approval.toolName,
                creditsUsed: result.creditsUsed,
                durationMs: 0,
                status: result.success ? 'completed' : 'failed',
                error: result.error,
              },
            ]
          : [],
    });
  }

  private async loadProposals(
    params: ThreadUiActionExecutionParams,
    sourceActionId: string,
    approvalId: string,
  ) {
    const proposals: PersistedMutationProposal[] = [];
    for (let page = 1; page <= 50; page++) {
      const messages = await this.messages.getMessagesByRoom(
        params.threadId,
        params.context.organizationId,
        { limit: 100, page },
      );
      for (const message of messages) {
        if (String(message.role).toLowerCase() !== 'assistant') continue;
        const metadata = record(message.metadata);
        const actions = Array.isArray(metadata.uiActions)
          ? metadata.uiActions
          : [];
        const card = actions
          .map(record)
          .find((candidate) => candidate.id === sourceActionId);
        if (!card) continue;
        const data = record(card.data);
        if (
          card.type !== 'mutation_approval_card' ||
          data.approvalId !== approvalId ||
          data.sourceActionId !== sourceActionId
        ) {
          throw new BadRequestException(
            'The original card does not match this approval.',
          );
        }
        proposals.push({
          actions,
          data,
          messageId: String(message.id),
          metadata,
        });
      }
      if (messages.length < 100) break;
    }
    if (!proposals.length)
      throw new BadRequestException(
        'The original approval card was not found in this thread.',
      );
    return proposals;
  }
}

import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { ThreadUiActionExecutionParams } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action.types';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { AgentUiAction } from '@genfeedai/contracts/interfaces';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { toPlainJson } from '@serializers/helpers/plain-json.helper';

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

@Injectable()
export class AgentGenerationDecisionService {
  constructor(private readonly prisma: PrismaService) {}

  async transition(
    params: ThreadUiActionExecutionParams,
    decision: 'approved' | 'declined',
  ): Promise<AgentUiAction> {
    const { context, threadId, payload } = params;
    const sourceActionId =
      typeof payload?.sourceActionId === 'string'
        ? payload.sourceActionId.trim()
        : '';
    if (
      !sourceActionId ||
      (decision === 'declined' &&
        Object.keys(payload ?? {}).some(
          (key) => !['sourceActionId', 'generationType'].includes(key),
        ))
    ) {
      throw new BadRequestException(
        'The original generation source action is required.',
      );
    }
    return this.prisma.$transaction(async (transaction) => {
      const key = JSON.stringify([
        'agent-generation-decision',
        context.organizationId,
        context.userId,
        threadId,
      ]);
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
      const thread = await transaction.agentThread.findFirst({
        where: {
          id: threadId,
          organizationId: context.organizationId,
          userId: context.userId,
          isDeleted: false,
          status: 'active',
        },
      });
      if (!thread)
        throw new NotFoundException(
          'The active generation thread was not found.',
        );
      const messages = await transaction.agentMessage.findMany({
        select: { id: true, metadata: true },
        where: {
          threadId,
          organizationId: context.organizationId,
          isDeleted: false,
          role: 'assistant',
        },
      });
      let resolvedCard: AgentUiAction | undefined;
      for (const message of messages) {
        const metadata = record(message.metadata);
        const actions = Array.isArray(metadata.uiActions)
          ? metadata.uiActions
          : [];
        let hasChanges = false;
        const updatedActions = actions.map((candidate) => {
          const card = record(candidate);
          if (card.id !== sourceActionId) return candidate;
          const data = record(card.data);
          if (
            card.type !== 'generation_action_card' ||
            !['image', 'video'].includes(String(card.generationType)) ||
            (payload?.generationType !== undefined &&
              card.generationType !== payload.generationType) ||
            (data.sourceActionId !== undefined &&
              data.sourceActionId !== sourceActionId)
          ) {
            throw new BadRequestException(
              'The original generation card does not match this action.',
            );
          }
          const scope = record(metadata.agentScope);
          const scopeVersion = data.scopeVersion ?? scope.contextVersion;
          const brandId = 'brandId' in data ? data.brandId : scope.brandId;
          if (
            (scopeVersion !== undefined &&
              scopeVersion !== thread.contextVersion) ||
            (brandId !== undefined &&
              (brandId ?? null) !== (thread.brandId ?? null)) ||
            (context.scope &&
              (context.scope.contextVersion !== thread.contextVersion ||
                (context.scope.brandId ?? null) !== (thread.brandId ?? null)))
          ) {
            throw new ConflictException(
              'This generation review belongs to an earlier thread scope.',
            );
          }
          if (
            data.decision !== undefined &&
            data.decision !== 'pending' &&
            data.decision !== decision
          ) {
            throw new ConflictException(
              'This generation review already has a different decision.',
            );
          }
          hasChanges = true;
          resolvedCard = {
            ...card,
            id: sourceActionId,
            type: 'generation_action_card',
            title:
              typeof card.title === 'string' ? card.title : 'Generation review',
            generationType: card.generationType as 'image' | 'video',
            data: { ...data, decision, sourceActionId },
          };
          return resolvedCard;
        });
        if (hasChanges) {
          await transaction.agentMessage.update({
            where: {
              id: message.id,
              threadId,
              organizationId: context.organizationId,
              isDeleted: false,
            },
            data: {
              metadata: toPlainJson({ ...metadata, uiActions: updatedActions }),
            },
          });
        }
      }
      if (!resolvedCard)
        throw new BadRequestException(
          'The original generation card was not found in this thread.',
        );
      return resolvedCard;
    });
  }
}

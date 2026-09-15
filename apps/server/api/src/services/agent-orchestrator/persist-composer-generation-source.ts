import { createHash } from 'node:crypto';
import type { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import type { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PreparedAgentTurnState } from '@api/services/agent-orchestrator/agent-turn-workflow-execution.service';
import { AgentMessageRole } from '@genfeedai/contracts';

export async function persistComposerGenerationSource(
  state: PreparedAgentTurnState,
  generationType: 'image' | 'video',
  threads: AgentThreadsService,
  messages: AgentMessagesService,
) {
  const thread = await threads.findOne({
    id: state.threadId,
    organizationId: state.organizationId,
    userId: state.userId,
    status: 'active',
    isDeleted: false,
  });
  if (!thread)
    throw new NotFoundException('The active generation thread was not found.');
  const sourceActionId = `composer-generation-${state.executionId}`;
  const digest = createHash('sha256')
    .update(
      [
        'composer-generation-source',
        state.organizationId,
        state.userId,
        state.threadId,
        state.executionId,
      ].join('\u001f'),
    )
    .digest('hex');
  const id = [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `5${digest.slice(13, 16)}`,
    `a${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join('-');
  await messages.addMessage({
    id,
    organizationId: state.organizationId,
    userId: state.userId,
    room: state.threadId,
    brandId: thread.brandId ?? undefined,
    role: AgentMessageRole.ASSISTANT,
    content: 'Generation request accepted.',
    metadata: {
      uiActions: [
        {
          id: sourceActionId,
          type: 'generation_action_card',
          title:
            generationType === 'image' ? 'Generate Image' : 'Generate Video',
          generationType,
          generationParams: {
            ...state.request.generationSettings,
            prompt: state.request.content,
          },
          data: {
            decision: 'pending',
            sourceActionId,
            brandId: thread.brandId,
            scopeVersion: thread.contextVersion,
          },
        },
      ],
    },
  });
  return sourceActionId;
}

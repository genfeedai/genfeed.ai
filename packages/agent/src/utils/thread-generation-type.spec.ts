import type { AgentChatMessage } from '@genfeedai/agent/models/agent-chat.model';
import { resolveThreadGenerationType } from '@genfeedai/agent/utils/thread-generation-type';
import { describe, expect, it } from 'vitest';

function message(
  id: string,
  createdAt: string,
  uiActions: NonNullable<AgentChatMessage['metadata']>['uiActions'],
  threadId = 'thread-1',
): AgentChatMessage {
  return {
    content: '',
    createdAt,
    id,
    metadata: { uiActions },
    role: 'assistant',
    threadId,
  };
}

describe('resolveThreadGenerationType', () => {
  it('locks to the earliest generation card even when messages arrive newest-first', () => {
    const locked = resolveThreadGenerationType([
      message('newer-video', '2026-08-19T08:43:00.000Z', [
        {
          generationType: 'video',
          id: 'generation-video',
          title: 'Generate Video',
          type: 'generation_action_card',
        },
      ]),
      message('older-image', '2026-08-18T09:32:00.000Z', [
        {
          generationType: 'image',
          id: 'generation-image',
          title: 'Generate Image',
          type: 'generation_action_card',
        },
      ]),
    ]);

    expect(locked).toBe('image');
  });

  it('ignores generation cards from another thread', () => {
    const locked = resolveThreadGenerationType(
      [
        message(
          'other-image',
          '2026-08-18T09:00:00.000Z',
          [
            {
              generationType: 'image',
              id: 'generation-other',
              title: 'Generate Image',
              type: 'generation_action_card',
            },
          ],
          'thread-other',
        ),
        message('current-video', '2026-08-18T10:00:00.000Z', [
          {
            generationType: 'video',
            id: 'generation-video',
            title: 'Generate Video',
            type: 'generation_action_card',
          },
        ]),
      ],
      'thread-1',
    );

    expect(locked).toBe('video');
  });

  it('returns null when the thread has not prepared generation yet', () => {
    expect(
      resolveThreadGenerationType([
        {
          content: 'Hello',
          createdAt: '2026-08-18T09:00:00.000Z',
          id: 'user-1',
          role: 'user',
          threadId: 'thread-1',
        },
      ]),
    ).toBeNull();
  });
});

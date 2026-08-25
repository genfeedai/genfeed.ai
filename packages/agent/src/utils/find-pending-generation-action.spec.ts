import type { AgentChatMessage } from '@genfeedai/agent/models/agent-chat.model';
import { findPendingGenerationAction } from '@genfeedai/agent/utils/find-pending-generation-action';
import { describe, expect, it } from 'vitest';

function message(
  id: string,
  uiActions: NonNullable<AgentChatMessage['metadata']>['uiActions'],
): AgentChatMessage {
  return {
    content: '',
    createdAt: '2026-08-05T12:00:00.000Z',
    id,
    metadata: { uiActions },
    role: 'assistant',
    threadId: 'thread-1',
  };
}

describe('findPendingGenerationAction', () => {
  it('returns the newest unresolved generation request', () => {
    const action = findPendingGenerationAction([
      message('message-1', [
        {
          generationType: 'image',
          id: 'generation-1',
          title: 'Configure image',
          type: 'generation_action_card',
        },
      ]),
    ]);

    expect(action?.id).toBe('generation-1');
  });

  it('hides a request after a later output resolves it', () => {
    const action = findPendingGenerationAction([
      message('message-1', [
        {
          generationType: 'video',
          id: 'generation-1',
          title: 'Configure video',
          type: 'generation_action_card',
        },
      ]),
      message('message-2', [
        {
          data: { sourceGenerationActionId: 'generation-1' },
          id: 'video-output-1',
          title: 'Video generated',
          type: 'content_preview_card',
          videos: ['https://cdn.example.com/video.mp4'],
        },
      ]),
    ]);

    expect(action).toBeNull();
  });

  it('ignores generation cards that belong to another thread', () => {
    const action = findPendingGenerationAction(
      [
        message('message-other', [
          {
            generationType: 'image',
            id: 'generation-other',
            title: 'Configure image',
            type: 'generation_action_card',
          },
        ]),
        {
          ...message('message-current', [
            {
              generationType: 'video',
              id: 'generation-current',
              title: 'Configure video',
              type: 'generation_action_card',
            },
          ]),
          threadId: 'thread-2',
        },
      ],
      'thread-2',
    );

    expect(action?.id).toBe('generation-current');
  });

  it('keeps an image thread on the image card when a later video card is pending', () => {
    const action = findPendingGenerationAction(
      [
        message('message-image', [
          {
            generationType: 'image',
            id: 'generation-image',
            title: 'Generate Image',
            type: 'generation_action_card',
          },
        ]),
        message('message-video', [
          {
            generationType: 'video',
            id: 'generation-video',
            title: 'Generate Video',
            type: 'generation_action_card',
          },
        ]),
      ],
      'thread-1',
      'image',
    );

    expect(action?.id).toBe('generation-image');
  });
});

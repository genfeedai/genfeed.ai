import type { AgentChatMessage } from '@cloud/agent/models/agent-chat.model';
import { extractThreadAssets } from '@cloud/agent/utils/extract-thread-assets';
import { describe, expect, it } from 'vitest';

const baseMessage: AgentChatMessage = {
  content: 'assistant response',
  createdAt: '2026-03-03T00:00:00.000Z',
  id: 'message-1',
  role: 'assistant',
  threadId: 'thread-1',
};

describe('extractThreadAssets', () => {
  it('extracts images, videos, audio, and ingredient assets from ui actions', () => {
    const messages: AgentChatMessage[] = [
      {
        ...baseMessage,
        metadata: {
          uiActions: [
            {
              audio: ['https://cdn.genfeed.ai/audio/test.mp3'],
              id: 'action-1',
              images: ['https://cdn.genfeed.ai/images/a.jpg'],
              ingredients: [
                {
                  id: 'ingredient-1',
                  title: 'Picked image',
                  type: 'image',
                  url: 'https://cdn.genfeed.ai/images/ingredient.jpg',
                },
              ],
              title: 'Generated content',
              type: 'content_preview_card',
              videos: ['https://cdn.genfeed.ai/videos/v.mp4'],
            },
          ],
        },
      },
    ];

    const assets = extractThreadAssets(messages);

    expect(assets).toHaveLength(4);
    expect(assets.map((asset) => asset.type).sort()).toEqual([
      'audio',
      'image',
      'image',
      'video',
    ]);
  });

  it('dedupes repeated assets across actions and messages', () => {
    const duplicateUrl = 'https://cdn.genfeed.ai/images/same.jpg';

    const messages: AgentChatMessage[] = [
      {
        ...baseMessage,
        id: 'message-1',
        metadata: {
          uiActions: [
            {
              id: 'action-1',
              images: [duplicateUrl],
              title: 'First',
              type: 'content_preview_card',
            },
          ],
        },
      },
      {
        ...baseMessage,
        id: 'message-2',
        metadata: {
          uiActions: [
            {
              id: 'action-2',
              images: [duplicateUrl],
              title: 'Second',
              type: 'content_preview_card',
            },
          ],
        },
      },
    ];

    const assets = extractThreadAssets(messages);

    expect(assets).toHaveLength(1);
    expect(assets[0]?.messageId).toBe('message-1');
    expect(assets[0]?.url).toBe(duplicateUrl);
  });

  it('includes metadata.mediaUrl fallback and infers media type', () => {
    const messages: AgentChatMessage[] = [
      {
        ...baseMessage,
        metadata: {
          mediaUrl: 'https://cdn.genfeed.ai/videos/clip.mp4',
        },
      },
    ];

    const assets = extractThreadAssets(messages);

    expect(assets).toHaveLength(1);
    expect(assets[0]?.type).toBe('video');
  });
});

import { readLatestOperatorMessage } from '@api/services/agent-orchestrator/utils/agent-operator-message.util';
import type { OpenRouterMessage } from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { describe, expect, it } from 'vitest';

describe('readLatestOperatorMessage', () => {
  it('returns the newest user message', () => {
    const messages: OpenRouterMessage[] = [
      { content: 'system prompt', role: 'system' },
      { content: 'first ask', role: 'user' },
      { content: 'reply', role: 'assistant' },
      { content: 'Do not generate yet', role: 'user' },
    ];

    expect(readLatestOperatorMessage(messages)).toBe('Do not generate yet');
  });

  it('reads the text of a message sent with attachments', () => {
    const messages: OpenRouterMessage[] = [
      { content: 'older ask', role: 'user' },
      {
        content: [
          { text: 'Show the model and cost first', type: 'text' },
          {
            image_url: { url: 'https://cdn.example/a.png' },
            type: 'image_url',
          },
        ],
        role: 'user',
      },
    ];

    expect(readLatestOperatorMessage(messages)).toBe(
      'Show the model and cost first',
    );
  });

  it('does not fall back to an older message when the newest has no text', () => {
    const messages: OpenRouterMessage[] = [
      { content: 'Do not generate yet', role: 'user' },
      {
        content: [
          {
            image_url: { url: 'https://cdn.example/a.png' },
            type: 'image_url',
          },
        ],
        role: 'user',
      },
    ];

    expect(readLatestOperatorMessage(messages)).toBeNull();
  });

  it('returns null when there is no user message', () => {
    expect(
      readLatestOperatorMessage([{ content: 'system prompt', role: 'system' }]),
    ).toBeNull();
    expect(readLatestOperatorMessage([])).toBeNull();
  });
});

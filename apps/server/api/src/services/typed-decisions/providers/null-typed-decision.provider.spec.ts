import { NullTypedDecisionProvider } from '@api/services/typed-decisions/providers/null-typed-decision.provider';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('NullTypedDecisionProvider', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  const provider = new NullTypedDecisionProvider();

  afterEach(() => {
    fetchSpy.mockClear();
  });

  it('answers nothing, so every call site keeps its deterministic path', async () => {
    await expect(
      provider.choose({
        options: ['spam', 'question'] as const,
        question: 'What is this comment?',
        state: { comment: 'buy followers' },
      }),
    ).resolves.toBeNull();
    await expect(
      provider.score({ question: 'How urgent?', state: {} }),
    ).resolves.toBeNull();
    await expect(
      provider.decide({ question: 'Is it spam?', state: {} }),
    ).resolves.toBeNull();
  });

  it('never reaches the network', async () => {
    await provider.decide({ question: 'Is it spam?', state: {} });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

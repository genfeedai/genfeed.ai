import { SocialConversationType } from '@genfeedai/contracts';
import type { UseMessagesActionsParams } from '@genfeedai/props/messages/messages-actions.props';
import type { SocialMessagesService } from '@services/social/messages.service';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ChangeEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useMessagesActions } from './use-messages-actions';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
function setup() {
  const suggestedReply = vi.fn();
  const params: UseMessagesActionsParams = {
    canAttachReferences: false,
    conversationType: SocialConversationType.DM,
    getMessagesService: async () =>
      ({ suggestedReply }) as unknown as SocialMessagesService,
    loadConversations: vi.fn(),
    refreshSelectedThread: vi.fn(),
    selectedConversation: null,
    selectedId: 'conversation-1',
  };
  const hook = renderHook(
    (input: UseMessagesActionsParams) => useMessagesActions(input),
    { initialProps: params },
  );
  return { ...hook, params, suggestedReply };
}

describe('Inline suggested replies', () => {
  it('aborts when switching conversations and ignores stale results', async () => {
    const { result, suggestedReply, rerender, params } = setup();
    let complete: ((value: { draft: string }) => void) | undefined;
    suggestedReply.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    act(() => {
      void result.current.handleSuggestedReply();
    });
    await waitFor(() => expect(suggestedReply).toHaveBeenCalled());
    const signal = suggestedReply.mock.calls[0]?.[1] as AbortSignal;
    rerender({ ...params, selectedId: 'conversation-2' });
    expect(signal.aborted).toBe(true);
    await act(async () => complete?.({ draft: 'Wrong conversation' }));
    expect(result.current.draft).toBe('');
  });
});

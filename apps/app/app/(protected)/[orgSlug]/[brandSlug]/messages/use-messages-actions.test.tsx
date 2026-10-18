import { SocialConversationType } from '@genfeedai/contracts';
import type { UseMessagesActionsParams } from '@genfeedai/props/messages/messages-actions.props';
import type { SocialMessagesService } from '@services/social/messages.service';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useMessagesActions } from './use-messages-actions';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
function setup() {
  const suggestedReply = vi.fn();
  const params: UseMessagesActionsParams = {
    canAttachReferences: false,
    canWrite: true,
    conversationType: SocialConversationType.DM,
    getMessagesService: async () =>
      ({ suggestedReply }) as unknown as SocialMessagesService,
    loadConversations: vi.fn(),
    refreshSelectedThread: vi.fn(),
    selectedConversation: null,
    selectedId: 'conversation-1',
    syncCredentials: [],
  };
  const hook = renderHook(
    (input: UseMessagesActionsParams) => useMessagesActions(input),
    { initialProps: params },
  );
  return { ...hook, params, suggestedReply };
}

describe('Inline suggested replies', () => {
  it('fills the textarea without requiring an agent thread', async () => {
    const { result, suggestedReply } = setup();
    suggestedReply.mockResolvedValue({ draft: 'Hello Taylor' });
    await act(async () => result.current.handleSuggestedReply());
    expect(result.current.draft).toBe('Hello Taylor');
    expect(result.current.references).toEqual([]);
    expect(result.current.busyAction).toBeNull();
  });
  it('does not overwrite edits typed during generation', async () => {
    const { result, suggestedReply } = setup();
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
    act(() => result.current.handleDraftChange('My own reply'));
    await act(async () => complete?.({ draft: 'Late suggestion' }));
    expect(result.current.draft).toBe('My own reply');
  });
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

describe('Messages module admission', () => {
  it('blocks imperative work callbacks before obtaining a service', async () => {
    const { result, params, rerender } = setup();
    const getMessagesService = vi.fn(params.getMessagesService);
    rerender({ ...params, canWrite: false, getMessagesService });
    act(() => result.current.handleDraftChange('Local draft'));
    await act(async () => {
      await result.current.handleSync();
      await result.current.handleSuggestedReply();
      await result.current.handleAction('draft');
      await result.current.handleAction('reply');
      await result.current.handleAction('dm');
      await result.current.handleApproveDraft('message-1');
      await result.current.handleRejectDraft('message-1');
      await result.current.handleStatusChange('resolved');
    });
    expect(getMessagesService).not.toHaveBeenCalled();
    expect(result.current.draft).toBe('Local draft');
  });

  it('aborts a pending suggestion when module access is revoked', async () => {
    const { result, params, rerender, suggestedReply } = setup();
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
    rerender({ ...params, canWrite: false });
    expect(signal.aborted).toBe(true);
    await act(async () => complete?.({ draft: 'Stale response' }));
    expect(result.current.draft).toBe('');
  });
});

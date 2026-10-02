const workspace = vi.hoisted(() => ({
  state: {
    status: 'ready',
    snapshot: {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
      revision: 1,
    },
  },
}));

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChat } from '~hooks/use-chat';
import { useBrandStore } from '~store/use-brand-store';
import { useChatStore } from '~store/use-chat-store';

const reference = {
  kind: 'ingredient',
  serializer: 'ingredient',
  brandId: 'brand-1',
  organizationId: 'org-1',
  recordId: 'image-1',
} as const;
beforeEach(() => {
  workspace.state = {
    status: 'ready',
    snapshot: {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
      revision: 1,
    },
  };
  useBrandStore.setState({ activeBrandId: 'brand-1' });
  useChatStore.setState({
    activeThreadId: null,
    messages: [],
    isGenerating: false,
    error: null,
  });
  vi.mocked(chrome.runtime.sendMessage).mockReset();
});
afterEach(cleanup);
describe('extension reference turns', () => {
  it('creates a scoped thread and sends the selected asset IDs', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(
      (message, callback) => {
        const request = message as unknown as { event: string };
        const respond = callback as unknown as (response: unknown) => void;
        if (request.event === 'chatCreateThread')
          respond({ success: true, threadId: 'thread-1' });
        else respond({ success: true, message: { content: 'Draft ready' } });
      },
    );
    const { result } = renderHook(useChat);
    await act(async () =>
      expect(
        await result.current.sendMessage('Use my image', [reference]),
      ).toBe(true),
    );
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'chatSendMessage',
        payload: expect.objectContaining({
          brandId: 'brand-1',
          artifactReferences: [reference],
          threadId: 'thread-1',
        }),
      }),
      expect.any(Function),
    );
    expect(
      useChatStore.getState().messages[0].metadata?.artifactReferences,
    ).toEqual([reference]);
  });
  it('returns failure to the composer when generation fails', async () => {
    useChatStore.setState({ activeThreadId: 'thread-1' });
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(
      (_message, callback) =>
        (callback as unknown as (response: unknown) => void)({
          success: false,
          error: 'Out of credits',
        }),
    );
    const { result } = renderHook(useChat);
    await act(async () =>
      expect(await result.current.sendMessage('Try this', [reference])).toBe(
        false,
      ),
    );
    expect(useChatStore.getState().error).toBe('Out of credits');
    expect(useChatStore.getState().isGenerating).toBe(false);
  });
  it('never starts an unscoped turn', async () => {
    useBrandStore.setState({ activeBrandId: null });
    const { result } = renderHook(useChat);
    expect(await result.current.sendMessage('Use this', [reference])).toBe(
      false,
    );
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});

vi.mock('~services/workspace.service', () => ({
  getWorkspaceState: () => workspace.state,
}));

it('discards a late reply after switching away and back to the same brand id', async () => {
  useChatStore.setState({ activeThreadId: 'thread-1' });
  let respond!: (response: unknown) => void;
  vi.mocked(chrome.runtime.sendMessage).mockImplementation(
    (_request, callback) => {
      respond = callback as unknown as typeof respond;
    },
  );
  const { result } = renderHook(useChat);
  let pending!: Promise<boolean>;
  act(() => {
    pending = result.current.sendMessage('Old request', [reference]);
  });
  await vi.waitFor(() => expect(respond).toBeDefined());
  workspace.state = {
    ...workspace.state,
    snapshot: { ...workspace.state.snapshot, revision: 3 },
  };
  useChatStore.setState({ messages: [], activeThreadId: 'thread-1' });
  await act(async () => {
    respond({ success: true, message: { content: 'Late reply' } });
    expect(await pending).toBe(false);
  });
  expect(useChatStore.getState().messages).toEqual([]);
});

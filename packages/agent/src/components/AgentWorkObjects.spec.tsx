import { AgentWorkObjects } from '@genfeedai/agent/components/AgentWorkObjects';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { useAgentWorkObjectGateStore } from '@genfeedai/agent/stores/agent-work-object-gate.store';
import type { AgentWorkObjectCollection } from '@genfeedai/contracts/interfaces';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../apps/app/tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/brand${path}` }),
}));

const sources: AgentWorkObjectCollection = {
  workObjects: [],
  sessionAssets: [
    {
      ingredientId: 'source-1',
      kind: 'video',
      title: 'Interview source',
      duration: 42,
      url: 'https://media.example/source.mp4',
      href: '/library/videos?asset=source-1',
    },
  ],
};

beforeEach(() => {
  useAgentChatStore.setState({
    activeThreadId: 'thread-1',
    messages: [],
    workEvents: [],
    threads: [],
  });
  useAgentWorkObjectGateStore.setState({ threads: {} });
  sessionStorage.clear();
});

describe('session work context', () => {
  it('links persisted sources directly to scoped Library, with human media context', async () => {
    const getWorkObjects = vi.fn().mockResolvedValue(sources);
    render(
      <AgentWorkObjects
        apiService={{ getWorkObjects } as unknown as AgentApiService}
      />,
    );
    const link = await screen.findByRole('link', {
      name: 'Interview source · Video · 42s',
    });
    expect(link).toHaveAttribute(
      'href',
      '/acme/brand/library/videos?asset=source-1',
    );
    expect(getWorkObjects).toHaveBeenCalledWith(
      'thread-1',
      expect.any(String),
      expect.any(AbortSignal),
    );
    expect(sessionStorage.getItem('agent-work-session:thread-1')).toBeTruthy();
  });

  it('rejects a late collection from the previous thread', async () => {
    let resolveFirst: ((value: AgentWorkObjectCollection) => void) | undefined;
    const getWorkObjects = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<AgentWorkObjectCollection>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValue({ workObjects: [], sessionAssets: [] });
    render(
      <AgentWorkObjects
        apiService={{ getWorkObjects } as unknown as AgentApiService}
      />,
    );
    await act(async () =>
      useAgentChatStore.setState({ activeThreadId: 'thread-2' }),
    );
    await waitFor(() => expect(getWorkObjects).toHaveBeenCalledTimes(2));
    await act(async () => resolveFirst?.(sources));
    expect(screen.queryByText(/Interview source/)).not.toBeInTheDocument();
  });

  it('keeps generate locked when loading failed and retries the current session', async () => {
    const getWorkObjects = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(sources);
    render(
      <AgentWorkObjects
        apiService={{ getWorkObjects } as unknown as AgentApiService}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Could not load your work. Retry',
      }),
    );
    await screen.findByRole('link', { name: /Interview source/ });
    expect(getWorkObjects).toHaveBeenCalledTimes(2);
    expect(getWorkObjects.mock.calls[0]?.[1]).toBe(
      getWorkObjects.mock.calls[1]?.[1],
    );
  });
});

describe('ask identity isolation', () => {
  it('does not clear the current question when an older answer resolves', () => {
    useAgentChatStore.getState().setPendingInputRequest({
      inputRequestId: 'new-ask',
      threadId: 'thread-1',
      prompt: 'New question',
      title: 'Choose',
    });
    useAgentChatStore.getState().clearPendingInputRequest('old-ask');
    expect(
      useAgentChatStore.getState().pendingInputRequest?.inputRequestId,
    ).toBe('new-ask');
    useAgentChatStore.getState().clearPendingInputRequest('new-ask');
    expect(useAgentChatStore.getState().pendingInputRequest).toBeNull();
  });
});

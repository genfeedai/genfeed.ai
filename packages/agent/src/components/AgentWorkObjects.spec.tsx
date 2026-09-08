import { AgentWorkObjects } from '@genfeedai/agent/components/AgentWorkObjects';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { useAgentWorkObjectGateStore } from '@genfeedai/agent/stores/agent-work-object-gate.store';
import type {
  AgentWorkObject,
  AgentWorkObjectActionPayload,
  AgentWorkObjectCollection,
} from '@genfeedai/contracts/interfaces';
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

it('refetches after concurrent view and edit finish, ignoring stale poll and mutation responses', async () => {
  const first: AgentWorkObject = {
    id: 'first',
    kind: 'script',
    title: 'Brief',
    body: 'Brief text',
    rowCount: 0,
    revision: 1,
    viewedInSession: false,
    reviewStatus: 'pending',
    href: '/library?asset=first',
    reference: {
      kind: 'ingredient',
      serializer: 'ingredient',
      recordId: 'first',
      organizationId: 'org-1',
    },
  };
  const second: AgentWorkObject = {
    ...first,
    id: 'second',
    title: 'Script',
    body: 'Initial script',
  };
  const initial: AgentWorkObjectCollection = {
    sessionAssets: [],
    workObjects: [first, second],
  };
  const saved: AgentWorkObjectCollection = {
    sessionAssets: [],
    workObjects: [
      { ...first, viewedInSession: true },
      { ...second, body: 'Saved script', revision: 2 },
    ],
  };
  let resolveView: ((value: AgentWorkObjectCollection) => void) | undefined;
  let resolveEdit: ((value: AgentWorkObjectCollection) => void) | undefined;
  const getWorkObjects = vi
    .fn()
    .mockResolvedValueOnce(initial)
    .mockResolvedValue(saved);
  const actOnWorkObject = vi.fn(
    (
      _threadId: string,
      _objectId: string,
      payload: AgentWorkObjectActionPayload,
    ) =>
      new Promise<AgentWorkObjectCollection>((resolve) => {
        if (payload.action === 'view') resolveView = resolve;
        if (payload.action === 'edit') resolveEdit = resolve;
      }),
  );
  render(
    <AgentWorkObjects
      apiService={
        { getWorkObjects, actOnWorkObject } as unknown as AgentApiService
      }
    />,
  );
  await screen.findByLabelText('Script');
  fireEvent.click(
    screen.getAllByRole('button', { name: 'I have viewed this draft' })[0],
  );
  fireEvent.change(screen.getByLabelText('Script'), {
    target: { value: 'Saved script' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await act(async () =>
    useAgentChatStore.setState({
      messages: [
        {
          id: 'new-message',
          threadId: 'thread-1',
          role: 'user',
          content: 'Follow-up',
          createdAt: '2026-09-08T12:00:00Z',
        },
      ],
    }),
  );
  expect(getWorkObjects).toHaveBeenCalledTimes(1);
  await act(async () => resolveEdit?.(saved));
  await act(async () => resolveView?.(initial));
  await waitFor(() => expect(getWorkObjects).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText('Script')).toHaveValue('Saved script');
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

function reviewingCollection(): AgentWorkObjectCollection {
  return {
    sessionAssets: [],
    workObjects: [
      {
        id: 'review-1',
        kind: 'script',
        title: 'Draft',
        body: 'Text',
        rowCount: 0,
        revision: 1,
        viewedInSession: true,
        reviewStatus: 'reviewing',
        href: '/library?asset=review-1',
        reference: {
          kind: 'ingredient',
          serializer: 'ingredient',
          recordId: 'review-1',
          organizationId: 'org-1',
        },
      },
    ],
  };
}

it('backs off failed reviews to a bounded delay without abandoning polling and cleans up', async () => {
  vi.useFakeTimers();
  const getWorkObjects = vi
    .fn()
    .mockResolvedValueOnce(reviewingCollection())
    .mockRejectedValue(new Error('offline'));
  const view = render(
    <AgentWorkObjects
      apiService={{ getWorkObjects } as unknown as AgentApiService}
    />,
  );
  try {
    await act(async () => undefined);
    expect(getWorkObjects).toHaveBeenCalledTimes(2);
    for (const delay of [3000, 6000, 12000, 24000, 30000, 30000, 30000]) {
      const calls = getWorkObjects.mock.calls.length;
      await act(async () => vi.advanceTimersByTimeAsync(delay - 1));
      expect(getWorkObjects).toHaveBeenCalledTimes(calls);
      await act(async () => vi.advanceTimersByTimeAsync(1));
      expect(getWorkObjects).toHaveBeenCalledTimes(calls + 1);
    }
    const signal = getWorkObjects.mock.calls.at(-1)?.[2] as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    const calls = getWorkObjects.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(60000));
    expect(getWorkObjects).toHaveBeenCalledTimes(calls);
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});

it('resets review polling delay after success and when switching threads', async () => {
  vi.useFakeTimers();
  const result = reviewingCollection();
  const getWorkObjects = vi
    .fn()
    .mockResolvedValueOnce(result)
    .mockRejectedValueOnce(new Error('offline'))
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(result);
  const view = render(
    <AgentWorkObjects
      apiService={{ getWorkObjects } as unknown as AgentApiService}
    />,
  );
  try {
    await act(async () => undefined);
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(getWorkObjects).toHaveBeenCalledTimes(3);
    await act(async () => vi.advanceTimersByTimeAsync(6000));
    expect(getWorkObjects).toHaveBeenCalledTimes(4);
    await act(async () => vi.advanceTimersByTimeAsync(1500));
    expect(getWorkObjects).toHaveBeenCalledTimes(5);
    getWorkObjects.mockRejectedValueOnce(new Error('offline'));
    await act(async () => vi.advanceTimersByTimeAsync(1500));
    await act(async () =>
      useAgentChatStore.setState({ activeThreadId: 'thread-2' }),
    );
    const calls = getWorkObjects.mock.calls.length;
    expect(getWorkObjects.mock.calls.at(-1)?.[0]).toBe('thread-2');
    await act(async () => vi.advanceTimersByTimeAsync(1499));
    expect(getWorkObjects).toHaveBeenCalledTimes(calls);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(getWorkObjects).toHaveBeenCalledTimes(calls + 1);
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});

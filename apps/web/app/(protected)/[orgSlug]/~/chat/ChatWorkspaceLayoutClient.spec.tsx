import { act, render, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatWorkspaceLayoutClient } from './ChatWorkspaceLayoutClient';

const routerReplace = vi.fn();
const sendMessage = vi.fn();
const completeFunnel = vi.fn();
const touchSession = vi.fn();

const navigationState = {
  params: {} as { id?: string; threadId?: string },
  pathname: '/chat/new',
  searchParams: new URLSearchParams(),
};

const storeState = {
  activeThreadId: 'thread-existing' as string | null,
};

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: vi.fn().mockResolvedValue('token'),
    isLoaded: true,
  }),
  useSession: () => ({
    session: {
      touch: touchSession,
    },
  }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    selectedBrand: {
      id: 'brand-1',
    },
  }),
}));

vi.mock('@genfeedai/agent', () => ({
  AgentApiService: class AgentApiService {},
  AgentFullPage: ({
    children,
    threadId,
  }: PropsWithChildren<{ threadId?: string }>) => (
    <div data-testid="agent-full-page" data-thread-id={threadId ?? ''}>
      {children}
    </div>
  ),
  useAgentChatStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
  useAgentChatStream: () => ({
    sendMessage,
  }),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    JWT_LABEL: 'jwt',
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@services/external/services.service', () => ({
  ServicesService: class ServicesService {
    postConnect = vi.fn();
  },
}));

vi.mock('@services/onboarding/onboarding-funnel.service', () => ({
  OnboardingFunnelService: {
    getInstance: () => ({
      completeFunnel,
    }),
  },
}));

vi.mock('next/navigation', () => ({
  useParams: () => navigationState.params,
  usePathname: () => navigationState.pathname,
  useRouter: () => ({
    push: vi.fn(),
    replace: routerReplace,
  }),
  useSearchParams: () => navigationState.searchParams,
}));

describe('ChatWorkspaceLayoutClient', () => {
  beforeEach(() => {
    navigationState.params = {};
    navigationState.pathname = '/chat/new';
    navigationState.searchParams = new URLSearchParams();
    storeState.activeThreadId = 'thread-existing';
    routerReplace.mockReset();
    sendMessage.mockReset();
    sendMessage.mockResolvedValue(undefined);
    completeFunnel.mockReset();
    touchSession.mockReset();
  });

  it('does not immediately redirect /chat/new back to the previously active thread', async () => {
    render(
      <ChatWorkspaceLayoutClient>
        <div>child</div>
      </ChatWorkspaceLayoutClient>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(routerReplace).not.toHaveBeenCalled();
  });

  it('navigates to the newly created thread after /chat/new produces a different active thread id', async () => {
    const view = render(
      <ChatWorkspaceLayoutClient>
        <div>child</div>
      </ChatWorkspaceLayoutClient>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    storeState.activeThreadId = 'thread-new';

    view.rerender(
      <ChatWorkspaceLayoutClient>
        <div>child</div>
      </ChatWorkspaceLayoutClient>,
    );

    await waitFor(() => {
      expect(routerReplace).toHaveBeenCalledWith('/chat/thread-new');
    });
  });

  it('navigates to the onboarding thread route after /chat/onboarding produces a different active thread id', async () => {
    navigationState.pathname = '/chat/onboarding';
    const view = render(
      <ChatWorkspaceLayoutClient>
        <div>child</div>
      </ChatWorkspaceLayoutClient>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    storeState.activeThreadId = 'thread-new';

    view.rerender(
      <ChatWorkspaceLayoutClient>
        <div>child</div>
      </ChatWorkspaceLayoutClient>,
    );

    await waitFor(() => {
      expect(routerReplace).toHaveBeenCalledWith('/chat/onboarding/thread-new');
    });
  });

  it('boots a prefilled prompt only once per query string', async () => {
    navigationState.searchParams = new URLSearchParams('prompt=hello');
    const view = render(
      <ChatWorkspaceLayoutClient>
        <div>child</div>
      </ChatWorkspaceLayoutClient>,
    );

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith('hello', {
        forceNewThread: true,
        signal: expect.any(AbortSignal),
        source: 'agent',
      });
    });

    view.rerender(
      <ChatWorkspaceLayoutClient>
        <div>child</div>
      </ChatWorkspaceLayoutClient>,
    );

    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('boots onboarding prefills with onboarding source on the onboarding route', async () => {
    navigationState.pathname = '/chat/onboarding';
    navigationState.searchParams = new URLSearchParams(
      'prompt=help%20me%20define%20my%20brand%20voice',
    );

    render(
      <ChatWorkspaceLayoutClient>
        <div>child</div>
      </ChatWorkspaceLayoutClient>,
    );

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        'help me define my brand voice',
        {
          forceNewThread: true,
          signal: expect.any(AbortSignal),
          source: 'onboarding',
        },
      );
    });
  });
});

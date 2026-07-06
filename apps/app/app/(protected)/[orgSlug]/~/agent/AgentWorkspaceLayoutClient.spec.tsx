import { act, render, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentWorkspaceLayoutClient } from './AgentWorkspaceLayoutClient';

const routerReplace = vi.fn();
const sendMessage = vi.fn();
const patchMe = vi.fn();
const touchSession = vi.fn();

const navigationState = {
  params: {
    orgSlug: 'acme-org',
    brandSlug: 'acme-creator',
  } as { id?: string; threadId?: string; orgSlug?: string; brandSlug?: string },
  pathname: '/agent/new',
  searchParams: new URLSearchParams(),
};

const storeState = {
  activeThreadId: 'thread-existing' as string | null,
};

vi.mock('@genfeedai/auth-client/react', () => ({
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

vi.mock('@services/organization/users.service', () => ({
  UsersService: {
    getInstance: () => ({
      patchMe,
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

describe('AgentWorkspaceLayoutClient', () => {
  beforeEach(() => {
    navigationState.params = { orgSlug: 'acme-org', brandSlug: 'acme-creator' };
    navigationState.pathname = '/agent/new';
    navigationState.searchParams = new URLSearchParams();
    storeState.activeThreadId = 'thread-existing';
    routerReplace.mockReset();
    sendMessage.mockReset();
    sendMessage.mockResolvedValue(undefined);
    patchMe.mockReset();
    patchMe.mockResolvedValue(undefined);
    touchSession.mockReset();
  });

  it('does not immediately redirect /agent/new back to the previously active thread', async () => {
    render(
      <AgentWorkspaceLayoutClient>
        <div>child</div>
      </AgentWorkspaceLayoutClient>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(routerReplace).not.toHaveBeenCalled();
  });

  it('navigates to the newly created thread after /agent/new produces a different active thread id', async () => {
    const view = render(
      <AgentWorkspaceLayoutClient>
        <div>child</div>
      </AgentWorkspaceLayoutClient>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    storeState.activeThreadId = 'thread-new';

    view.rerender(
      <AgentWorkspaceLayoutClient>
        <div>child</div>
      </AgentWorkspaceLayoutClient>,
    );

    await waitFor(() => {
      expect(routerReplace).toHaveBeenCalledWith(
        '/acme-org/~/agent/thread-new',
      );
    });
  });

  it('recognizes org-scoped /agent/new routes when bootstrapping prefills', async () => {
    navigationState.pathname = '/org-123/~/agent/new';
    navigationState.searchParams = new URLSearchParams('prompt=hello');

    render(
      <AgentWorkspaceLayoutClient>
        <div>child</div>
      </AgentWorkspaceLayoutClient>,
    );

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith('hello', {
        forceNewThread: true,
        signal: expect.any(AbortSignal),
        source: 'agent',
      });
    });
  });

  it('navigates to the onboarding thread route after /agent/onboarding produces a different active thread id', async () => {
    navigationState.pathname = '/agent/onboarding';
    const view = render(
      <AgentWorkspaceLayoutClient>
        <div>child</div>
      </AgentWorkspaceLayoutClient>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    storeState.activeThreadId = 'thread-new';

    view.rerender(
      <AgentWorkspaceLayoutClient>
        <div>child</div>
      </AgentWorkspaceLayoutClient>,
    );

    await waitFor(() => {
      expect(routerReplace).toHaveBeenCalledWith(
        '/acme-org/~/agent/onboarding/thread-new',
      );
    });
  });

  it('boots a prefilled prompt only once per query string', async () => {
    navigationState.searchParams = new URLSearchParams('prompt=hello');
    const view = render(
      <AgentWorkspaceLayoutClient>
        <div>child</div>
      </AgentWorkspaceLayoutClient>,
    );

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith('hello', {
        forceNewThread: true,
        signal: expect.any(AbortSignal),
        source: 'agent',
      });
    });

    view.rerender(
      <AgentWorkspaceLayoutClient>
        <div>child</div>
      </AgentWorkspaceLayoutClient>,
    );

    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('boots onboarding prefills with onboarding source on the onboarding route', async () => {
    navigationState.pathname = '/agent/onboarding';
    navigationState.searchParams = new URLSearchParams(
      'prompt=help%20me%20define%20my%20brand%20voice',
    );

    render(
      <AgentWorkspaceLayoutClient>
        <div>child</div>
      </AgentWorkspaceLayoutClient>,
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

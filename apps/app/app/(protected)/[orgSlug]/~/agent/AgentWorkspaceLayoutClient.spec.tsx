import { act, render, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentWorkspaceLayoutClient } from './AgentWorkspaceLayoutClient';

const routerReplace = vi.fn();
const sendMessage = vi.fn();
const patchMe = vi.fn();
const touchSession = vi.fn();
const getToken = vi.fn();
const useAgentChatStreamSpy = vi.fn();
// Hoisted: the `@genfeedai/agent` factory reads `runAgentApiEffect` eagerly as a
// property value, so a plain `const` would still be in its temporal dead zone
// when the hoisted `vi.mock` runs.
const { getThreadsEffect, runAgentApiEffect } = vi.hoisted(() => ({
  getThreadsEffect: vi.fn(),
  runAgentApiEffect: vi.fn(),
}));

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

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    getToken,
    isLoaded: true,
  }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    selectedBrand: {
      id: 'brand-1',
      organization: { slug: 'acme-org' },
      slug: 'acme-creator',
    },
  }),
}));

vi.mock('@genfeedai/agent', () => ({
  AgentApiService: class AgentApiService {
    getThreadsEffect = getThreadsEffect;
  },
  runAgentApiEffect,
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
  useAgentChatStream: ({ apiService }: { apiService: unknown }) => {
    useAgentChatStreamSpy(apiService);
    return { sendMessage };
  },
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
    getToken.mockReset();
    getToken.mockResolvedValue('token');
    useAgentChatStreamSpy.mockClear();
    getThreadsEffect.mockReset();
    getThreadsEffect.mockReturnValue('threads-effect');
    runAgentApiEffect.mockReset();
    runAgentApiEffect.mockResolvedValue([]);
  });

  it('reuses a protected-shell agent service when one is provided', () => {
    const providedAgentApiService = {};

    render(
      <AgentWorkspaceLayoutClient
        agentApiService={providedAgentApiService as never}
      >
        <div>child</div>
      </AgentWorkspaceLayoutClient>,
    );

    expect(useAgentChatStreamSpy).toHaveBeenCalledWith(providedAgentApiService);
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
        '/acme-org/acme-creator/agent/thread-new',
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
        brandId: 'brand-1',
        forceNewThread: true,
        signal: expect.any(AbortSignal),
        source: 'agent',
      });
    });
  });

  it('turns workspace task query context into an Agent prefill', async () => {
    navigationState.pathname = '/org-123/~/agent/new';
    navigationState.searchParams = new URLSearchParams({
      taskExecutionPath: 'caption_generation',
      taskId: 'task-42',
      taskOutputType: 'newsletter',
      taskSource: 'workspace',
      taskTitle: 'Draft the weekly update',
    });

    render(
      <AgentWorkspaceLayoutClient>
        <div>child</div>
      </AgentWorkspaceLayoutClient>,
    );

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        'Continue the workspace task "Draft the weekly update". Task id: task-42. Requested output: newsletter. Execution path: caption_generation.',
        {
          brandId: 'brand-1',
          forceNewThread: true,
          signal: expect.any(AbortSignal),
          source: 'agent',
        },
      );
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
        '/acme-org/acme-creator/agent/onboarding/thread-new',
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
        brandId: 'brand-1',
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

  it('resumes the most recent onboarding thread when the entry route carries no prefill', async () => {
    navigationState.pathname = '/agent/onboarding';
    storeState.activeThreadId = null;
    runAgentApiEffect.mockResolvedValue([
      {
        id: 'thread-standard',
        source: 'agent',
        updatedAt: '2026-08-05T12:00:00.000Z',
      },
      {
        id: 'thread-onboarding-old',
        source: 'onboarding',
        updatedAt: '2026-08-01T09:00:00.000Z',
      },
      {
        id: 'thread-onboarding-latest',
        source: 'onboarding',
        updatedAt: '2026-08-04T18:00:00.000Z',
      },
    ]);

    render(
      <AgentWorkspaceLayoutClient>
        <div>child</div>
      </AgentWorkspaceLayoutClient>,
    );

    await waitFor(() => {
      expect(routerReplace).toHaveBeenCalledWith(
        '/acme-org/acme-creator/agent/onboarding/thread-onboarding-latest',
      );
    });
    expect(getThreadsEffect).toHaveBeenCalledWith(
      { source: 'onboarding', status: 'active' },
      expect.any(AbortSignal),
    );
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('resumes the newest onboarding thread even when 20 newer standard threads exist', async () => {
    navigationState.pathname = '/agent/onboarding';
    storeState.activeThreadId = null;
    // The API filters by source, so a caller that respected an unfiltered
    // 20-thread lookback would have dropped this thread entirely.
    const newerStandardThreads = Array.from({ length: 20 }, (_, index) => ({
      id: `thread-standard-${index}`,
      source: 'agent',
      updatedAt: `2026-08-${String(index + 10).padStart(2, '0')}T12:00:00.000Z`,
    }));
    runAgentApiEffect.mockResolvedValue([
      ...newerStandardThreads,
      {
        id: 'thread-onboarding-latest',
        source: 'onboarding',
        updatedAt: '2026-08-04T18:00:00.000Z',
      },
      {
        id: 'thread-onboarding-old',
        source: 'onboarding',
        updatedAt: '2026-08-01T09:00:00.000Z',
      },
    ]);

    render(
      <AgentWorkspaceLayoutClient>
        <div>child</div>
      </AgentWorkspaceLayoutClient>,
    );

    await waitFor(() => {
      expect(routerReplace).toHaveBeenCalledWith(
        '/acme-org/acme-creator/agent/onboarding/thread-onboarding-latest',
      );
    });
    expect(getThreadsEffect).toHaveBeenCalledWith(
      { source: 'onboarding', status: 'active' },
      expect.any(AbortSignal),
    );
  });

  it('does not cap the onboarding resume lookup to a page of threads', async () => {
    navigationState.pathname = '/agent/onboarding';
    storeState.activeThreadId = null;

    render(
      <AgentWorkspaceLayoutClient>
        <div>child</div>
      </AgentWorkspaceLayoutClient>,
    );

    await waitFor(() => {
      expect(getThreadsEffect).toHaveBeenCalled();
    });

    expect(getThreadsEffect.mock.calls[0]?.[0]).not.toHaveProperty('limit');
  });

  it('leaves a first-time operator on the onboarding entry route when no thread exists', async () => {
    navigationState.pathname = '/agent/onboarding';
    storeState.activeThreadId = null;

    render(
      <AgentWorkspaceLayoutClient>
        <div>child</div>
      </AgentWorkspaceLayoutClient>,
    );

    await waitFor(() => {
      expect(runAgentApiEffect).toHaveBeenCalled();
    });

    expect(routerReplace).not.toHaveBeenCalled();
  });

  it('does not look up a thread to resume when a prefill prompt is bootstrapping one', async () => {
    navigationState.pathname = '/agent/onboarding';
    navigationState.searchParams = new URLSearchParams('prompt=hello');
    storeState.activeThreadId = null;

    render(
      <AgentWorkspaceLayoutClient>
        <div>child</div>
      </AgentWorkspaceLayoutClient>,
    );

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalled();
    });

    expect(runAgentApiEffect).not.toHaveBeenCalled();
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
          brandId: 'brand-1',
          forceNewThread: true,
          signal: expect.any(AbortSignal),
          source: 'onboarding',
        },
      );
    });
  });
});

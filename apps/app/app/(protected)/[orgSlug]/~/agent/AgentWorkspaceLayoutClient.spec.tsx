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
// Hoisted: the `@genfeedai/agent` factory reads `getThreads` eagerly as a
// property value, so a plain `const` would still be in its temporal dead zone
// when the hoisted `vi.mock` runs.
const { getThreads } = vi.hoisted(() => ({
  getThreads: vi.fn(),
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
  threads: [] as Array<{
    brandId?: string | null;
    id: string;
    organizationId?: string;
    status?: string;
  }>,
};

type MockBrand = {
  id: string;
  organization: { id?: string; slug: string };
  slug: string;
};

const AUTHORIZED_BRANDS: MockBrand[] = [
  {
    id: 'brand-1',
    organization: { id: 'org-1', slug: 'acme-org' },
    slug: 'acme-creator',
  },
  {
    id: 'brand-2',
    organization: { id: 'org-1', slug: 'acme-org' },
    slug: 'second-brand',
  },
];

const brandState = {
  brandId: 'brand-1',
  brands: AUTHORIZED_BRANDS,
  isBrandScopeResolved: true,
  organizationId: 'org-1',
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
    brandId: brandState.brandId,
    brands: brandState.brands,
    isBrandScopeResolved: brandState.isBrandScopeResolved,
    organizationId: brandState.organizationId,
    selectedBrand: {
      id: 'brand-1',
      organization: { slug: 'acme-org' },
      slug: 'acme-creator',
    },
  }),
}));

vi.mock('@genfeedai/agent', () => ({
  AgentApiService: class AgentApiService {
    getThreads = getThreads;
  },
  AgentApiServiceProvider: ({ children }: PropsWithChildren) => <>{children}</>,
  isRenderableThreadId: (id: string) =>
    Boolean(id && id !== 'undefined' && id !== 'null'),
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
    storeState.threads = [];
    brandState.brandId = 'brand-1';
    brandState.brands = AUTHORIZED_BRANDS;
    brandState.isBrandScopeResolved = true;
    brandState.organizationId = 'org-1';
    routerReplace.mockReset();
    sendMessage.mockReset();
    sendMessage.mockResolvedValue(undefined);
    patchMe.mockReset();
    patchMe.mockResolvedValue(undefined);
    touchSession.mockReset();
    getToken.mockReset();
    getToken.mockResolvedValue('token');
    useAgentChatStreamSpy.mockClear();
    getThreads.mockReset();
    getThreads.mockResolvedValue([]);
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
    expect(getThreads).not.toHaveBeenCalled();
  });

  it('redirects a deep-linked thread to the brand that owns it', async () => {
    navigationState.pathname = '/agent/thread-on-other-brand';
    storeState.activeThreadId = 'thread-on-other-brand';
    storeState.threads = [
      {
        brandId: 'brand-2',
        id: 'thread-on-other-brand',
        organizationId: 'org-1',
        status: 'archived',
      },
    ];

    render(
      <AgentWorkspaceLayoutClient>
        <div>child</div>
      </AgentWorkspaceLayoutClient>,
    );

    await waitFor(() => {
      expect(routerReplace).toHaveBeenCalledWith(
        '/acme-org/second-brand/agent/thread-on-other-brand',
      );
    });
  });

  it('does not redirect when the open thread already matches the route brand', async () => {
    navigationState.pathname = '/agent/thread-same-brand';
    storeState.activeThreadId = 'thread-same-brand';
    storeState.threads = [
      {
        brandId: 'brand-1',
        id: 'thread-same-brand',
        organizationId: 'org-1',
        status: 'active',
      },
    ];

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

  it('restores the most recent active thread authorized for the route organization', async () => {
    navigationState.pathname = '/agent';
    storeState.activeThreadId = null;
    getThreads.mockResolvedValue([
      {
        brandId: 'deleted-brand',
        id: 'stale-brand-thread',
        organizationId: 'org-1',
        status: 'active',
        updatedAt: '2026-08-09T12:00:00.000Z',
      },
      {
        brandId: 'brand-2',
        id: 'other-org-thread',
        organizationId: 'org-2',
        status: 'active',
        updatedAt: '2026-08-08T12:00:00.000Z',
      },
      {
        brandId: 'brand-1',
        id: 'latest-authorized-thread',
        organizationId: 'org-1',
        status: 'active',
        updatedAt: '2026-08-07T12:00:00.000Z',
      },
      {
        brandId: null,
        id: 'older-authorized-thread',
        organizationId: 'org-1',
        status: 'active',
        updatedAt: '2026-08-06T12:00:00.000Z',
      },
    ]);

    render(
      <AgentWorkspaceLayoutClient>
        <div>child</div>
      </AgentWorkspaceLayoutClient>,
    );

    await waitFor(() => {
      expect(routerReplace).toHaveBeenCalledWith(
        '/acme-org/acme-creator/agent/latest-authorized-thread',
      );
    });
    expect(getThreads).toHaveBeenCalledWith(
      { status: 'active' },
      expect.any(AbortSignal),
    );
  });

  it('falls back by replacement to a new org conversation when none is authorized', async () => {
    navigationState.pathname = '/agent';
    storeState.activeThreadId = null;
    getThreads.mockResolvedValue([
      {
        brandId: 'brand-2',
        id: 'other-org-thread',
        organizationId: 'org-2',
        status: 'active',
        updatedAt: '2026-08-08T12:00:00.000Z',
      },
    ]);

    render(
      <AgentWorkspaceLayoutClient>
        <div>child</div>
      </AgentWorkspaceLayoutClient>,
    );

    await waitFor(() => {
      expect(routerReplace).toHaveBeenCalledWith('/acme-org/~/agent/new');
    });
  });

  it('defers the returning bootstrap decision until brand scope resolves', async () => {
    navigationState.pathname = '/agent';
    storeState.activeThreadId = null;
    brandState.brands = [];
    brandState.isBrandScopeResolved = false;
    getThreads.mockResolvedValue([
      {
        brandId: 'brand-1',
        id: 'branded-thread',
        organizationId: 'org-1',
        status: 'active',
        updatedAt: '2026-08-09T12:00:00.000Z',
      },
    ]);

    const view = render(
      <AgentWorkspaceLayoutClient>
        <div>child</div>
      </AgentWorkspaceLayoutClient>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(getThreads).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();

    brandState.brands = AUTHORIZED_BRANDS;
    brandState.isBrandScopeResolved = true;

    view.rerender(
      <AgentWorkspaceLayoutClient>
        <div>child</div>
      </AgentWorkspaceLayoutClient>,
    );

    await waitFor(() => {
      expect(routerReplace).toHaveBeenCalledWith(
        '/acme-org/acme-creator/agent/branded-thread',
      );
    });
  });

  it('still falls back to a new conversation when resolved brands exclude the thread brand', async () => {
    navigationState.pathname = '/agent';
    storeState.activeThreadId = null;
    brandState.brands = AUTHORIZED_BRANDS.filter(
      (brand) => brand.id === 'brand-2',
    );
    getThreads.mockResolvedValue([
      {
        brandId: 'brand-1',
        id: 'foreign-brand-thread',
        organizationId: 'org-1',
        status: 'active',
        updatedAt: '2026-08-09T12:00:00.000Z',
      },
    ]);

    render(
      <AgentWorkspaceLayoutClient>
        <div>child</div>
      </AgentWorkspaceLayoutClient>,
    );

    await waitFor(() => {
      expect(routerReplace).toHaveBeenCalledWith('/acme-org/~/agent/new');
    });
  });

  it('releases the one-shot bootstrap guard when brand scope becomes unresolved (#2702)', async () => {
    navigationState.pathname = '/agent';
    storeState.activeThreadId = null;
    brandState.brands = AUTHORIZED_BRANDS;
    brandState.isBrandScopeResolved = true;
    getThreads.mockResolvedValue([
      {
        brandId: 'brand-1',
        id: 'branded-thread',
        organizationId: 'org-1',
        status: 'active',
        updatedAt: '2026-08-09T12:00:00.000Z',
      },
    ]);

    const view = render(
      <AgentWorkspaceLayoutClient>
        <div>child</div>
      </AgentWorkspaceLayoutClient>,
    );

    await waitFor(() => {
      expect(routerReplace).toHaveBeenCalledWith(
        '/acme-org/acme-creator/agent/branded-thread',
      );
    });

    const callsAfterFirst = getThreads.mock.calls.length;
    routerReplace.mockClear();

    // Org switch / session change: brand scope drops; guard must release so a
    // later resolve can restore a legitimate branded thread again.
    brandState.isBrandScopeResolved = false;
    brandState.brands = [];
    view.rerender(
      <AgentWorkspaceLayoutClient>
        <div>child</div>
      </AgentWorkspaceLayoutClient>,
    );

    brandState.brands = AUTHORIZED_BRANDS;
    brandState.isBrandScopeResolved = true;
    view.rerender(
      <AgentWorkspaceLayoutClient>
        <div>child</div>
      </AgentWorkspaceLayoutClient>,
    );

    await waitFor(() => {
      expect(getThreads.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    });
  });

  it('looks the returning thread up once while brand scope stays resolved', async () => {
    navigationState.pathname = '/agent';
    storeState.activeThreadId = null;
    getThreads.mockResolvedValue([
      {
        brandId: 'brand-1',
        id: 'branded-thread',
        organizationId: 'org-1',
        status: 'active',
        updatedAt: '2026-08-09T12:00:00.000Z',
      },
    ]);

    const view = render(
      <AgentWorkspaceLayoutClient>
        <div>child</div>
      </AgentWorkspaceLayoutClient>,
    );

    await waitFor(() => {
      expect(getThreads).toHaveBeenCalledTimes(1);
    });

    view.rerender(
      <AgentWorkspaceLayoutClient>
        <div>child</div>
      </AgentWorkspaceLayoutClient>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(getThreads).toHaveBeenCalledTimes(1);
  });

  it('preserves explicit thread routes without running returning-user bootstrap', async () => {
    navigationState.pathname = '/agent/explicit-thread';
    navigationState.params.id = 'explicit-thread';
    storeState.activeThreadId = null;

    render(
      <AgentWorkspaceLayoutClient>
        <div>child</div>
      </AgentWorkspaceLayoutClient>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(getThreads).not.toHaveBeenCalled();
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
    getThreads.mockResolvedValue([
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
    expect(getThreads).toHaveBeenCalledWith(
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
    getThreads.mockResolvedValue([
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
    expect(getThreads).toHaveBeenCalledWith(
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
      expect(getThreads).toHaveBeenCalled();
    });

    expect(getThreads.mock.calls[0]?.[0]).not.toHaveProperty('limit');
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
      expect(getThreads).toHaveBeenCalled();
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

    expect(getThreads).not.toHaveBeenCalled();
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

import type { DesktopRuntimeSnapshot } from '@genfeedai/services/core/desktop-runtime.service';
import { useTopbarBalances } from '@hooks/data/billing/use-topbar-balances/use-topbar-balances';
import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  apiEndpoint: 'https://server-a.example/v1',
  isAuthLoaded: true,
  isSignedIn: true,
  organizationId: 'org-1',
  orgId: 'org-1' as string | null,
  confirmedOrganizationId: 'org-1' as string | null,
  isRouteConfirmed: true,
  sessionId: 'session-1',
  userId: 'user-1',
  desktop: false,
  runtime: { status: 'web', context: null } as DesktopRuntimeSnapshot,
  getBalances: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: state.organizationId }),
}));
vi.mock('@contexts/user/organization-context/organization-context', () => ({
  useRoutedOrganization: () => ({
    confirmedOrganizationId: state.confirmedOrganizationId,
    isRouteConfirmed: state.isRouteConfirmed,
  }),
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    isLoaded: state.isAuthLoaded,
    isSignedIn: state.isSignedIn,
    orgId: state.orgId,
    sessionId: state.sessionId,
    userId: state.userId,
  }),
}));
vi.mock(
  '@hooks/ui/use-desktop-runtime-context/use-desktop-runtime-context',
  () => ({
    useDesktopRuntimeContext: () =>
      state.desktop && state.runtime.status === 'web'
        ? { status: 'unavailable', context: null }
        : state.runtime,
  }),
);
vi.mock(
  '@genfeedai/services/core/desktop-runtime.service',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@genfeedai/services/core/desktop-runtime.service')
    >()),
    desktopRuntimeService: {
      getCurrentSnapshot: () =>
        state.desktop && state.runtime.status === 'web'
          ? { status: 'unavailable', context: null }
          : state.runtime,
    },
  }),
);
vi.mock('@genfeedai/services/core/environment.service', () => ({
  EnvironmentService: {
    get apiEndpoint() {
      return state.apiEndpoint;
    },
  },
}));
vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { warn: vi.fn() },
}));
vi.mock('@genfeedai/services/billing/credits.service', () => ({
  CreditsService: class {
    getTopbarBalances = state.getBalances;
  },
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('test-token'),
}));

const wallet = (balance: number | null) => ({
  segments: [{ provider: 'genfeed', balance }],
});

describe('shared wallet scope', () => {
  beforeEach(() => {
    Object.assign(state, {
      apiEndpoint: 'https://server-a.example/v1',
      isAuthLoaded: true,
      isSignedIn: true,
      organizationId: 'org-1',
      orgId: 'org-1',
      confirmedOrganizationId: 'org-1',
      isRouteConfirmed: true,
      sessionId: 'session-1',
      userId: 'user-1',
      desktop: false,
      runtime: { status: 'web', context: null },
    });
    state.getBalances.mockReset().mockResolvedValue(wallet(17));
  });

  it('isolates selected desktop profiles on the same proxy and rejects old socket callbacks', async () => {
    state.desktop = true;
    const context = {
      version: 1 as const,
      runtimeId: 'launch',
      revision: 0,
      status: 'ready' as const,
      selectedServerId: 'cloud-a',
      selectedServerKind: 'cloud' as const,
      selectedApiEndpoint: 'https://a.example/v1',
      runtimeMode: 'cloud' as const,
      generationExecution: 'remote' as const,
      localProvider: null,
    };
    state.runtime = { status: 'ready', context };
    const { result, rerender } = renderHook(() => useTopbarBalances(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.genfeedBalance).toBe(17));
    const oldPublisher = result.current.publishGenfeedBalance;
    state.runtime = {
      status: 'switching',
      context: { ...context, revision: 1, status: 'switching' },
    };
    act(() => oldPublisher(999));
    rerender();
    expect(result.current.genfeedBalance).toBeNull();
    await act(async () => result.current.refresh());
    expect(state.getBalances).toHaveBeenCalledTimes(1);
    state.getBalances.mockResolvedValue(wallet(28));
    state.runtime = {
      status: 'ready',
      context: {
        ...context,
        revision: 2,
        selectedServerId: 'cloud-b',
        selectedApiEndpoint: 'https://b.example/v1',
      },
    };
    rerender();
    await waitFor(() => expect(result.current.genfeedBalance).toBe(28));
    act(() => oldPublisher(999));
    expect(result.current.genfeedBalance).toBe(28);
  });

  it.each(['local', 'self-hosted', 'unknown'] as const)(
    'never requests a desktop wallet for %s execution',
    async (mode) => {
      state.desktop = true;
      state.runtime = {
        status: 'ready',
        context: {
          version: 1,
          runtimeId: 'launch',
          revision: 0,
          status: 'ready',
          selectedServerId: 'selected',
          selectedServerKind: mode === 'self-hosted' ? 'self-hosted' : 'cloud',
          selectedApiEndpoint: 'https://selected.example/v1',
          runtimeMode: mode === 'local' ? 'local' : 'cloud',
          generationExecution: mode === 'unknown' ? 'unknown' : 'remote',
          localProvider: null,
        },
      };
      if (mode === 'unknown')
        state.runtime = { status: 'unavailable', context: null };
      const { result } = renderHook(() => useTopbarBalances(), {
        wrapper: createQueryWrapper(),
      });
      await act(async () => result.current.refresh());
      expect(state.getBalances).not.toHaveBeenCalled();
      expect(result.current.genfeedBalance).toBeNull();
    },
  );

  it('waits for the verified routed organization and ignores refresh while disabled', async () => {
    state.isAuthLoaded = false;
    const { result, rerender } = renderHook(() => useTopbarBalances(), {
      wrapper: createQueryWrapper(),
    });
    await act(async () => {
      await result.current.refresh();
      window.dispatchEvent(new Event('genfeed:topbar-balances:refresh'));
    });
    expect(state.getBalances).not.toHaveBeenCalled();
    state.isAuthLoaded = true;
    state.confirmedOrganizationId = 'old-org';
    rerender();
    expect(state.getBalances).not.toHaveBeenCalled();
    state.confirmedOrganizationId = 'org-1';
    rerender();
    await waitFor(() => expect(result.current.genfeedBalance).toBe(17));
  });

  it.each([null, 'old-org'])(
    'loads the verified organization wallet when auth organization is %s',
    async (orgId) => {
      state.orgId = orgId;
      const { result } = renderHook(() => useTopbarBalances(), {
        wrapper: createQueryWrapper(),
      });
      await waitFor(() => expect(result.current.genfeedBalance).toBe(17));
      expect(state.getBalances).toHaveBeenCalledTimes(1);
    },
  );

  it('hides cached balances and blocks refresh and socket updates while the route is unconfirmed', async () => {
    const { result, rerender } = renderHook(() => useTopbarBalances(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.genfeedBalance).toBe(17));
    state.isRouteConfirmed = false;
    rerender();
    await act(async () => {
      result.current.publishGenfeedBalance(999);
      await result.current.refresh();
      window.dispatchEvent(new Event('genfeed:topbar-balances:refresh'));
    });
    expect(result.current.genfeedBalance).toBeNull();
    expect(result.current.isLoaded).toBe(false);
    expect(state.getBalances).toHaveBeenCalledTimes(1);
  });

  it('hides cached values immediately after sign-out and refuses socket publication', async () => {
    const { result, rerender } = renderHook(() => useTopbarBalances(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.genfeedBalance).toBe(17));
    state.isSignedIn = false;
    rerender();
    act(() => result.current.publishGenfeedBalance(999));
    expect(result.current.genfeedBalance).toBeNull();
    expect(result.current.isLoaded).toBe(false);
    expect(result.current.segments).toEqual([]);
  });

  it.each(['server', 'session', 'user', 'organization'] as const)(
    'does not reuse the previous wallet after a %s switch',
    async (scope) => {
      const { result, rerender } = renderHook(() => useTopbarBalances(), {
        wrapper: createQueryWrapper(),
      });
      await waitFor(() => expect(result.current.genfeedBalance).toBe(17));
      let resolveWallet!: (value: ReturnType<typeof wallet>) => void;
      state.getBalances.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveWallet = resolve;
          }),
      );
      if (scope === 'server') state.apiEndpoint = 'https://server-b.example/v1';
      if (scope === 'session') state.sessionId = 'session-2';
      if (scope === 'user') state.userId = 'user-2';
      if (scope === 'organization') {
        state.organizationId = 'org-2';
        state.confirmedOrganizationId = 'org-2';
      }
      rerender();
      expect(result.current.genfeedBalance).toBeNull();
      await waitFor(() => expect(state.getBalances).toHaveBeenCalledTimes(2));
      await act(async () => resolveWallet(wallet(28)));
      await waitFor(() => expect(result.current.genfeedBalance).toBe(28));
    },
  );

  it.each([null, Infinity, NaN])(
    'keeps an invalid API balance %s unknown',
    async (balance) => {
      state.getBalances.mockResolvedValue(wallet(balance));
      const { result } = renderHook(() => useTopbarBalances(), {
        wrapper: createQueryWrapper(),
      });
      await waitFor(() => expect(result.current.isLoaded).toBe(true));
      expect(result.current.genfeedBalance).toBeNull();
      expect(result.current.segments).toEqual([]);
    },
  );

  it('shows unknown on refresh error instead of a stale wallet', async () => {
    const { result } = renderHook(() => useTopbarBalances(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.genfeedBalance).toBe(17));
    state.getBalances.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      await result.current.refresh();
    });
    await waitFor(() => expect(result.current.genfeedBalance).toBeNull());
    expect(result.current.isLoaded).toBe(false);
  });

  it('does not let a late old-server response overwrite the new wallet', async () => {
    let resolveOld!: (value: ReturnType<typeof wallet>) => void;
    state.getBalances.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    const { result, rerender } = renderHook(() => useTopbarBalances(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(state.getBalances).toHaveBeenCalledTimes(1));
    state.apiEndpoint = 'https://server-b.example/v1';
    state.getBalances.mockResolvedValue(wallet(28));
    rerender();
    await waitFor(() => expect(result.current.genfeedBalance).toBe(28));
    await act(async () => resolveOld(wallet(999)));
    expect(result.current.genfeedBalance).toBe(28);
  });

  it('does not expose a wallet for unknown desktop context', async () => {
    state.desktop = true;
    const { result } = renderHook(() => useTopbarBalances(), {
      wrapper: createQueryWrapper(),
    });
    await act(async () => {
      await result.current.refresh();
    });
    expect(state.getBalances).not.toHaveBeenCalled();
    expect(result.current.genfeedBalance).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});

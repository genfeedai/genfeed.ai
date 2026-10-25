import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import CreditsLiveSync from '@ui/topbars/credits-bar/CreditsLiveSync';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopRuntimeSnapshot } from '@genfeedai/services/core/desktop-runtime.service';

const runtimeMocks = vi.hoisted(() => ({
  snapshot: { status: 'web', context: null } as DesktopRuntimeSnapshot,
  subscription: vi.fn(),
}));
vi.mock(
  '@genfeedai/hooks/ui/use-desktop-runtime-context/use-desktop-runtime-context',
  () => ({ useDesktopRuntimeContext: () => runtimeMocks.snapshot }),
);
vi.mock(
  '@genfeedai/services/core/desktop-runtime.service',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@genfeedai/services/core/desktop-runtime.service')
    >()),
    desktopRuntimeService: { getCurrentSnapshot: () => runtimeMocks.snapshot },
  }),
);

const {
  mockGetCreditsService,
  mockGetTopbarBalances,
  mockRefreshCreditsBreakdown,
  mockSubscribe,
  mockUnsubscribe,
  socketState,
} = vi.hoisted(() => ({
  mockGetCreditsService: vi.fn(),
  mockGetTopbarBalances: vi.fn(),
  mockRefreshCreditsBreakdown: vi.fn(),
  mockSubscribe: vi.fn(),
  mockUnsubscribe: vi.fn(),
  socketState: { isReady: true },
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: 'org_1' }),
}));
vi.mock(
  '@genfeedai/contexts/user/organization-context/organization-context',
  () => ({
    useRoutedOrganization: () => ({
      confirmedOrganizationId: 'org_1',
      isRouteConfirmed: true,
    }),
  }),
);
vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    isLoaded: true,
    isSignedIn: true,
    orgId: 'org_1',
    sessionId: 'session_1',
    userId: 'user_1',
  }),
}));
vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mockGetCreditsService,
}));
vi.mock(
  '@genfeedai/hooks/data/subscription/use-subscription/use-subscription',
  () => ({
    useSubscription: () => {
      runtimeMocks.subscription();
      return {
        creditsBreakdown: null,
        refreshCreditsBreakdown: mockRefreshCreditsBreakdown,
      };
    },
  }),
);
vi.mock('@genfeedai/hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({
    isReady: socketState.isReady,
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
  }),
}));
vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

function balanceResponse(balance: number) {
  return {
    generatedAt: '2026-06-17T00:00:00.000Z',
    segments: [
      {
        balance,
        currencyOrUnit: 'credits',
        label: 'Genfeed',
        lastSyncedAt: '2026-06-17T00:00:00.000Z',
        provider: 'genfeed',
        status: 'available',
      },
    ],
  };
}

function renderSync() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false } },
  });
  const tree = (
    <QueryClientProvider client={queryClient}>
      <CreditsLiveSync />
    </QueryClientProvider>
  );
  const utils = render(tree);
  return { ...utils, rerender: () => utils.rerender(tree) };
}

describe('CreditsLiveSync', () => {
  beforeEach(() => {
    runtimeMocks.snapshot = { status: 'web', context: null };
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY;
    delete process.env.NEXT_PUBLIC_DESKTOP_SHELL;
    process.env.NEXT_PUBLIC_GENFEED_CLOUD = 'true';
    mockGetCreditsService.mockResolvedValue({
      getTopbarBalances: mockGetTopbarBalances,
    });
    mockGetTopbarBalances.mockResolvedValue(balanceResponse(42));
    socketState.isReady = true;
  });

  it('renders nothing', async () => {
    const { container } = renderSync();
    await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('subscribes to live balance events only once the socket is ready', async () => {
    socketState.isReady = false;
    const { rerender } = renderSync();

    await waitFor(() => expect(mockGetTopbarBalances).toHaveBeenCalled());
    // Before the socket manager exists, subscribe() is a silent no-op, so
    // the sync would never receive live balance updates. It must wait.
    expect(mockSubscribe).not.toHaveBeenCalled();

    socketState.isReady = true;
    rerender();

    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalledWith(
        '/credits/org_1',
        expect.any(Function),
      );
    });
    expect(mockSubscribe).toHaveBeenCalledWith(
      '/organizations/org_1',
      expect.any(Function),
    );
  });

  it('reconciles invalid socket balances without publishing a false zero', async () => {
    renderSync();
    await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());
    await waitFor(() => expect(mockGetTopbarBalances).toHaveBeenCalledTimes(1));

    const handler = mockSubscribe.mock.calls.find(
      ([topic]) => topic === '/credits/org_1',
    )?.[1];
    act(() => handler({ balance: Number.NaN }));

    await waitFor(() => expect(mockGetTopbarBalances).toHaveBeenCalledTimes(2));
    expect(mockRefreshCreditsBreakdown).toHaveBeenCalled();
  });

  it('does not mount the web plan cache for the cloud desktop runtime', async () => {
    runtimeMocks.snapshot = {
      status: 'ready',
      context: {
        version: 1,
        runtimeId: 'launch',
        revision: 0,
        status: 'ready',
        selectedServerId: 'cloud',
        selectedServerKind: 'cloud',
        selectedApiEndpoint: 'https://api.genfeed.ai/v1',
        runtimeMode: 'cloud',
        generationExecution: 'remote',
        localProvider: null,
      },
    };
    renderSync();

    await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());
    expect(runtimeMocks.subscription).not.toHaveBeenCalled();
  });

  it('stays idle on the desktop BYOK-only shell', async () => {
    process.env.NEXT_PUBLIC_DESKTOP_SHELL = 'true';

    renderSync();

    await waitFor(() => {
      expect(mockGetTopbarBalances).not.toHaveBeenCalled();
    });
    expect(mockSubscribe).not.toHaveBeenCalled();
  });
});

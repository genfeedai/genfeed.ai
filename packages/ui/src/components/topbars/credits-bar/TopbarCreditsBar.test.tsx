import { act, render, screen, waitFor } from '@testing-library/react';
import TopbarCreditsBar from '@ui/topbars/credits-bar/TopbarCreditsBar';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetCreditsService,
  mockGetTopbarBalances,
  mockLoggerError,
  mockLoggerWarn,
  mockRefreshCreditsBreakdown,
  mockSubscribe,
  mockUnsubscribe,
  socketState,
} = vi.hoisted(() => ({
  mockGetCreditsService: vi.fn(),
  mockGetTopbarBalances: vi.fn(),
  mockLoggerError: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockRefreshCreditsBreakdown: vi.fn(),
  mockSubscribe: vi.fn(),
  mockUnsubscribe: vi.fn(),
  socketState: { isReady: true },
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: 'org_1' }),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mockGetCreditsService,
}));

vi.mock(
  '@genfeedai/hooks/data/subscription/use-subscription/use-subscription',
  () => ({
    useSubscription: () => ({
      creditsBreakdown: null,
      refreshCreditsBreakdown: mockRefreshCreditsBreakdown,
    }),
  }),
);

vi.mock('@genfeedai/hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ orgHref: (path: string) => `/genfeed${path}` }),
}));

vi.mock('@genfeedai/hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({
    isReady: socketState.isReady,
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
  }),
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    error: mockLoggerError,
    warn: mockLoggerWarn,
  },
}));

vi.mock('./CreditsBarTrigger', () => ({
  default: ({
    balance,
    billingHref,
    fullBalance,
    isLoading,
    planLimit,
    planUsagePercent,
  }: {
    balance: number | null;
    billingHref: string;
    fullBalance: string;
    isLoading?: boolean;
    planLimit: number;
    planUsagePercent: number;
  }) => (
    <div
      data-testid="credits-trigger"
      data-loading={isLoading ? 'true' : 'false'}
      data-plan-limit={planLimit}
      data-plan-usage={planUsagePercent}
    >
      <span data-testid="credits-balance">{fullBalance}</span>
      <span data-testid="credits-numeric">{balance ?? 'unknown'}</span>
      <a href={billingHref} data-testid="credits-link">
        top-up
      </a>
    </div>
  ),
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

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

describe('TopbarCreditsBar', () => {
  beforeEach(() => {
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

  it('subscribes to live balance events only once the socket is ready', async () => {
    socketState.isReady = false;
    const { rerender } = render(<TopbarCreditsBar />);

    await waitFor(() => {
      expect(screen.getByTestId('credits-balance')).toHaveTextContent('42');
    });
    // Before the socket manager exists, subscribe() is a silent no-op — the
    // bar would never receive live balance updates. It must wait instead.
    expect(mockSubscribe).not.toHaveBeenCalled();

    socketState.isReady = true;
    rerender(<TopbarCreditsBar />);

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

  it('loads topbar balances without logging an error', async () => {
    render(<TopbarCreditsBar />);

    await waitFor(() => {
      expect(screen.getByTestId('credits-balance')).toHaveTextContent('42');
    });

    expect(screen.getByTestId('credits-trigger')).toHaveAttribute(
      'data-loading',
      'false',
    );
    expect(screen.getByTestId('credits-link')).toHaveAttribute(
      'href',
      '/genfeed/settings/credits',
    );
    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it('does not treat the pre-fetch state as a loaded zero balance', () => {
    mockGetTopbarBalances.mockImplementation(
      () => new Promise(() => undefined),
    );

    render(<TopbarCreditsBar />);

    expect(screen.getByTestId('credits-trigger')).toHaveAttribute(
      'data-loading',
      'true',
    );
    expect(screen.getByTestId('credits-balance')).toHaveTextContent('—');
  });

  it('renders nothing on desktop BYOK-only shell', async () => {
    process.env.NEXT_PUBLIC_DESKTOP_SHELL = 'true';
    process.env.NEXT_PUBLIC_GENFEED_CLOUD = 'true';

    const { container } = render(<TopbarCreditsBar />);

    await waitFor(() => {
      expect(mockGetTopbarBalances).not.toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('coerces non-finite genfeed balance (OSS Infinity → JSON null) to 0', async () => {
    mockGetTopbarBalances.mockResolvedValue({
      generatedAt: '2026-06-17T00:00:00.000Z',
      segments: [
        {
          balance: null,
          currencyOrUnit: 'credits',
          label: 'Genfeed',
          lastSyncedAt: '2026-06-17T00:00:00.000Z',
          provider: 'genfeed',
          status: 'available',
        },
      ],
    });

    render(<TopbarCreditsBar />);

    await waitFor(() => {
      expect(screen.getByTestId('credits-numeric')).toHaveTextContent('0');
      expect(screen.getByTestId('credits-balance')).toHaveTextContent('0');
    });
  });

  it('links to credits for top-up when EE billing is enabled', async () => {
    process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY = 'test-license';

    render(<TopbarCreditsBar />);

    await waitFor(() => {
      expect(screen.getByTestId('credits-balance')).toHaveTextContent('42');
    });

    expect(screen.getByTestId('credits-link')).toHaveAttribute(
      'href',
      '/genfeed/settings/credits',
    );
  });

  it('treats balance timeouts as non-critical topbar warnings', async () => {
    const timeoutError = new Error('Request timed out') as Error & {
      isTimeout: boolean;
    };
    timeoutError.isTimeout = true;
    mockGetTopbarBalances.mockRejectedValue(timeoutError);

    render(<TopbarCreditsBar />);

    await waitFor(() => {
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'TopbarCreditsBar: failed to fetch balances',
        {
          error: timeoutError,
          reportToSentry: false,
        },
      );
    });

    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(screen.getByTestId('credits-trigger')).toHaveAttribute(
      'data-loading',
      'false',
    );
    expect(screen.getByTestId('credits-balance')).toHaveTextContent('—');
    expect(screen.getByTestId('credits-numeric')).toHaveTextContent('unknown');
    expect(screen.getByTestId('credits-trigger')).toHaveAttribute(
      'data-plan-usage',
      '0',
    );
  });

  it('returns to loading on retry and renders the recovered balance', async () => {
    const retry = createDeferred<ReturnType<typeof balanceResponse>>();
    mockGetTopbarBalances
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockImplementationOnce(() => retry.promise);

    render(<TopbarCreditsBar />);

    await waitFor(() => {
      expect(screen.getByTestId('credits-numeric')).toHaveTextContent(
        'unknown',
      );
      expect(screen.getByTestId('credits-trigger')).toHaveAttribute(
        'data-loading',
        'false',
      );
    });

    act(() => {
      window.dispatchEvent(new Event('genfeed:topbar-balances:refresh'));
    });

    await waitFor(() => {
      expect(mockGetTopbarBalances).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('credits-trigger')).toHaveAttribute(
        'data-loading',
        'true',
      );
    });

    await act(async () => {
      retry.resolve(balanceResponse(88));
      await retry.promise;
    });

    await waitFor(() => {
      expect(screen.getByTestId('credits-balance')).toHaveTextContent('88');
      expect(screen.getByTestId('credits-trigger')).toHaveAttribute(
        'data-loading',
        'false',
      );
    });
  });

  it('does not let an older request publish data or clear a newer loading state', async () => {
    const older = createDeferred<ReturnType<typeof balanceResponse>>();
    const newer = createDeferred<ReturnType<typeof balanceResponse>>();
    mockGetTopbarBalances
      .mockImplementationOnce(() => older.promise)
      .mockImplementationOnce(() => newer.promise);

    render(<TopbarCreditsBar />);

    await waitFor(() => {
      expect(mockGetTopbarBalances).toHaveBeenCalledTimes(1);
    });

    act(() => {
      window.dispatchEvent(new Event('genfeed:topbar-balances:refresh'));
    });

    await waitFor(() => {
      expect(mockGetTopbarBalances).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      older.resolve(balanceResponse(7));
      await older.promise;
    });

    expect(screen.getByTestId('credits-numeric')).toHaveTextContent('unknown');
    expect(screen.getByTestId('credits-trigger')).toHaveAttribute(
      'data-loading',
      'true',
    );

    await act(async () => {
      newer.resolve(balanceResponse(84));
      await newer.promise;
    });

    await waitFor(() => {
      expect(screen.getByTestId('credits-balance')).toHaveTextContent('84');
      expect(screen.getByTestId('credits-trigger')).toHaveAttribute(
        'data-loading',
        'false',
      );
    });
  });

  it('does not let an older request overwrite a newer response', async () => {
    const older = createDeferred<ReturnType<typeof balanceResponse>>();
    const newer = createDeferred<ReturnType<typeof balanceResponse>>();
    mockGetTopbarBalances
      .mockImplementationOnce(() => older.promise)
      .mockImplementationOnce(() => newer.promise);

    render(<TopbarCreditsBar />);

    await waitFor(() => {
      expect(mockGetTopbarBalances).toHaveBeenCalledTimes(1);
    });
    act(() => {
      window.dispatchEvent(new Event('genfeed:topbar-balances:refresh'));
    });
    await waitFor(() => {
      expect(mockGetTopbarBalances).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      newer.resolve(balanceResponse(96));
      await newer.promise;
    });
    await waitFor(() => {
      expect(screen.getByTestId('credits-balance')).toHaveTextContent('96');
    });

    await act(async () => {
      older.resolve(balanceResponse(3));
      await older.promise;
    });

    expect(screen.getByTestId('credits-balance')).toHaveTextContent('96');
  });

  it('keeps a real zero balance distinct from an unavailable balance', async () => {
    mockGetTopbarBalances.mockResolvedValue(balanceResponse(0));

    render(<TopbarCreditsBar />);

    await waitFor(() => {
      expect(screen.getByTestId('credits-numeric')).toHaveTextContent('0');
      expect(screen.getByTestId('credits-balance')).toHaveTextContent('0');
      expect(screen.getByTestId('credits-trigger')).toHaveAttribute(
        'data-loading',
        'false',
      );
    });
  });
});

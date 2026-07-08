import { render, screen, waitFor } from '@testing-library/react';
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
} = vi.hoisted(() => ({
  mockGetCreditsService: vi.fn(),
  mockGetTopbarBalances: vi.fn(),
  mockLoggerError: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockRefreshCreditsBreakdown: vi.fn(),
  mockSubscribe: vi.fn(),
  mockUnsubscribe: vi.fn(),
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
    billingHref,
    fullBalance,
  }: {
    billingHref: string;
    fullBalance: string;
  }) => (
    <a href={billingHref} data-testid="credits-link">
      Credits {fullBalance}
    </a>
  ),
}));

describe('TopbarCreditsBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY;
    mockGetCreditsService.mockResolvedValue({
      getTopbarBalances: mockGetTopbarBalances,
    });
    mockGetTopbarBalances.mockResolvedValue({
      generatedAt: '2026-06-17T00:00:00.000Z',
      segments: [
        {
          balance: 42,
          currencyOrUnit: 'credits',
          label: 'Genfeed',
          lastSyncedAt: '2026-06-17T00:00:00.000Z',
          provider: 'genfeed',
          status: 'available',
        },
      ],
    });
  });

  it('loads topbar balances without logging an error', async () => {
    render(<TopbarCreditsBar />);

    await waitFor(() => {
      expect(screen.getByText('Credits 42')).toBeInTheDocument();
    });

    expect(screen.getByTestId('credits-link')).toHaveAttribute(
      'href',
      '/genfeed/settings/credits',
    );
    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it('links to billing when EE billing is enabled', async () => {
    process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY = 'test-license';

    render(<TopbarCreditsBar />);

    await waitFor(() => {
      expect(screen.getByText('Credits 42')).toBeInTheDocument();
    });

    expect(screen.getByTestId('credits-link')).toHaveAttribute(
      'href',
      '/genfeed/settings/billing',
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
  });
});

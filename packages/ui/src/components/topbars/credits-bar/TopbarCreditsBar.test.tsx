import { render, screen, waitFor } from '@testing-library/react';
import TopbarCreditsBar from '@ui/topbars/credits-bar/TopbarCreditsBar';
import type { ReactNode } from 'react';
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

vi.mock('@ui/primitives/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('./CreditsBarTrigger', () => ({
  default: ({ fullBalance }: { fullBalance: string }) => (
    <button type="button">Credits {fullBalance}</button>
  ),
}));

vi.mock('./CreditsBarPanel', () => ({
  default: ({ isLoading }: { isLoading: boolean }) => (
    <div data-loading={String(isLoading)} data-testid="credits-panel" />
  ),
}));

describe('TopbarCreditsBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it('treats balance timeouts as non-critical topbar warnings', async () => {
    const timeoutError = new Error('Request timed out') as Error & {
      isTimeout: boolean;
    };
    timeoutError.isTimeout = true;
    mockGetTopbarBalances.mockRejectedValue(timeoutError);

    render(<TopbarCreditsBar />);

    await waitFor(() => {
      expect(screen.getByTestId('credits-panel')).toHaveAttribute(
        'data-loading',
        'false',
      );
    });

    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'TopbarCreditsBar: failed to fetch balances',
      {
        error: timeoutError,
        reportToSentry: false,
      },
    );
  });
});

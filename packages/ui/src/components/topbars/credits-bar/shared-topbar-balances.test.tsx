import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import LowCreditsBanner from '@ui/banners/low-credits/LowCreditsBanner';
import TopbarCreditsBar from '@ui/topbars/credits-bar/TopbarCreditsBar';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The credits chip and the low-credits banner both mount on every protected
 * page. They used to fetch `/topbar-balances` independently, which cost two
 * identical round trips per navigation. Behind one query key they collapse into
 * one request, and a live balance published by the chip reaches the banner.
 */

const { mockGetCreditsService, mockGetTopbarBalances } = vi.hoisted(() => ({
  mockGetCreditsService: vi.fn(),
  mockGetTopbarBalances: vi.fn(),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: 'org_1' }),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mockGetCreditsService,
}));

vi.mock('@genfeedai/services/billing/credits.service', () => ({
  CreditsService: { getInstance: vi.fn() },
}));

vi.mock(
  '@genfeedai/hooks/data/subscription/use-subscription/use-subscription',
  () => ({
    useSubscription: () => ({
      creditsBreakdown: null,
      refreshCreditsBreakdown: vi.fn(),
    }),
  }),
);

vi.mock('@genfeedai/hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ orgHref: (path: string) => `/genfeed${path}` }),
}));

vi.mock('@genfeedai/hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({
    isReady: true,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  }),
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('./CreditsBarTrigger', () => ({
  default: ({ fullBalance }: { fullBalance: string }) => (
    <span data-testid="credits-balance">{fullBalance}</span>
  ),
}));

describe('shared topbar balances', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY;
    delete process.env.NEXT_PUBLIC_DESKTOP_SHELL;
    process.env.NEXT_PUBLIC_GENFEED_CLOUD = 'true';
    localStorage.clear();
    mockGetCreditsService.mockResolvedValue({
      getTopbarBalances: mockGetTopbarBalances,
    });
    mockGetTopbarBalances.mockResolvedValue({
      generatedAt: '2026-06-17T00:00:00.000Z',
      segments: [
        {
          balance: 0,
          currencyOrUnit: 'credits',
          label: 'Genfeed',
          lastSyncedAt: '2026-06-17T00:00:00.000Z',
          provider: 'genfeed',
          status: 'available',
        },
      ],
    });
  });

  it('fetches the wallet once for the chip and the banner together', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: 0, retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TopbarCreditsBar />
        <LowCreditsBanner />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('credits-balance')).toHaveTextContent('0');
    });

    // Both surfaces read the same wallet, and both render it.
    expect(screen.getByRole('alert')).toHaveTextContent(
      "You've run out of credits",
    );
    expect(mockGetTopbarBalances).toHaveBeenCalledTimes(1);
  });
});

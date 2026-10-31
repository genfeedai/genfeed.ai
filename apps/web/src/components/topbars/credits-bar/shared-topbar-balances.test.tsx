import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LowCreditsBanner from '@/components/banners/low-credits/LowCreditsBanner';
import CreditsLiveSync from '@/components/topbars/credits-bar/CreditsLiveSync';
import messages from '../../../../messages/en/ui.json';

/**
 * The credits live sync and the low-credits banner both mount on every protected
 * page. They used to fetch `/topbar-balances` independently, which cost two
 * identical round trips per navigation. Behind one query key they collapse into
 * one request, and a live balance published by the sync reaches the banner.
 */

const { mockGetCreditsService, mockGetTopbarBalances } = vi.hoisted(() => ({
  mockGetCreditsService: vi.fn(),
  mockGetTopbarBalances: vi.fn(),
}));

vi.mock(
  '@genfeedai/contexts/providers/access-state/access-state.provider',
  () => ({
    useAccessState: () => ({ isTrialUsedUp: false }),
  }),
);

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

vi.mock('@genfeedai/services/billing/credits.service', () => ({
  CreditsService: { getInstance: vi.fn() },
}));

vi.mock('@/hooks/data/subscription/use-subscription/use-subscription', () => ({
  useSubscription: () => ({
    creditsBreakdown: null,
    refreshCreditsBreakdown: vi.fn(),
  }),
}));

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

  it('fetches the wallet once for the live sync and the banner together', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: 0, retry: false } },
    });

    render(
      <NextIntlClientProvider locale="en" messages={{ ui: messages }}>
        <QueryClientProvider client={queryClient}>
          <CreditsLiveSync />
          <LowCreditsBanner />
        </QueryClientProvider>
      </NextIntlClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        "You've run out of credits",
      );
    });

    // Both mount on every protected page and share one wallet request.
    expect(mockGetTopbarBalances).toHaveBeenCalledTimes(1);
  });
});

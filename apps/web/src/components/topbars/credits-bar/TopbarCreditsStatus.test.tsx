vi.mock('next-intl', async () => {
  const { createTranslateFromCatalog } = await import(
    '@ui/tests/next-intl.stub'
  );
  const { default: ui } = await import('../../../../messages/en/ui.json');
  return {
    useTranslations: createTranslateFromCatalog({ ui }),
  };
});

vi.mock(
  '@/hooks/ui/use-desktop-runtime-context/use-desktop-runtime-context',
  () => ({
    useDesktopRuntimeContext: () => ({ status: 'web', context: null }),
  }),
);

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TopbarCreditsStatus from '@/components/topbars/credits-bar/TopbarCreditsStatus';

const mockUseSubscription = vi.fn();
const mockGetTopbarBalances = vi.fn();
const accessState = vi.hoisted(() => ({
  isLowBalanceWarningEnabled: true,
  isTrialExpired: false,
  isTrialUsedUp: false,
  lowCreditThreshold: 1000 as number | null,
}));

vi.mock(
  '@genfeedai/contexts/providers/access-state/access-state.provider',
  () => ({
    useAccessState: () => ({
      accessState: {
        isTrialExpired: accessState.isTrialExpired,
        lowCreditThreshold: accessState.lowCreditThreshold,
      },
      isTrialUsedUp: accessState.isTrialUsedUp,
    }),
  }),
);

vi.mock('@/hooks/feature-flags/use-feature-flag', () => ({
  useFeatureFlag: () => accessState.isLowBalanceWarningEnabled,
}));

vi.mock('@/hooks/data/subscription/use-subscription/use-subscription', () => ({
  useSubscription: () => mockUseSubscription(),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: 'org-1' }),
}));
vi.mock(
  '@genfeedai/contexts/user/organization-context/organization-context',
  () => ({
    useRoutedOrganization: () => ({
      confirmedOrganizationId: 'org-1',
      isRouteConfirmed: true,
    }),
  }),
);

vi.mock('@genfeedai/config/license', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@genfeedai/config/license')>();
  return {
    ...actual,
    hasOrganizationBillingHint: () => true,
    shouldShowCreditsNav: () => true,
  };
});

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    isLoaded: true,
    isSignedIn: true,
    orgId: 'org-1',
    sessionId: 'session_1',
    userId: 'user_1',
  }),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    getTopbarBalances: mockGetTopbarBalances,
  }),
}));

vi.mock('@genfeedai/services/billing/credits.service', () => ({
  CreditsService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useParams: () => ({
    brandSlug: 'brand-1',
    orgSlug: 'test-org',
  }),
}));

describe('TopbarCreditsStatus', () => {
  // The pill reads the GEN wallet through the shared topbar-balances query, so
  // every case needs a cache. One client per case keeps them isolated, and the
  // rerender below reuses it so a re-render does not drop the cache.
  let queryClient: QueryClient;

  function renderPill(ui: ReactElement) {
    const utils = render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    );

    return {
      ...utils,
      rerender: (next: ReactElement) =>
        utils.rerender(
          <QueryClientProvider client={queryClient}>
            {next}
          </QueryClientProvider>,
        ),
    };
  }

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: 0, retry: false } },
    });
    accessState.isLowBalanceWarningEnabled = true;
    accessState.isTrialUsedUp = false;
    accessState.isTrialExpired = false;
    // The server-computed threshold (10% of a 10,000-credit plan here).
    accessState.lowCreditThreshold = 1000;
    mockUseSubscription.mockReset();
    mockGetTopbarBalances.mockReset();
    mockGetTopbarBalances.mockResolvedValue({ segments: [] });
  });

  it('shows one Top up link with the balance when it runs low', () => {
    mockUseSubscription.mockReturnValue({
      creditsBreakdown: { total: 250 },
    });

    renderPill(<TopbarCreditsStatus />);

    const link = screen.getByRole('link');
    expect(link).toHaveTextContent('250 credits left');
    expect(link).toHaveTextContent('Top up');
    expect(link).toHaveAttribute('href', '/test-org/~/settings/credits');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('shows nothing while the balance is above the server threshold', () => {
    accessState.lowCreditThreshold = 50;
    mockUseSubscription.mockReturnValue({
      creditsBreakdown: { total: 250 },
    });

    const { rerender } = renderPill(<TopbarCreditsStatus />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();

    mockUseSubscription.mockReturnValue({
      creditsBreakdown: { total: 40 },
    });
    rerender(<TopbarCreditsStatus />);
    expect(screen.getByRole('link')).toHaveTextContent('40 credits left');
  });

  it('shows no ordinary low warning without a server threshold, but still the empty state', () => {
    accessState.lowCreditThreshold = null;
    mockUseSubscription.mockReturnValue({
      creditsBreakdown: { total: 5 },
    });

    const { rerender } = renderPill(<TopbarCreditsStatus />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();

    mockUseSubscription.mockReturnValue({
      creditsBreakdown: { total: 0 },
    });
    rerender(<TopbarCreditsStatus />);
    expect(screen.getByRole('link')).toHaveTextContent('Out of credits');
  });

  it('shows the empty state from the topbar GEN wallet when the breakdown is missing', async () => {
    mockUseSubscription.mockReturnValue({
      creditsBreakdown: null,
    });
    mockGetTopbarBalances.mockResolvedValue({
      segments: [{ balance: 0, provider: 'genfeed' }],
    });

    renderPill(<TopbarCreditsStatus />);

    await waitFor(() => {
      expect(screen.getByRole('link')).toHaveTextContent('Out of credits');
    });
  });

  it('shows one Buy credits action once the balance cannot pay for a generation', () => {
    accessState.isTrialUsedUp = true;
    mockUseSubscription.mockReturnValue({
      creditsBreakdown: { total: 5 },
    });

    renderPill(<TopbarCreditsStatus />);

    const link = screen.getByRole('link');
    expect(link).toHaveTextContent('Not enough credits');
    expect(link).toHaveTextContent('Buy credits');
    expect(link).toHaveAttribute('href', '/test-org/~/settings/credits');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('explains an ended free trial without counting the expired credits', () => {
    accessState.isTrialUsedUp = true;
    accessState.isTrialExpired = true;
    mockUseSubscription.mockReturnValue({
      creditsBreakdown: { total: 60 },
    });

    renderPill(<TopbarCreditsStatus />);

    const link = screen.getByRole('link');
    expect(link).toHaveTextContent('Free trial ended');
    expect(link).toHaveTextContent('Buy credits');
    expect(link).not.toHaveTextContent('60');
  });

  it('shows the paywall state even when the low-balance warning flag is off', () => {
    accessState.isLowBalanceWarningEnabled = false;
    accessState.isTrialUsedUp = true;
    mockUseSubscription.mockReturnValue({
      creditsBreakdown: { total: 5 },
    });

    renderPill(<TopbarCreditsStatus />);

    expect(screen.getByRole('link')).toHaveTextContent('Not enough credits');
  });

  it('hides the ordinary balance warnings when the flag is off', () => {
    accessState.isLowBalanceWarningEnabled = false;
    mockUseSubscription.mockReturnValue({
      creditsBreakdown: { total: 50 },
    });

    const { rerender } = renderPill(<TopbarCreditsStatus />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();

    mockUseSubscription.mockReturnValue({
      creditsBreakdown: { total: 0 },
    });
    rerender(<TopbarCreditsStatus />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

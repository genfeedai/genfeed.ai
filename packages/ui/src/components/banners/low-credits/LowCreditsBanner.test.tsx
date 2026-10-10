vi.mock('next-intl', async () => {
  const { createTranslateFromCatalog } = await import(
    '@ui/tests/next-intl.stub'
  );
  return {
    useTranslations: createTranslateFromCatalog({
      ui: {
        lowCreditsBanner: {
          buyCredits: 'Buy credits',
          generationUnaffordableBody:
            'Everything you made stays in your Library. Buy a credit pack or pick a plan to keep generating.',
          generationUnaffordableTitle: 'Not enough credits to keep generating',
          seePlans: 'See plans',
        },
      },
    }),
  };
});

vi.mock(
  '@genfeedai/hooks/ui/use-desktop-runtime-context/use-desktop-runtime-context',
  () => ({
    useDesktopRuntimeContext: () => ({ status: 'web', context: null }),
  }),
);

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import LowCreditsBanner from '@ui/banners/low-credits/LowCreditsBanner';
import type { ReactElement, ReactNode } from 'react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseSubscription = vi.fn();
const mockGetTopbarBalances = vi.fn();
const accessState = vi.hoisted(() => ({ isTrialUsedUp: false }));

vi.mock(
  '@genfeedai/contexts/providers/access-state/access-state.provider',
  () => ({
    useAccessState: () => ({ isTrialUsedUp: accessState.isTrialUsedUp }),
  }),
);

vi.mock(
  '@genfeedai/hooks/data/subscription/use-subscription/use-subscription',
  () => ({
    useSubscription: () => mockUseSubscription(),
  }),
);

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
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useParams: () => ({
    brandSlug: 'brand-1',
    orgSlug: 'test-org',
  }),
}));

describe('LowCreditsBanner', () => {
  const storage = new Map<string, string>();
  const originalLicenseKey = process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY;

  // The banner reads the GEN wallet through the shared topbar-balances query,
  // so every case needs a cache. One client per case keeps them isolated, and
  // the rerender below reuses it so a re-render does not drop the cache.
  let queryClient: QueryClient;

  function renderBanner(ui: ReactElement) {
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
    storage.clear();
    delete process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => {
          storage.delete(key);
        },
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
    });
    queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: 0, retry: false } },
    });
    accessState.isTrialUsedUp = false;
    mockUseSubscription.mockReset();
    mockGetTopbarBalances.mockReset();
    mockGetTopbarBalances.mockResolvedValue({ segments: [] });
  });

  afterAll(() => {
    if (originalLicenseKey) {
      process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY = originalLicenseKey;
      return;
    }

    delete process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY;
  });

  it('re-shows the banner when a dismissed balance later drops to zero', () => {
    localStorage.setItem(
      'genfeed:low-credits-dismissed:v1',
      JSON.stringify({
        balance: 500,
        timestamp: Date.now(),
      }),
    );

    mockUseSubscription.mockReturnValue({
      creditsBreakdown: { total: 500 },
    });

    const { rerender } = renderBanner(<LowCreditsBanner />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    mockUseSubscription.mockReturnValue({
      creditsBreakdown: { total: 0 },
    });

    rerender(<LowCreditsBanner />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      "You've run out of credits",
    );
  });

  it('ignores malformed dismiss state and still renders the warning', () => {
    localStorage.setItem('genfeed:low-credits-dismissed:v1', 'not-json');
    mockUseSubscription.mockReturnValue({
      creditsBreakdown: { total: 250 },
    });

    renderBanner(<LowCreditsBanner />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      "You're running low on credits",
    );
  });

  it('supports the inline library notice variant', () => {
    mockUseSubscription.mockReturnValue({
      creditsBreakdown: { total: 250 },
    });

    renderBanner(<LowCreditsBanner variant="inline" />);

    expect(screen.getByTestId('library-credit-notice')).toBeInTheDocument();
  });

  it('sends OSS installs to Credits instead of API keys', () => {
    mockUseSubscription.mockReturnValue({
      creditsBreakdown: { total: 250 },
    });

    renderBanner(<LowCreditsBanner />);

    expect(screen.getByRole('link', { name: 'Buy credits' })).toHaveAttribute(
      'href',
      '/test-org/~/settings/credits',
    );
  });

  it('shows critical state from the topbar GEN wallet when breakdown is missing', async () => {
    mockUseSubscription.mockReturnValue({
      creditsBreakdown: null,
    });
    mockGetTopbarBalances.mockResolvedValue({
      segments: [{ balance: 0, provider: 'genfeed' }],
    });

    renderBanner(<LowCreditsBanner />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        "You've run out of credits",
      );
    });
  });

  it('shows a non-dismissible upgrade state once the balance cannot pay for a generation', () => {
    accessState.isTrialUsedUp = true;
    localStorage.setItem(
      'genfeed:low-credits-dismissed:v1',
      JSON.stringify({ balance: 5, timestamp: Date.now() }),
    );
    mockUseSubscription.mockReturnValue({
      creditsBreakdown: { total: 5 },
    });

    renderBanner(<LowCreditsBanner />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Not enough credits to keep generating',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('5 left');
    expect(screen.getByRole('link', { name: 'Buy credits' })).toHaveAttribute(
      'href',
      '/test-org/~/settings/credits',
    );
    expect(screen.getByRole('link', { name: 'See plans' })).toHaveAttribute(
      'href',
      '/test-org/~/settings/subscription',
    );
    expect(
      screen.queryByRole('button', { name: 'Dismiss low credits banner' }),
    ).not.toBeInTheDocument();
  });

  it('shows the paywall state even when the low-balance warning flag is off', () => {
    accessState.isTrialUsedUp = true;
    mockUseSubscription.mockReturnValue({
      creditsBreakdown: { total: 5 },
    });

    renderBanner(<LowCreditsBanner isLowBalanceWarningEnabled={false} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Not enough credits to keep generating',
    );
  });

  it('hides the ordinary low-balance warning when its flag is off', () => {
    mockUseSubscription.mockReturnValue({
      creditsBreakdown: { total: 50 },
    });

    renderBanner(<LowCreditsBanner isLowBalanceWarningEnabled={false} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the billing CTA in EE mode', () => {
    process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY = 'test-license';
    mockUseSubscription.mockReturnValue({
      creditsBreakdown: { total: 250 },
    });

    renderBanner(<LowCreditsBanner />);

    expect(
      screen.getByRole('link', { name: 'Top up credits' }),
    ).toHaveAttribute('href', '/test-org/~/settings/credits');
  });
});

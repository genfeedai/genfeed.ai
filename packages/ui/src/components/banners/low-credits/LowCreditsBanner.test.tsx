import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import LowCreditsBanner from '@ui/banners/low-credits/LowCreditsBanner';
import type { ReactElement, ReactNode } from 'react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseSubscription = vi.fn();
const mockGetTopbarBalances = vi.fn();

vi.mock(
  '@genfeedai/hooks/data/subscription/use-subscription/use-subscription',
  () => ({
    useSubscription: () => mockUseSubscription(),
  }),
);

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: 'org-1' }),
}));

vi.mock('@genfeedai/config/license', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@genfeedai/config/license')>();
  return {
    ...actual,
    shouldShowCreditsNav: () => true,
  };
});

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

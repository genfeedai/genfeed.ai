import { render, screen } from '@testing-library/react';
import LowCreditsBanner from '@ui/banners/low-credits/LowCreditsBanner';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseSubscription = vi.fn();

vi.mock('@hooks/data/subscription/use-subscription/use-subscription', () => ({
  useSubscription: () => mockUseSubscription(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('LowCreditsBanner', () => {
  const storage = new Map<string, string>();
  const originalLicenseKey = process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY;

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
    mockUseSubscription.mockReset();
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
      'genfeed:low-credits-dismissed',
      JSON.stringify({
        balance: 500,
        timestamp: Date.now(),
      }),
    );

    mockUseSubscription.mockReturnValue({
      creditsBreakdown: { total: 500 },
    });

    const { rerender } = render(<LowCreditsBanner />);

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
    localStorage.setItem('genfeed:low-credits-dismissed', 'not-json');
    mockUseSubscription.mockReturnValue({
      creditsBreakdown: { total: 250 },
    });

    render(<LowCreditsBanner />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      "You're running low on credits",
    );
  });

  it('supports the inline library notice variant', () => {
    mockUseSubscription.mockReturnValue({
      creditsBreakdown: { total: 250 },
    });

    render(<LowCreditsBanner variant="inline" />);

    expect(screen.getByTestId('library-credit-notice')).toBeInTheDocument();
  });

  it('sends OSS installs to API keys instead of billing', () => {
    mockUseSubscription.mockReturnValue({
      creditsBreakdown: { total: 250 },
    });

    render(<LowCreditsBanner />);

    expect(
      screen.getByRole('link', { name: 'Configure providers' }),
    ).toHaveAttribute('href', '/test-org/~/settings/organization/api-keys');
  });

  it('keeps the billing CTA in EE mode', () => {
    process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY = 'test-license';
    mockUseSubscription.mockReturnValue({
      creditsBreakdown: { total: 250 },
    });

    render(<LowCreditsBanner />);

    expect(
      screen.getByRole('link', { name: 'Top up credits' }),
    ).toHaveAttribute('href', '/test-org/~/settings/organization/billing');
  });
});

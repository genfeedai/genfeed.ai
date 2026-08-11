import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsSubscriptionPage from './content';
import '@testing-library/jest-dom/vitest';
import type { UseSubscriptionReturn } from '@genfeedai/interfaces/hooks/hooks.interface';

// PlansCard renders inside this page, so the catalog-backed stub keeps the
// assertions on real copy without a NextIntlClientProvider.
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../../../tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    isReady: true,
    organizationId: 'org-123',
    settings: { subscriptionTier: 'free' },
  })),
}));

const useSubscriptionMock = vi.fn();
vi.mock('@hooks/data/subscription/use-subscription/use-subscription', () => ({
  useSubscription: () => useSubscriptionMock(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({
    data: null,
    isLoading: false,
    refetch: vi.fn(),
  })),
}));

describe('SettingsSubscriptionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSubscriptionMock.mockReturnValue({
      changeSubscriptionPlan: vi.fn(),
      creditsBreakdown: null,
      error: null,
      isLoading: false,
      isSubscriptionActive: true,
      openBillingPortal: vi.fn(),
      previewPlanChange: vi.fn(),
      refreshCreditsBreakdown: vi.fn(),
      refreshSubscription: vi.fn(),
      subscription: {
        category: 'pro',
        status: 'active',
      },
    } as UseSubscriptionReturn);
  });

  it('renders plan and limits without credit top-up', () => {
    render(<SettingsSubscriptionPage />);

    expect(screen.getByText('Current Plan')).toBeInTheDocument();
    expect(screen.getByText('Organizations')).toBeInTheDocument();
    expect(screen.getByText('Manage subscription')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Open Billing Portal/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Add credits')).not.toBeInTheDocument();
    expect(screen.queryByText('Credits Left')).not.toBeInTheDocument();
  });

  it('offers in-app plan selection alongside the billing portal', () => {
    render(<SettingsSubscriptionPage />);

    expect(screen.getByText('Plans')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Upgrade to Pro/i }),
    ).toBeInTheDocument();
  });

  it('names the plan from the organization tier, not the unserialized category', () => {
    // The mocked subscription claims category "pro" while the org tier is
    // "free"; `category` never reaches the client, so the tier wins.
    render(<SettingsSubscriptionPage />);

    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.queryByText('pro')).not.toBeInTheDocument();
  });
});

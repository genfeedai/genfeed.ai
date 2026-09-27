import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsSubscriptionPage from './content';
import '@testing-library/jest-dom/vitest';
import type { UseSubscriptionReturn } from '@genfeedai/contracts/interfaces/hooks/hooks.interface';

// PlansCard renders inside this page, so the catalog-backed stub keeps the
// assertions on real copy without a NextIntlClientProvider.
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../../../tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

const useBrandMock = vi.fn();
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => useBrandMock(),
}));

const useSubscriptionMock = vi.fn();
vi.mock('@hooks/data/subscription/use-subscription/use-subscription', () => ({
  useSubscription: () => useSubscriptionMock(),
}));

const useBillingAccountMock = vi.fn();
vi.mock('@hooks/data/billing/use-billing-account/use-billing-account', () => ({
  useBillingAccount: () => useBillingAccountMock(),
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
    useBrandMock.mockReturnValue({
      isReady: true,
      organizationId: 'org-123',
      settings: { subscriptionTier: 'free' },
    });
    useBillingAccountMock.mockReturnValue({
      account: null,
      error: null,
      isLoading: false,
      refresh: vi.fn(),
    });
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

  it('renders section chrome immediately while the subscription query loads', () => {
    useSubscriptionMock.mockReturnValue({
      changeSubscriptionPlan: vi.fn(),
      creditsBreakdown: null,
      error: null,
      isLoading: true,
      isSubscriptionActive: false,
      openBillingPortal: vi.fn(),
      previewPlanChange: vi.fn(),
      refreshCreditsBreakdown: vi.fn(),
      refreshSubscription: vi.fn(),
      subscription: null,
    } as UseSubscriptionReturn);

    render(<SettingsSubscriptionPage />);

    // Chrome: section headers render unconditionally while data loads.
    expect(screen.getByText('Current Plan')).toBeInTheDocument();
    expect(screen.getByText('Manage subscription')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Open Billing Portal/i }),
    ).toBeInTheDocument();

    // Stat tiles show a placeholder rather than blocking the whole page.
    expect(screen.getByText('Organizations')).toBeInTheDocument();
    expect(
      screen.queryByText(
        'No active subscription. Subscribe to unlock all features.',
      ),
    ).not.toBeInTheDocument();
  });

  it('renders section chrome immediately while the brand context is not ready', () => {
    useBrandMock.mockReturnValue({
      isReady: false,
      organizationId: undefined,
      settings: undefined,
    });

    render(<SettingsSubscriptionPage />);

    expect(screen.getByText('Current Plan')).toBeInTheDocument();
    expect(screen.getByText('Manage subscription')).toBeInTheDocument();
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  });

  it('renders the full billing account snapshot, including the wallet and funded organizations', () => {
    useBillingAccountMock.mockReturnValue({
      account: {
        callerRole: 'VIEWER',
        capabilities: {
          canCheckout: false,
          canDetachOrganization: false,
          canLinkOrganization: false,
          canManageBudgets: false,
          canManageMembers: false,
          canOpenPortal: false,
        },
        isIdentityStale: false,
        kind: 'account',
        linkedOrganizations: [
          { label: 'Acme', organizationId: 'org-123', usage: 42 },
        ],
        status: 'active',
        wallet: { available: 100, held: 10, settled: 110 },
      },
      error: null,
      isLoading: false,
      refresh: vi.fn(),
    });

    render(<SettingsSubscriptionPage />);

    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('Funded organizations')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
  });

  it('renders the reduced own-organization view without wallet or other orgs, and without crashing', () => {
    useBillingAccountMock.mockReturnValue({
      account: {
        budgetPolicy: null,
        callerRole: null,
        capabilities: {
          canCheckout: false,
          canDetachOrganization: false,
          canLinkOrganization: false,
          canManageBudgets: false,
          canManageMembers: false,
          canOpenPortal: false,
        },
        isLinked: true,
        kind: 'organization',
        monthlyBudgetCredits: null,
        organizationId: 'org-123',
        usage: 7,
      },
      error: null,
      isLoading: false,
      refresh: vi.fn(),
    });

    render(<SettingsSubscriptionPage />);

    expect(screen.getByText('Current Plan')).toBeInTheDocument();
    expect(
      screen.getByText('Linked to a shared billing account'),
    ).toBeInTheDocument();
    expect(screen.getByText('Linked')).toBeInTheDocument();
    expect(screen.getByText("This organization's usage")).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.queryByText('Available')).not.toBeInTheDocument();
    expect(screen.queryByText('Funded organizations')).not.toBeInTheDocument();
  });
});

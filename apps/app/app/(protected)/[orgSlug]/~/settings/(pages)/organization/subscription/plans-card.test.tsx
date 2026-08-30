import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlansCard from './plans-card';
import '@testing-library/jest-dom/vitest';

// Resolve against the real catalog so these assertions stay on the copy a user
// reads, not on message keys.
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

const createCheckoutSession = vi.fn();
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ createCheckoutSession }),
}));

vi.mock('@services/billing/stripe.service', () => ({
  StripeService: { getInstance: vi.fn() },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: vi.fn(), success: vi.fn() }),
  },
}));

vi.mock('@genfeedai/pricing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/pricing')>();

  return {
    ...actual,
    getPlanByTier: (tier: string) => ({
      ...actual.getPlanByTier(tier as never),
      stripePriceId: `price_${tier}`,
    }),
  };
});

const previewPlanChange = vi.fn();
const changeSubscriptionPlan = vi.fn();

function mockSubscription(stripeSubscriptionId?: string) {
  useSubscriptionMock.mockReturnValue({
    changeSubscriptionPlan,
    creditsBreakdown: null,
    error: null,
    isLoading: false,
    isSubscriptionActive: true,
    openBillingPortal: vi.fn(),
    previewPlanChange,
    refreshCreditsBreakdown: vi.fn(),
    refreshSubscription: vi.fn(),
    subscription: stripeSubscriptionId ? { stripeSubscriptionId } : null,
  });
}

describe('PlansCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBrandMock.mockReturnValue({ settings: { subscriptionTier: 'free' } });
    mockSubscription();
  });

  it('sells only Pro and Scale — never Free or Enterprise', () => {
    render(<PlansCard />);

    expect(screen.getByText('Pro')).toBeInTheDocument();
    expect(screen.getByText('Scale')).toBeInTheDocument();
    expect(screen.queryByText('Pay As You Go')).not.toBeInTheDocument();
    expect(screen.queryByText('Enterprise')).not.toBeInTheDocument();
  });

  it('leads with launch pricing and strikes the list price where one applies', () => {
    render(<PlansCard />);

    expect(screen.getByText('$39/mo')).toBeInTheDocument();
    expect(screen.getByText('was $49/mo')).toBeInTheDocument();
    expect(screen.getByText(/EARLYGENFEED/)).toBeInTheDocument();
    // Scale carries no launch offer, so it shows its list price plainly.
    expect(screen.getByText('$499/mo')).toBeInTheDocument();
    expect(screen.queryByText('was $499/mo')).not.toBeInTheDocument();
  });

  it('badges the current plan and drops its call to action', () => {
    useBrandMock.mockReturnValue({ settings: { subscriptionTier: 'pro' } });

    render(<PlansCard />);

    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Pro$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Upgrade to Scale/i }),
    ).toBeInTheDocument();
  });

  it('sends an org without a Stripe subscription through checkout', async () => {
    createCheckoutSession.mockResolvedValue({
      url: 'https://checkout.stripe.com/session',
    });

    render(<PlansCard />);
    fireEvent.click(screen.getByRole('button', { name: /Upgrade to Pro/i }));

    await waitFor(() => {
      expect(createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({ stripePriceId: 'price_pro' }),
      );
    });
    expect(previewPlanChange).not.toHaveBeenCalled();
  });

  it('previews the proration before changing an existing subscription', async () => {
    mockSubscription('sub_123');
    previewPlanChange.mockResolvedValue({
      isDowngrade: false,
      isUpgrade: true,
      newPriceId: 'price_scale',
      prorationAmount: 15_000,
      upcomingInvoice: { amount_due: 32_500, currency: 'usd', lines: [] },
    });

    render(<PlansCard />);
    fireEvent.click(screen.getByRole('button', { name: /Switch to Scale/i }));

    await waitFor(() => {
      expect(previewPlanChange).toHaveBeenCalledWith('price_scale');
    });
    expect(
      await screen.findByText(
        /Stripe estimates your next invoice at \$325\.00/,
      ),
    ).toBeVisible();
    expect(createCheckoutSession).not.toHaveBeenCalled();
    expect(changeSubscriptionPlan).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Confirm change/i }));

    await waitFor(() => {
      expect(changeSubscriptionPlan).toHaveBeenCalledWith('price_scale');
    });
  });

  it('uses honest generic copy for a partial preview response', async () => {
    mockSubscription('sub_123');
    previewPlanChange.mockResolvedValue({
      isDowngrade: false,
      isUpgrade: true,
      newPriceId: 'price_scale',
      prorationAmount: 15_000,
    } as never);

    render(<PlansCard />);
    fireEvent.click(screen.getByRole('button', { name: /Switch to Scale/i }));

    expect(
      await screen.findByText(
        /Stripe could not provide a next-invoice estimate/,
      ),
    ).toBeVisible();
  });

  it('shows the next invoice amount for a neutral preview', async () => {
    mockSubscription('sub_123');
    previewPlanChange.mockResolvedValue({
      isDowngrade: false,
      isUpgrade: false,
      newPriceId: 'price_scale',
      prorationAmount: 0,
      upcomingInvoice: { amount_due: 4_900, currency: 'usd', lines: [] },
    });

    render(<PlansCard />);
    fireEvent.click(screen.getByRole('button', { name: /Switch to Scale/i }));

    expect(
      await screen.findByText(/Stripe estimates your next invoice at \$49\.00/),
    ).toBeVisible();
  });
});

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

// One stable instance so a test can assert the single notification a failure
// produces, and the retry action attached to it.
const { notifications } = vi.hoisted(() => ({
  notifications: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => notifications },
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

  describe('failed plan preview', () => {
    /** An axios-shaped rejection carrying a JSON:API error document. */
    function apiError(member: Record<string, unknown>) {
      return { response: { data: { errors: [member] } } };
    }

    async function selectScale() {
      mockSubscription('sub_stripe_1');
      render(<PlansCard />);
      fireEvent.click(await screen.findByRole('button', { name: /Scale/i }));
    }

    it('shows one notification naming the cause instead of a generic message', async () => {
      previewPlanChange.mockRejectedValue(
        apiError({ code: 'price_not_found' }),
      );

      await selectScale();

      await waitFor(() => expect(notifications.error).toHaveBeenCalledTimes(1));
      expect(notifications.error).toHaveBeenCalledWith(
        'Plan preview',
        expect.objectContaining({
          description: 'This plan is no longer available.',
        }),
      );
      // A non-retryable cause must not offer a retry the API did not allow.
      expect(notifications.error.mock.calls[0][1]).not.toHaveProperty(
        'actionLabel',
      );
    });

    it('falls back to the generic message for a code it does not know', async () => {
      previewPlanChange.mockRejectedValue(apiError({ code: 'brand_new' }));

      await selectScale();

      await waitFor(() => expect(notifications.error).toHaveBeenCalledTimes(1));
      expect(notifications.error).toHaveBeenCalledWith(
        'Plan preview',
        expect.objectContaining({
          description: 'Something went wrong. Please try again.',
        }),
      );
    });

    it('offers a retry for a transient failure and runs it', async () => {
      previewPlanChange
        .mockRejectedValueOnce(
          apiError({
            code: 'billing_provider_unavailable',
            meta: { isRetryable: true, maxRetries: 1, retryAfterSeconds: 0 },
          }),
        )
        .mockResolvedValueOnce({
          isDowngrade: false,
          isUpgrade: true,
          newPriceId: 'price_scale',
          prorationAmount: 1_000,
          upcomingInvoice: { amount_due: 1_000, currency: 'usd', lines: [] },
        });

      await selectScale();

      await waitFor(() => expect(notifications.error).toHaveBeenCalledTimes(1));
      const options = notifications.error.mock.calls[0][1] as {
        actionLabel: string;
        onAction: () => void;
      };
      expect(options.actionLabel).toBe('Try again');

      options.onAction();

      await waitFor(() => expect(previewPlanChange).toHaveBeenCalledTimes(2));
    });

    it('stops offering a retry once the API-granted budget is spent', async () => {
      previewPlanChange.mockRejectedValue(
        apiError({
          code: 'billing_provider_unavailable',
          meta: { isRetryable: true, maxRetries: 1, retryAfterSeconds: 0 },
        }),
      );

      await selectScale();

      await waitFor(() => expect(notifications.error).toHaveBeenCalledTimes(1));
      const first = notifications.error.mock.calls[0][1] as {
        onAction: () => void;
      };

      first.onAction();

      await waitFor(() => expect(notifications.error).toHaveBeenCalledTimes(2));
      // One retry was granted and spent, so the second notification offers none.
      expect(notifications.error.mock.calls[1][1]).not.toHaveProperty(
        'actionLabel',
      );
    });
  });

  describe('failed plan confirmation', () => {
    /** An axios-shaped rejection carrying a JSON:API error document. */
    function apiError(member: Record<string, unknown>) {
      return { response: { data: { errors: [member] } } };
    }

    const transientFailure = apiError({
      code: 'billing_provider_unavailable',
      meta: { isRetryable: true, maxRetries: 1, retryAfterSeconds: 0 },
    });

    /** Selects Scale, waits for its preview, and opens the confirmation. */
    async function previewScale() {
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
      await screen.findByRole('button', { name: /Confirm change/i });
    }

    function retryActionOf(callIndex: number) {
      return notifications.error.mock.calls[callIndex][1] as {
        actionLabel?: string;
        onAction?: () => void;
      };
    }

    it('names the cause and offers the retry the API allowed', async () => {
      changeSubscriptionPlan.mockRejectedValue(transientFailure);
      await previewScale();

      fireEvent.click(screen.getByRole('button', { name: /Confirm change/i }));

      await waitFor(() => expect(notifications.error).toHaveBeenCalledTimes(1));
      expect(notifications.error).toHaveBeenCalledWith(
        'Plan change',
        expect.objectContaining({
          description: 'Our billing provider is briefly unavailable.',
        }),
      );
      expect(retryActionOf(0).actionLabel).toBe('Try again');
    });

    it('retries the same plan and then stops once the budget is spent', async () => {
      changeSubscriptionPlan.mockRejectedValue(transientFailure);
      await previewScale();

      fireEvent.click(screen.getByRole('button', { name: /Confirm change/i }));
      await waitFor(() => expect(notifications.error).toHaveBeenCalledTimes(1));

      retryActionOf(0).onAction?.();

      await waitFor(() =>
        expect(changeSubscriptionPlan).toHaveBeenCalledTimes(2),
      );
      expect(changeSubscriptionPlan).toHaveBeenNthCalledWith(2, 'price_scale');
      await waitFor(() => expect(notifications.error).toHaveBeenCalledTimes(2));
      // One retry was granted and spent, so the second notification offers none.
      expect(retryActionOf(1)).not.toHaveProperty('actionLabel');
    });

    it('does not submit a cancelled plan change when its retry fires later', async () => {
      changeSubscriptionPlan.mockRejectedValue(transientFailure);
      await previewScale();

      fireEvent.click(screen.getByRole('button', { name: /Confirm change/i }));
      await waitFor(() => expect(notifications.error).toHaveBeenCalledTimes(1));
      const retry = retryActionOf(0);

      // The user declines the change before reaching for the stale toast.
      fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
      retry.onAction?.();

      // The retry captured the confirmation the user has since cancelled;
      // running it would change the plan they just declined.
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(changeSubscriptionPlan).toHaveBeenCalledTimes(1);
    });

    it('does not resurrect an earlier plan once another is selected', async () => {
      changeSubscriptionPlan.mockRejectedValue(transientFailure);
      await previewScale();

      fireEvent.click(screen.getByRole('button', { name: /Confirm change/i }));
      await waitFor(() => expect(notifications.error).toHaveBeenCalledTimes(1));
      const retry = retryActionOf(0);

      fireEvent.click(screen.getByRole('button', { name: /Pro/i }));
      retry.onAction?.();

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(changeSubscriptionPlan).toHaveBeenCalledTimes(1);
      expect(changeSubscriptionPlan).not.toHaveBeenCalledWith('price_pro');
    });
  });
});

// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingFunnelAnalytics from './onboarding-funnel-analytics';

const mocks = vi.hoisted(() => ({
  captureAnalyticsEvent: vi.fn(),
  pathname: '/onboarding/brand',
  searchParams: new URLSearchParams(),
}));

vi.mock('@/lib/analytics', () => ({
  ANALYTICS_EVENTS: {
    CHECKOUT_COMPLETED: 'checkout_completed',
    FIRST_CREDIT_PURCHASED: 'first_credit_purchase',
  },
  captureAnalyticsEvent: mocks.captureAnalyticsEvent,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => mocks.searchParams,
}));

describe('OnboardingFunnelAnalytics', () => {
  beforeEach(() => {
    mocks.captureAnalyticsEvent.mockReset();
    mocks.pathname = '/onboarding/brand';
    mocks.searchParams = new URLSearchParams();
    sessionStorage.clear();
  });

  it('captures checkout completion and first credit purchase from Stripe return markers', async () => {
    mocks.searchParams = new URLSearchParams(
      'checkout=completed&checkoutKind=credits',
    );

    render(<OnboardingFunnelAnalytics />);

    await waitFor(() => {
      expect(mocks.captureAnalyticsEvent).toHaveBeenCalledWith(
        'checkout_completed',
        {
          checkoutKind: 'credits',
          handoffSource: 'stripe_return',
        },
      );
    });
    expect(mocks.captureAnalyticsEvent).toHaveBeenCalledWith(
      'first_credit_purchase',
      {
        checkoutKind: 'credits',
        handoffSource: 'stripe_return',
      },
    );
  });

  it('does not capture when checkout markers are absent', () => {
    render(<OnboardingFunnelAnalytics />);

    expect(mocks.captureAnalyticsEvent).not.toHaveBeenCalled();
  });
});

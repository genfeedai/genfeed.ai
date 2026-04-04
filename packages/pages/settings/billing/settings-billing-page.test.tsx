import SettingsBillingPage from '@pages/settings/billing/settings-billing-page';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import type { UseSubscriptionReturn } from '@cloud/interfaces/hooks/hooks.interface';

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    isReady: true,
    organizationId: 'org-123',
  })),
}));

const useSubscriptionMock = vi.fn();
vi.mock('@hooks/data/subscription/use-subscription/use-subscription', () => ({
  useSubscription: () => useSubscriptionMock(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('@hooks/data/resource/use-resource/use-resource', () => ({
  useResource: vi.fn(() => ({
    data: null,
    isLoading: false,
    refresh: vi.fn(),
  })),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

describe('SettingsBillingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSubscriptionMock.mockReturnValue({
      changeSubscriptionPlan: vi.fn(),
      creditsBreakdown: {
        credits: [],
        cycleTotal: 5000,
        planLimit: 35000,
        remainingPercent: 80,
        total: 4000,
      },
      error: null,
      isLoading: false,
      isSubscriptionActive: true,
      openBillingPortal: vi.fn(),
      refreshCreditsBreakdown: vi.fn(),
      refreshSubscription: vi.fn(),
      subscription: null,
    } satisfies UseSubscriptionReturn);
  });

  it('should render without crashing', () => {
    const { container } = render(<SettingsBillingPage />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should display credits leftover percentage', () => {
    render(<SettingsBillingPage />);

    expect(screen.getByText('Credits Left')).toBeInTheDocument();
    expect(screen.getByText('80.00%')).toBeInTheDocument();
  });

  it('should show low credits warning when balance is below 1000', () => {
    useSubscriptionMock.mockReturnValue({
      changeSubscriptionPlan: vi.fn(),
      creditsBreakdown: {
        credits: [],
        cycleTotal: 2000,
        planLimit: 35000,
        remainingPercent: 25,
        total: 500,
      },
      error: null,
      isLoading: false,
      isSubscriptionActive: true,
      openBillingPortal: vi.fn(),
      refreshCreditsBreakdown: vi.fn(),
      refreshSubscription: vi.fn(),
      subscription: null,
    } satisfies UseSubscriptionReturn);

    render(<SettingsBillingPage />);

    expect(
      screen.getByText(
        'Low credits warning: your organization is below 1,000 credits.',
      ),
    ).toBeInTheDocument();
  });

  it('should not show low credits warning when balance is at least 1000', () => {
    useSubscriptionMock.mockReturnValue({
      changeSubscriptionPlan: vi.fn(),
      creditsBreakdown: {
        credits: [],
        cycleTotal: 3000,
        planLimit: 35000,
        remainingPercent: 50,
        total: 1500,
      },
      error: null,
      isLoading: false,
      isSubscriptionActive: true,
      openBillingPortal: vi.fn(),
      refreshCreditsBreakdown: vi.fn(),
      refreshSubscription: vi.fn(),
      subscription: null,
    } satisfies UseSubscriptionReturn);

    render(<SettingsBillingPage />);

    expect(
      screen.queryByText(
        'Low credits warning: your organization is below 1,000 credits.',
      ),
    ).not.toBeInTheDocument();
  });
});

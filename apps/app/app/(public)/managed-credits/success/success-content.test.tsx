// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ManagedCreditsSuccessContent from './success-content';

const { captureAnalyticsEventMock, getCheckoutResultMock, searchParamsState } =
  vi.hoisted(() => ({
    captureAnalyticsEventMock: vi.fn(),
    getCheckoutResultMock: vi.fn(),
    searchParamsState: {
      value: new URLSearchParams('session_id=cs_test_123'),
    },
  }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsState.value,
}));

vi.mock('@/lib/analytics', () => ({
  ANALYTICS_EVENTS: {
    CHECKOUT_COMPLETED: 'checkout_completed',
    FIRST_CREDIT_PURCHASED: 'first_credit_purchase',
  },
  captureAnalyticsEvent: captureAnalyticsEventMock,
}));

vi.mock('@services/billing/managed-credits.service', () => ({
  isManagedCreditsTransientError: (error: unknown) =>
    error instanceof Error && error.message.includes('not found'),
  ManagedCreditsService: {
    apiEndpoint: 'https://api.genfeed.ai/v1',
    getCheckoutResult: getCheckoutResultMock,
  },
}));

vi.mock('@ui/layouts/auth/AuthFormLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@ui/feedback/spinner/Spinner', () => ({
  default: () => <span>Loading</span>,
}));

vi.mock('@genfeedai/ui', () => ({
  Code: ({ children }: { children: ReactNode }) => <code>{children}</code>,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe('ManagedCreditsSuccessContent', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    captureAnalyticsEventMock.mockReset();
    getCheckoutResultMock.mockReset();
    searchParamsState.value = new URLSearchParams('session_id=cs_test_123');

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('loads the checkout result and exposes the managed API key', async () => {
    getCheckoutResultMock.mockResolvedValue({
      apiKey: 'gf_managed_secret',
      apiKeyAlreadyExists: false,
      brandId: 'brand-1',
      email: 'buyer@example.com',
      organizationId: 'org-1',
      userId: 'user-1',
    });

    render(<ManagedCreditsSuccessContent />);

    expect(screen.getByText('Provisioning checkout')).toBeVisible();

    await waitFor(() => {
      expect(screen.getByText('GENFEED_API_KEY')).toBeVisible();
    });

    expect(screen.getByText('gf_managed_secret')).toBeVisible();
    expect(
      screen.getByText(
        /GENFEED_MANAGED_INFERENCE_URL=https:\/\/api.genfeed.ai/,
      ),
    ).toBeVisible();

    fireEvent.click(screen.getAllByText('Copy')[0]);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'gf_managed_secret',
    );
  });

  it('explains when a key already exists and cannot be shown again', async () => {
    getCheckoutResultMock.mockResolvedValue({
      apiKey: null,
      apiKeyAlreadyExists: true,
      brandId: 'brand-1',
      email: 'buyer@example.com',
      organizationId: 'org-1',
      userId: 'user-1',
    });

    render(<ManagedCreditsSuccessContent />);

    await waitFor(() => {
      expect(screen.getByText('Credits added')).toBeVisible();
    });

    expect(screen.getByText(/secret cannot be shown again/)).toBeVisible();
  });

  it('polls while checkout provisioning is not ready yet', async () => {
    vi.useFakeTimers();

    getCheckoutResultMock
      .mockRejectedValueOnce(
        new Error('Managed credits checkout result not found'),
      )
      .mockResolvedValue({
        apiKey: 'gf_managed_secret',
        apiKeyAlreadyExists: false,
        brandId: 'brand-1',
        email: 'buyer@example.com',
        organizationId: 'org-1',
        userId: 'user-1',
      });

    render(<ManagedCreditsSuccessContent />);

    expect(getCheckoutResultMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(getCheckoutResultMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText('gf_managed_secret')).toBeVisible();
    expect(getCheckoutResultMock).toHaveBeenCalledWith(
      'cs_test_123',
      expect.any(AbortSignal),
    );
  });

  it('captures onboarding managed credits checkout completion when marked', async () => {
    searchParamsState.value = new URLSearchParams(
      'session_id=cs_test_123&checkout=completed&checkoutKind=managed_credits',
    );
    getCheckoutResultMock.mockResolvedValue({
      apiKey: 'gf_managed_secret',
      apiKeyAlreadyExists: false,
      brandId: 'brand-1',
      email: 'buyer@example.com',
      organizationId: 'org-1',
      userId: 'user-1',
    });

    render(<ManagedCreditsSuccessContent />);

    await waitFor(() => {
      expect(captureAnalyticsEventMock).toHaveBeenCalledWith(
        'checkout_completed',
        {
          checkoutKind: 'managed_credits',
          handoffSource: 'stripe_return',
        },
      );
    });
    expect(captureAnalyticsEventMock).toHaveBeenCalledWith(
      'first_credit_purchase',
      {
        checkoutKind: 'managed_credits',
        handoffSource: 'stripe_return',
      },
    );
  });

  it('does not retry permanent checkout lookup failures', async () => {
    getCheckoutResultMock.mockRejectedValue(
      new Error('Stripe checkout session expired'),
    );

    render(<ManagedCreditsSuccessContent />);

    await waitFor(() => {
      expect(screen.getByText('Provisioning result not ready')).toBeVisible();
    });

    expect(getCheckoutResultMock).toHaveBeenCalledTimes(1);
  });

  it('shows a copy error when clipboard write fails', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
      },
    });

    getCheckoutResultMock.mockResolvedValue({
      apiKey: 'gf_managed_secret',
      apiKeyAlreadyExists: false,
      brandId: 'brand-1',
      email: 'buyer@example.com',
      organizationId: 'org-1',
      userId: 'user-1',
    });

    render(<ManagedCreditsSuccessContent />);

    await waitFor(() => {
      expect(screen.getByText('GENFEED_API_KEY')).toBeVisible();
    });

    fireEvent.click(screen.getAllByText('Copy')[0]);

    await waitFor(() => {
      expect(screen.getByText(/Clipboard access failed/)).toBeVisible();
    });
  });
});

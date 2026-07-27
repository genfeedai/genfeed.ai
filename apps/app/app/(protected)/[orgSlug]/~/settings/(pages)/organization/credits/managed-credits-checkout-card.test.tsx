// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManagedCreditsCheckoutCard from './managed-credits-checkout-card';

const { createCheckoutSessionMock, currentUserState, notificationErrorMock } =
  vi.hoisted(() => ({
    createCheckoutSessionMock: vi.fn(),
    currentUserState: {
      currentUser: {
        email: 'local@example.com',
        firstName: 'Local',
        lastName: 'User',
      },
    },
    notificationErrorMock: vi.fn(),
  }));

vi.mock('@contexts/user/user-context/user-context', () => ({
  useCurrentUser: () => currentUserState,
}));

vi.mock('@services/billing/managed-credits.service', () => ({
  ManagedCreditsService: {
    createCheckoutSession: createCheckoutSessionMock,
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: notificationErrorMock,
    }),
  },
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    isDisabled,
    onClick,
  }: {
    children: ReactNode;
    isDisabled?: boolean;
    onClick?: () => void;
  }) => (
    <button type="button" disabled={isDisabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  Input: ({
    hasError: _hasError,
    ...props
  }: InputHTMLAttributes<HTMLInputElement> & { hasError?: boolean }) => (
    <input {...props} />
  ),
}));

describe('ManagedCreditsCheckoutCard', () => {
  let locationState: { href: string; origin: string };

  beforeEach(() => {
    createCheckoutSessionMock.mockReset();
    notificationErrorMock.mockReset();
    currentUserState.currentUser = {
      email: 'local@example.com',
      firstName: 'Local',
      lastName: 'User',
    };
    createCheckoutSessionMock.mockResolvedValue({
      url: 'https://checkout.stripe.test/session',
    });

    locationState = {
      href: 'http://localhost/settings/credits',
      origin: 'http://localhost',
    };
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: locationState,
    });
  });

  it('starts managed checkout using the editable email and selected pack', async () => {
    render(<ManagedCreditsCheckoutCard />);

    expect(screen.queryByText('Credit amount')).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Buy hosted image-generation credits and provision one managed key for this self-hosted install.',
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Billing / Add credit')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'buyer@example.com' },
    });
    fireEvent.click(screen.getByText('$50'));
    fireEvent.click(screen.getByText('Get credits'));

    await waitFor(() => {
      expect(createCheckoutSessionMock).toHaveBeenCalledWith({
        cancelUrl: 'http://localhost/settings/credits',
        email: 'buyer@example.com',
        firstName: 'Local',
        lastName: 'User',
        quantity: 5000,
        successUrl:
          'http://localhost/managed-credits/success?session_id={CHECKOUT_SESSION_ID}',
      });
    });

    expect(locationState.href).toBe('https://checkout.stripe.test/session');
  });

  it('requires an explicit credit amount selection before checkout', () => {
    render(<ManagedCreditsCheckoutCard />);

    expect(
      screen.getByText('Choose an amount to continue.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get credits' })).toBeDisabled();
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it('blocks checkout when the email is missing', () => {
    render(<ManagedCreditsCheckoutCard />);

    fireEvent.click(screen.getByText('$10'));
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: '' },
    });

    expect(screen.getByRole('button', { name: 'Get credits' })).toBeDisabled();
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
    expect(notificationErrorMock).not.toHaveBeenCalled();
  });

  it('starts managed checkout using a custom whole-dollar amount', async () => {
    render(<ManagedCreditsCheckoutCard />);

    fireEvent.click(screen.getByText('Custom'));
    fireEvent.change(
      screen.getByLabelText('Custom credit top-up amount in dollars'),
      {
        target: { value: '250' },
      },
    );
    fireEvent.click(screen.getByText('Get credits'));

    await waitFor(() => {
      expect(createCheckoutSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'local@example.com',
          quantity: 25_000,
        }),
      );
    });
  });
});

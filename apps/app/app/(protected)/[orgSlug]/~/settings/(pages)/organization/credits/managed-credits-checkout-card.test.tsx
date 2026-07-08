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

  it('blocks checkout when the email is missing', () => {
    render(<ManagedCreditsCheckoutCard />);

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByText('Get credits'));

    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
    expect(notificationErrorMock).toHaveBeenCalledWith(
      'Add a valid email before checkout.',
    );
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

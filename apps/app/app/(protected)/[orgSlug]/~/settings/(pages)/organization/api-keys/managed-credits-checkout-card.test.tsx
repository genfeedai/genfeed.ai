// @vitest-environment jsdom

import '@testing-library/jest-dom';
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

vi.mock('@ui/card/Card', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
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
      href: 'http://localhost/settings/api-keys',
      origin: 'http://localhost',
    };
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: locationState,
    });
  });

  it('starts managed checkout using the editable email and quantity', async () => {
    render(<ManagedCreditsCheckoutCard />);

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'buyer@example.com' },
    });
    fireEvent.change(screen.getByDisplayValue('1000'), {
      target: { value: '2500' },
    });
    fireEvent.click(screen.getByText('Get Credits'));

    await waitFor(() => {
      expect(createCheckoutSessionMock).toHaveBeenCalledWith({
        cancelUrl: 'http://localhost/settings/api-keys',
        email: 'buyer@example.com',
        firstName: 'Local',
        lastName: 'User',
        quantity: 2500,
        successUrl:
          'http://localhost/managed-credits/success?session_id={CHECKOUT_SESSION_ID}',
      });
    });

    expect(locationState.href).toBe('https://checkout.stripe.test/session');
  });

  it('blocks checkout when the email or credit quantity is missing', () => {
    render(<ManagedCreditsCheckoutCard />);

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByText('Get Credits'));

    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
    expect(notificationErrorMock).toHaveBeenCalledWith(
      'Add a valid email and credit quantity before checkout.',
    );
  });
});

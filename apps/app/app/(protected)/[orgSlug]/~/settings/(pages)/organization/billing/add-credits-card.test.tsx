// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AddCreditsCard from './add-credits-card';

const { createCheckoutSessionMock, notificationErrorMock } = vi.hoisted(() => ({
  createCheckoutSessionMock: vi.fn(),
  notificationErrorMock: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    createCheckoutSession: createCheckoutSessionMock,
  }),
}));

vi.mock('@services/billing/stripe.service', () => ({
  StripeService: { getInstance: vi.fn() },
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { plans: { payg: 'price_payg_test' } },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: notificationErrorMock }),
  },
}));

vi.mock('@ui/card/Card', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@ui/layout/stack', () => ({
  VStack: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@ui/typography/heading', () => ({
  Heading: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@ui/typography/text', () => ({
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    isDisabled,
    isLoading,
    onClick,
  }: {
    children: ReactNode;
    isDisabled?: boolean;
    isLoading?: boolean;
    onClick?: () => void;
  }) => (
    <button type="button" disabled={isDisabled || isLoading} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  Input: ({
    hasError: _hasError,
    isDisabled: _isDisabled,
    isReadOnly: _isReadOnly,
    isRequired: _isRequired,
    ...props
  }: InputHTMLAttributes<HTMLInputElement> & {
    hasError?: boolean;
    isDisabled?: boolean;
    isReadOnly?: boolean;
    isRequired?: boolean;
  }) => <input {...props} />,
}));

describe('AddCreditsCard', () => {
  let locationState: { href: string; origin: string; pathname: string };

  beforeEach(() => {
    createCheckoutSessionMock.mockReset();
    notificationErrorMock.mockReset();
    createCheckoutSessionMock.mockResolvedValue({
      url: 'https://checkout.stripe.test/session',
    });

    locationState = {
      href: 'http://localhost/settings/billing',
      origin: 'http://localhost',
      pathname: '/settings/billing',
    };
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: locationState,
    });
  });

  it('renders the canonical preset amounts plus a Custom option', () => {
    render(<AddCreditsCard />);

    for (const label of ['$10', '$20', '$50', '$100', '$1,000', 'Custom']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // Defaults to the smallest preset ($10 = 1,000 credits).
    expect(screen.getByText('1,000 credits')).toBeInTheDocument();
  });

  it('updates the credit summary when a preset is selected', () => {
    render(<AddCreditsCard />);

    fireEvent.click(screen.getByText('$50'));

    expect(screen.getByText('5,000 credits')).toBeInTheDocument();
  });

  it('blocks a below-minimum custom amount with a min helper line', () => {
    render(<AddCreditsCard />);

    fireEvent.click(screen.getByText('Custom'));
    fireEvent.change(
      screen.getByLabelText('Custom credit top-up amount in dollars'),
      { target: { value: '5' } },
    );

    expect(screen.getByText('The minimum amount is $10.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add credits' })).toBeDisabled();
  });

  it('blocks an above-maximum custom amount with a max helper line', () => {
    render(<AddCreditsCard />);

    fireEvent.click(screen.getByText('Custom'));
    fireEvent.change(
      screen.getByLabelText('Custom credit top-up amount in dollars'),
      { target: { value: '20000' } },
    );

    expect(
      screen.getByText(
        'The maximum amount is $10,000. For a larger top-up, contact support.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add credits' })).toBeDisabled();
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it('starts PAYG checkout with dollars mapped to credits (× 100)', async () => {
    render(<AddCreditsCard />);

    fireEvent.click(screen.getByText('Custom'));
    fireEvent.change(
      screen.getByLabelText('Custom credit top-up amount in dollars'),
      { target: { value: '250' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add credits' }));

    await waitFor(() => {
      expect(createCheckoutSessionMock).toHaveBeenCalledWith({
        cancelUrl: 'http://localhost/settings/billing',
        quantity: 25_000,
        stripePriceId: 'price_payg_test',
        successUrl: 'http://localhost/settings/billing?credits=success',
      });
    });

    expect(locationState.href).toBe('https://checkout.stripe.test/session');
  });
});

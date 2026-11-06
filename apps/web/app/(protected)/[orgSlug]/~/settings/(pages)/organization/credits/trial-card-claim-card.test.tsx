// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TrialCardClaimCard from './trial-card-claim-card';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

const {
  claimTrialCardMock,
  createTrialCardCheckoutMock,
  getTrialCardStatusMock,
  loggerErrorMock,
  notificationErrorMock,
  notificationSuccessMock,
  replaceMock,
  searchParamsState,
} = vi.hoisted(() => ({
  claimTrialCardMock: vi.fn(),
  createTrialCardCheckoutMock: vi.fn(),
  getTrialCardStatusMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  notificationErrorMock: vi.fn(),
  notificationSuccessMock: vi.fn(),
  replaceMock: vi.fn(),
  searchParamsState: { value: '' },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/~/settings/credits',
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(searchParamsState.value),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    claimTrialCard: claimTrialCardMock,
    createTrialCardCheckout: createTrialCardCheckoutMock,
    getTrialCardStatus: getTrialCardStatusMock,
  }),
}));

vi.mock('@services/billing/stripe.service', () => ({
  StripeService: { getInstance: vi.fn() },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: loggerErrorMock },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: notificationErrorMock,
      success: notificationSuccessMock,
    }),
  },
}));

vi.mock('@ui/card/Card', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    isLoading,
    onClick,
  }: {
    children: ReactNode;
    isLoading?: boolean;
    onClick?: () => void;
  }) => (
    <button type="button" disabled={isLoading} onClick={onClick}>
      {children}
    </button>
  ),
}));

describe('TrialCardClaimCard', () => {
  let locationState: { href: string; pathname: string };

  beforeEach(() => {
    for (const mock of [
      claimTrialCardMock,
      createTrialCardCheckoutMock,
      getTrialCardStatusMock,
      loggerErrorMock,
      notificationErrorMock,
      notificationSuccessMock,
      replaceMock,
    ]) {
      mock.mockReset();
    }
    searchParamsState.value = '';
    getTrialCardStatusMock.mockResolvedValue({ status: 'claimable' });
    createTrialCardCheckoutMock.mockResolvedValue({
      url: 'https://checkout.stripe.test/setup',
    });
    locationState = {
      href: 'http://localhost/acme/~/settings/credits',
      pathname: '/acme/~/settings/credits',
    };
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: locationState,
    });
  });

  it('offers the card step while the trial credits are claimable', async () => {
    render(<TrialCardClaimCard />);

    expect(
      await screen.findByText('Unlock 75 free credits'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add card' })).toBeEnabled();
  });

  it.each(['claimed', 'unavailable'])(
    'renders nothing when %s',
    async (status) => {
      getTrialCardStatusMock.mockResolvedValue({ status });

      const { container } = render(<TrialCardClaimCard />);

      await waitFor(() => expect(getTrialCardStatusMock).toHaveBeenCalled());
      expect(container).toBeEmptyDOMElement();
    },
  );

  it('sends the user to Stripe card setup and back to the same page', async () => {
    render(<TrialCardClaimCard />);

    fireEvent.click(await screen.findByRole('button', { name: 'Add card' }));

    await waitFor(() => {
      expect(createTrialCardCheckoutMock).toHaveBeenCalledWith(
        '/acme/~/settings/credits',
      );
    });
    expect(locationState.href).toBe('https://checkout.stripe.test/setup');
  });

  it('reports a card setup that could not start', async () => {
    createTrialCardCheckoutMock.mockRejectedValue(new Error('down'));
    render(<TrialCardClaimCard />);

    fireEvent.click(await screen.findByRole('button', { name: 'Add card' }));

    await waitFor(() => {
      expect(notificationErrorMock).toHaveBeenCalledWith(
        "We couldn't open card setup. Please try again.",
      );
    });
  });

  describe('returning from Stripe', () => {
    beforeEach(() => {
      searchParamsState.value = 'trialCard=success&session_id=cs_test_1';
    });

    it('claims the credits, refreshes the balance and cleans the URL', async () => {
      claimTrialCardMock.mockResolvedValue({ outcome: 'granted' });
      const onClaimed = vi.fn();

      render(<TrialCardClaimCard onClaimed={onClaimed} />);

      await waitFor(() => expect(onClaimed).toHaveBeenCalledTimes(1));
      expect(claimTrialCardMock).toHaveBeenCalledWith(
        'cs_test_1',
        expect.any(AbortSignal),
      );
      expect(notificationSuccessMock).toHaveBeenCalledWith(
        '75 free credits added to your balance.',
      );
      expect(replaceMock).toHaveBeenCalledWith('/acme/~/settings/credits');
      expect(getTrialCardStatusMock).not.toHaveBeenCalled();
    });

    it('explains a card that another account already used and lets the user retry', async () => {
      claimTrialCardMock.mockResolvedValue({ outcome: 'card-already-used' });

      render(<TrialCardClaimCard />);

      await waitFor(() => {
        expect(notificationErrorMock).toHaveBeenCalledWith(
          'This card has already unlocked free credits on another account.',
        );
      });
      expect(
        await screen.findByRole('button', { name: 'Add card' }),
      ).toBeEnabled();
    });

    it('reports a claim that failed without crediting', async () => {
      claimTrialCardMock.mockRejectedValue(new Error('down'));
      const onClaimed = vi.fn();

      render(<TrialCardClaimCard onClaimed={onClaimed} />);

      await waitFor(() => {
        expect(notificationErrorMock).toHaveBeenCalledWith(
          "We couldn't unlock your free credits. Please try again.",
        );
      });
      expect(onClaimed).not.toHaveBeenCalled();
    });
  });
});

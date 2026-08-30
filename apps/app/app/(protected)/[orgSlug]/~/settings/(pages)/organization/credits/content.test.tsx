import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsCreditsPage from './content';

const {
  hasOrganizationBillingMock,
  isSelfHostedMock,
  paygMock,
  useSubscriptionMock,
} = vi.hoisted(() => ({
  hasOrganizationBillingMock: vi.fn(),
  isSelfHostedMock: vi.fn(),
  paygMock: vi.fn(),
  useSubscriptionMock: vi.fn(),
}));

vi.mock('@genfeedai/config/deployment', () => ({
  isSelfHostedDeployment: () => isSelfHostedMock(),
}));

vi.mock('@genfeedai/config/license', () => ({
  hasOrganizationBillingHint: () => hasOrganizationBillingMock(),
}));

vi.mock('@hooks/data/subscription/use-subscription/use-subscription', () => ({
  useSubscription: () => useSubscriptionMock(),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    plans: {
      get payg() {
        return paygMock();
      },
    },
  },
}));

vi.mock('../billing/add-credits-card', () => ({
  default: () => <div data-testid="hosted-credits-card">Hosted credits</div>,
}));

vi.mock('./managed-credits-checkout-card', () => ({
  default: () => <div data-testid="managed-credits-card">Managed credits</div>,
}));

vi.mock('./referral-hub-card', () => ({
  default: () => <div data-testid="referral-hub-card">Referral hub</div>,
}));

function renderCreditsPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsCreditsPage />
    </QueryClientProvider>,
  );
}

describe('SettingsCreditsPage', () => {
  beforeEach(() => {
    isSelfHostedMock.mockReset();
    hasOrganizationBillingMock.mockReset();
    paygMock.mockReset();
    useSubscriptionMock.mockReset();
    isSelfHostedMock.mockReturnValue(true);
    hasOrganizationBillingMock.mockReturnValue(false);
    paygMock.mockReturnValue(undefined);
    useSubscriptionMock.mockReturnValue({
      creditsBreakdown: null,
      isLoading: false,
    });
  });

  it('renders section chrome immediately while the subscription query loads', () => {
    useSubscriptionMock.mockReturnValue({
      creditsBreakdown: null,
      isLoading: true,
    });

    renderCreditsPage();

    expect(screen.getByRole('heading', { name: 'Credits' })).toHaveClass(
      'sr-only',
    );
    expect(screen.getByTestId('managed-credits-card')).toBeInTheDocument();
    expect(screen.getByTestId('credits-balance-loading')).toBeInTheDocument();
    expect(screen.queryByText('Credits Left')).not.toBeInTheDocument();
  });

  it('renders managed credits for self-hosted installs', () => {
    renderCreditsPage();

    expect(screen.getByRole('heading', { name: 'Credits' })).toHaveClass(
      'sr-only',
    );
    expect(screen.getByTestId('managed-credits-card')).toBeInTheDocument();
    expect(screen.queryByTestId('hosted-credits-card')).not.toBeInTheDocument();
  });

  it('renders hosted credit top-ups for hosted installs', () => {
    isSelfHostedMock.mockReturnValue(false);

    renderCreditsPage();

    expect(screen.getByTestId('hosted-credits-card')).toBeInTheDocument();
    expect(
      screen.queryByTestId('managed-credits-card'),
    ).not.toBeInTheDocument();
  });

  it('renders referral rewards when organization billing is enabled', () => {
    isSelfHostedMock.mockReturnValue(false);
    hasOrganizationBillingMock.mockReturnValue(true);

    renderCreditsPage();

    expect(screen.getByTestId('referral-hub-card')).toBeInTheDocument();
  });
});

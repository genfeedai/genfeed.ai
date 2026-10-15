import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsCreditsPage from './content';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

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

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ orgHref: (path: string) => `/acme/~${path}` }),
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

  it('explains balance failures without showing stale totals or private errors', () => {
    useSubscriptionMock.mockReturnValue({
      creditsBreakdown: { total: 5461.8 },
      error: 'private provider response',
      isLoading: false,
      refreshCreditsBreakdown: vi.fn(),
    });

    renderCreditsPage();

    expect(
      screen.getByText('Your credit balance could not be loaded.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/5,461\.8/)).not.toBeInTheDocument();
    expect(
      screen.queryByText('private provider response'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('managed-credits-card')).toBeInTheDocument();
  });

  it('disables balance retry until the read settles', async () => {
    let finishRetry: (() => void) | undefined;
    const refreshCreditsBreakdown = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRetry = resolve;
        }),
    );
    useSubscriptionMock.mockReturnValue({
      creditsBreakdown: null,
      error: 'Temporarily unavailable',
      isLoading: false,
      refreshCreditsBreakdown,
    });

    renderCreditsPage();
    const retry = screen.getByRole('button', { name: 'Retry balance' });
    fireEvent.click(retry);
    fireEvent.click(retry);
    expect(refreshCreditsBreakdown).toHaveBeenCalledTimes(1);
    expect(retry).toBeDisabled();
    finishRetry?.();
    await waitFor(() => expect(retry).toBeEnabled());
  });

  it('renders hosted credit top-ups for hosted installs', () => {
    isSelfHostedMock.mockReturnValue(false);

    renderCreditsPage();

    expect(screen.getByTestId('hosted-credits-card')).toBeInTheDocument();
    expect(
      screen.queryByTestId('managed-credits-card'),
    ).not.toBeInTheDocument();
  });

  it('links to the dedicated referrals page when organization billing is enabled', () => {
    isSelfHostedMock.mockReturnValue(false);
    hasOrganizationBillingMock.mockReturnValue(true);

    renderCreditsPage();

    expect(
      screen.getByRole('link', { name: 'View referrals' }),
    ).toHaveAttribute('href', '/acme/~/settings/referrals');
    expect(screen.queryByLabelText('Referral link')).not.toBeInTheDocument();
  });

  it('shows the remaining balance as a progress bar against the cycle total', () => {
    useSubscriptionMock.mockReturnValue({
      creditsBreakdown: {
        credits: [],
        cycleTotal: 6000,
        planLimit: 5900,
        remainingPercent: 91.03,
        total: 5461.8,
      },
      isLoading: false,
    });

    renderCreditsPage();

    const progress = screen.getByRole('progressbar', {
      name: 'Credits left this cycle',
    });
    expect(progress).toHaveAttribute('aria-valuenow', '91.03');
    expect(screen.getByText('91%')).toBeInTheDocument();
    expect(screen.getByText(/5,461\.8/)).toBeInTheDocument();
    expect(screen.getByText(/of 6,000/)).toBeInTheDocument();
  });
});

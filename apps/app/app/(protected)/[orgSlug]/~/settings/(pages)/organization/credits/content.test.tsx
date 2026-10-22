import type { IDesktopRuntimeContext } from '@genfeedai/contracts/desktop';
import type { DesktopRuntimeSnapshot } from '@genfeedai/services/core/desktop-runtime.service';
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
  hostedCheckoutMock,
  managedCheckoutMock,
} = vi.hoisted(() => ({
  hasOrganizationBillingMock: vi.fn(),
  isSelfHostedMock: vi.fn(),
  paygMock: vi.fn(),
  useSubscriptionMock: vi.fn(),
  hostedCheckoutMock: vi.fn(),
  managedCheckoutMock: vi.fn(),
}));

vi.mock('@genfeedai/config/deployment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/config/deployment')>()),
  isSelfHostedDeployment: () => isSelfHostedMock(),
  isSaaS: () => !isSelfHostedMock(),
}));

vi.mock('@genfeedai/config/license', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/config/license')>()),
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
  default: () => {
    hostedCheckoutMock();
    return <div data-testid="hosted-credits-card">Hosted credits</div>;
  },
}));

vi.mock('./managed-credits-checkout-card', () => ({
  default: () => {
    managedCheckoutMock();
    return <div data-testid="managed-credits-card">Managed credits</div>;
  },
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ orgHref: (path: string) => `/acme/~${path}` }),
}));

function renderCreditsPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(<SettingsCreditsPage />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

describe('SettingsCreditsPage', () => {
  beforeEach(() => {
    mockCreditsRuntime.mockReturnValue({ status: 'web', context: null });
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

const mockCreditsRuntime = vi.hoisted(() =>
  vi.fn<() => DesktopRuntimeSnapshot>(),
);
vi.mock(
  '@genfeedai/hooks/ui/use-desktop-runtime-context/use-desktop-runtime-context',
  () => ({
    useDesktopRuntimeContext: mockCreditsRuntime,
  }),
);

const creditsCloudContext: IDesktopRuntimeContext = {
  version: 1,
  runtimeId: 'credits-runtime',
  revision: 1,
  status: 'ready',
  selectedServerId: 'credits-cloud',
  selectedServerKind: 'cloud',
  selectedApiEndpoint: 'https://example.invalid/v1',
  runtimeMode: 'cloud',
  generationExecution: 'remote',
  localProvider: null,
};
const creditsLocalContext: IDesktopRuntimeContext = {
  ...creditsCloudContext,
  revision: 2,
  runtimeMode: 'local',
  generationExecution: 'local-byok',
  localProvider: { provider: 'ollama', networkAccess: 'local' },
};
const creditsRuntimeCases = [
  {
    name: 'cloud web',
    runtime: { status: 'web', context: null },
    allowed: true,
    selfHosted: false,
    billing: true,
    price: undefined,
  },
  {
    name: 'community self-host web',
    runtime: { status: 'web', context: null },
    allowed: true,
    selfHosted: true,
    billing: false,
    price: undefined,
  },
  {
    name: 'licensed self-host web',
    runtime: { status: 'web', context: null },
    allowed: true,
    selfHosted: true,
    billing: true,
    price: undefined,
  },
  {
    name: 'configured PAYG self-host web',
    runtime: { status: 'web', context: null },
    allowed: true,
    selfHosted: true,
    billing: false,
    price: 'price_fixture',
  },
  {
    name: 'confirmed desktop cloud without billing hint',
    runtime: { status: 'ready', context: creditsCloudContext },
    allowed: true,
    selfHosted: false,
    billing: false,
    price: undefined,
  },
  {
    name: 'local Ollama with remembered cloud and billing hint',
    runtime: { status: 'ready', context: creditsLocalContext },
    allowed: false,
    selfHosted: false,
    billing: true,
    price: undefined,
  },
  {
    name: 'local Replicate with remote network',
    runtime: {
      status: 'ready',
      context: {
        ...creditsLocalContext,
        localProvider: { provider: 'replicate', networkAccess: 'remote' },
      },
    },
    allowed: false,
    selfHosted: false,
    billing: true,
    price: undefined,
  },
  {
    name: 'local unknown execution',
    runtime: {
      status: 'ready',
      context: {
        ...creditsLocalContext,
        generationExecution: 'unknown',
        localProvider: null,
      },
    },
    allowed: false,
    selfHosted: true,
    billing: true,
    price: undefined,
  },
  {
    name: 'desktop self-host server',
    runtime: {
      status: 'ready',
      context: {
        ...creditsCloudContext,
        selectedServerId: 'credits-self-host',
        selectedServerKind: 'self-hosted',
      },
    },
    allowed: false,
    selfHosted: true,
    billing: true,
    price: undefined,
  },
  {
    name: 'cloud execution unconfirmed',
    runtime: {
      status: 'ready',
      context: { ...creditsCloudContext, generationExecution: 'unknown' },
    },
    allowed: false,
    selfHosted: false,
    billing: true,
    price: undefined,
  },
  {
    name: 'loading',
    runtime: { status: 'loading', context: null },
    allowed: false,
    selfHosted: false,
    billing: true,
    price: undefined,
  },
  {
    name: 'unavailable',
    runtime: { status: 'unavailable', context: null },
    allowed: false,
    selfHosted: false,
    billing: true,
    price: undefined,
  },
  {
    name: 'switching with old cloud context',
    runtime: { status: 'switching', context: creditsCloudContext },
    allowed: false,
    selfHosted: false,
    billing: true,
    price: undefined,
  },
] satisfies {
  name: string;
  runtime: DesktopRuntimeSnapshot;
  allowed: boolean;
  selfHosted: boolean;
  billing: boolean;
  price: string | undefined;
}[];
const creditsRuntimeTransitions: DesktopRuntimeSnapshot[] = [
  { status: 'loading', context: null },
  { status: 'ready', context: creditsLocalContext },
  { status: 'ready', context: creditsCloudContext },
  { status: 'switching', context: creditsCloudContext },
  { status: 'ready', context: creditsLocalContext },
  { status: 'ready', context: creditsCloudContext },
];

describe('desktop Credits route boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSelfHostedMock.mockReturnValue(false);
    hasOrganizationBillingMock.mockReturnValue(true);
    paygMock.mockReturnValue(undefined);
    useSubscriptionMock.mockReturnValue({
      creditsBreakdown: { total: 750, cycleTotal: 1000 },
      error: 'unavailable',
      isLoading: false,
      refreshCreditsBreakdown: vi.fn(),
    });
  });
  function expectDenied() {
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Credits unavailable');
    expect(status).toHaveTextContent(
      'Credits are unavailable for the current runtime.',
    );
    expect(
      screen.getByRole('heading', { name: 'Credits', level: 1 }),
    ).toHaveClass('sr-only');
    expect(useSubscriptionMock).not.toHaveBeenCalled();
    expect(hostedCheckoutMock).not.toHaveBeenCalled();
    expect(managedCheckoutMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('hosted-credits-card')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('managed-credits-card'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry balance' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'View referrals' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Your credit balance could not be loaded.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Credits Left')).not.toBeInTheDocument();
  }
  it.each(creditsRuntimeCases)(
    '$name',
    ({ runtime, allowed, selfHosted, billing, price }) => {
      mockCreditsRuntime.mockReturnValue(runtime);
      isSelfHostedMock.mockReturnValue(selfHosted);
      hasOrganizationBillingMock.mockReturnValue(billing);
      paygMock.mockReturnValue(price);
      const { unmount } = renderCreditsPage();
      if (allowed) {
        expect(useSubscriptionMock).toHaveBeenCalled();
        const managed = selfHosted && !billing && !price;
        expect(
          screen.getByTestId(
            managed ? 'managed-credits-card' : 'hosted-credits-card',
          ),
        ).toBeInTheDocument();
        expect(
          managed ? managedCheckoutMock : hostedCheckoutMock,
        ).toHaveBeenCalled();
        expect(
          screen.getByRole('button', { name: 'Retry balance' }),
        ).toBeInTheDocument();
        expect(
          Boolean(screen.queryByRole('link', { name: 'View referrals' })),
        ).toBe(billing);
      } else expectDenied();
      unmount();
    },
  );
  it('unmounts data during denied transitions and remounts it when cloud is confirmed', () => {
    mockCreditsRuntime.mockReturnValue(creditsRuntimeTransitions[0]);
    const { rerender, unmount } = renderCreditsPage();
    expectDenied();
    creditsRuntimeTransitions.slice(1).forEach((runtime, offset) => {
      useSubscriptionMock.mockClear();
      hostedCheckoutMock.mockClear();
      managedCheckoutMock.mockClear();
      mockCreditsRuntime.mockReturnValue(runtime);
      rerender(<SettingsCreditsPage />);
      if (offset === 1 || offset === 4) {
        expect(useSubscriptionMock).toHaveBeenCalled();
        expect(hostedCheckoutMock).toHaveBeenCalled();
        expect(screen.getByTestId('hosted-credits-card')).toBeInTheDocument();
      } else expectDenied();
    });
    unmount();
  });
});

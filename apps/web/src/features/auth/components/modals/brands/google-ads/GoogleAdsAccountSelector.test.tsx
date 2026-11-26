import { queryClientWrapper } from '@app-tests/query-client.harness';
import {
  fireEvent,
  render as renderWithoutClient,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GoogleAdsAccountSelector from '@/features/auth/components/modals/brands/google-ads/GoogleAdsAccountSelector';

const mockServices = vi.hoisted(() => ({
  getGoogleAdsAccounts: vi.fn(),
  postSelectGoogleAdsAccount: vi.fn(),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('mock-token'),
}));

// A real class keeps `new` semantics; an automock arrow function would make
// the component report a TypeError as an ordinary load failure.
vi.mock('@genfeedai/services/external/services.service', () => ({
  ServicesService: class {
    getGoogleAdsAccounts(...args: unknown[]) {
      return mockServices.getGoogleAdsAccounts(...args);
    }
    postSelectGoogleAdsAccount(...args: unknown[]) {
      return mockServices.postSelectGoogleAdsAccount(...args);
    }
  },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

function render(ui: ReactElement) {
  return renderWithoutClient(ui, { wrapper: queryClientWrapper() });
}

const CLIENT = {
  id: '318-402-9951',
  isAlreadyConnected: false,
  managerId: '220-767-1117',
  managerName: 'Genfeed.ai Manager',
  name: 'Genfeed.ai',
};
const OWN = {
  id: '492-777-9074',
  isAlreadyConnected: true,
  name: 'Second brand',
};

describe('GoogleAdsAccountSelector', () => {
  const credentialId = 'credential-pending-1';

  beforeEach(() => {
    mockServices.getGoogleAdsAccounts = vi
      .fn()
      .mockResolvedValue([CLIENT, OWN]);
    mockServices.postSelectGoogleAdsAccount = vi.fn();
  });

  it('lists accounts under their manager and flags one the brand already holds', async () => {
    render(
      <GoogleAdsAccountSelector
        credentialId={credentialId}
        onConnected={vi.fn()}
      />,
    );

    expect(await screen.findByText('Genfeed.ai Manager')).toBeInTheDocument();
    expect(screen.getByText('Manager')).toBeInTheDocument();
    expect(screen.getByText('318-402-9951')).toBeInTheDocument();
    expect(screen.getByText('Your accounts')).toBeInTheDocument();
    expect(screen.getByText('Second brand')).toBeInTheDocument();
    expect(screen.getAllByText('Already connected')).toHaveLength(1);
    expect(mockServices.getGoogleAdsAccounts).toHaveBeenCalledWith(
      credentialId,
      expect.any(AbortSignal),
    );
  });

  it('keeps Connect disabled until an account is picked', async () => {
    render(
      <GoogleAdsAccountSelector
        credentialId={credentialId}
        onConnected={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole('button', { name: 'Connect account' }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: /Genfeed\.ai/ }));

    expect(
      screen.getByRole('button', { name: 'Connect account' }),
    ).toBeEnabled();
  });

  it('posts only the picked customer id and reports the connected account', async () => {
    const onConnected = vi.fn();
    mockServices.postSelectGoogleAdsAccount.mockResolvedValue({
      externalAvatar: undefined,
      externalHandle: '3184029951',
      externalName: 'Genfeed.ai',
    });
    render(
      <GoogleAdsAccountSelector
        credentialId={credentialId}
        onConnected={onConnected}
      />,
    );

    fireEvent.click(await screen.findByRole('radio', { name: /Genfeed\.ai/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect account' }));

    await waitFor(() =>
      expect(onConnected).toHaveBeenCalledWith({
        avatarUrl: undefined,
        name: 'Genfeed.ai',
      }),
    );
    expect(mockServices.postSelectGoogleAdsAccount).toHaveBeenCalledWith(
      credentialId,
      '318-402-9951',
    );
  });

  it('keeps the pick and reports a failed connect', async () => {
    const onError = vi.fn();
    mockServices.postSelectGoogleAdsAccount.mockRejectedValue(
      new Error('refused'),
    );
    render(
      <GoogleAdsAccountSelector
        credentialId={credentialId}
        onConnected={vi.fn()}
        onError={onError}
      />,
    );

    fireEvent.click(await screen.findByRole('radio', { name: /Genfeed\.ai/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect account' }));

    expect(
      await screen.findByText(
        'Failed to connect this account. Please try again.',
      ),
    ).toBeInTheDocument();
    expect(onError).toHaveBeenCalledWith(
      'Failed to connect this account. Please try again.',
    );
    expect(screen.getByRole('radio', { name: /Genfeed\.ai/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('offers Try again and Go back when the list cannot load', async () => {
    const onBack = vi.fn();
    mockServices.getGoogleAdsAccounts = vi
      .fn()
      .mockRejectedValue(new Error('down'));
    render(
      <GoogleAdsAccountSelector
        credentialId={credentialId}
        onBack={onBack}
        onConnected={vi.fn()}
      />,
    );

    expect(
      await screen.findByText('Failed to load accounts. Please try again.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText('Go back'));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it('says so when the login reaches no account', async () => {
    mockServices.getGoogleAdsAccounts = vi.fn().mockResolvedValue([]);
    render(
      <GoogleAdsAccountSelector
        credentialId={credentialId}
        onConnected={vi.fn()}
      />,
    );

    expect(
      await screen.findByText(
        'No Google Ads accounts were found for this Google login.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Connect account' }),
    ).not.toBeInTheDocument();
  });

  it('cancels without saving', async () => {
    const onBack = vi.fn();
    render(
      <GoogleAdsAccountSelector
        credentialId={credentialId}
        onBack={onBack}
        onConnected={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mockServices.postSelectGoogleAdsAccount).not.toHaveBeenCalled();
  });
});

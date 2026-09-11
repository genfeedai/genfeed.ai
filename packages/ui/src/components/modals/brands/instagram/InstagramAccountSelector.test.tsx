import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import InstagramAccountSelector from '@ui/modals/brands/instagram/InstagramAccountSelector';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCredentialsService: {
  findCredentialInstagramPages: ReturnType<typeof vi.fn>;
} = {
  findCredentialInstagramPages: vi.fn(),
};

const mockServicesService: {
  postSelectAccount: ReturnType<typeof vi.fn>;
} = {
  postSelectAccount: vi.fn(),
};

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('mock-token'),
}));

vi.mock('@genfeedai/services/organization/credentials.service', () => ({
  CredentialsService: { getInstance: vi.fn(() => mockCredentialsService) },
}));

vi.mock('@genfeedai/services/external/services.service', () => ({
  ServicesService: vi.fn(() => mockServicesService),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('InstagramAccountSelector', () => {
  const credentialId = 'credential-pending-123';

  const candidateAccounts = [
    {
      id: 'ig-account-1',
      image: 'https://cdn.example.com/one.jpg',
      label: 'Genfeed AI',
      username: 'genfeedai',
    },
    {
      id: 'ig-account-2',
      image: 'https://cdn.example.com/two.jpg',
      label: 'Genfeed Studio',
      username: 'genfeedstudio',
    },
  ];

  beforeEach(() => {
    mockCredentialsService.findCredentialInstagramPages = vi.fn();
    mockServicesService.postSelectAccount = vi.fn();
  });

  it('lists every candidate account returned for this credential', async () => {
    mockCredentialsService.findCredentialInstagramPages.mockResolvedValue(
      candidateAccounts,
    );

    render(
      <InstagramAccountSelector
        credentialId={credentialId}
        onConnected={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Genfeed AI')).toBeInTheDocument();
      expect(screen.getByText('Genfeed Studio')).toBeInTheDocument();
    });
    expect(
      mockCredentialsService.findCredentialInstagramPages,
    ).toHaveBeenCalledWith(credentialId, expect.any(AbortSignal));
  });

  it('falls back to a platform icon when an account has no avatar', async () => {
    mockCredentialsService.findCredentialInstagramPages.mockResolvedValue([
      { id: 'ig-no-avatar', label: 'No Avatar', username: 'noavatar' },
    ]);

    render(
      <InstagramAccountSelector
        credentialId={credentialId}
        onConnected={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('No Avatar')).toBeInTheDocument();
    });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows the empty state with retry and back actions', async () => {
    const onBack = vi.fn();
    mockCredentialsService.findCredentialInstagramPages.mockResolvedValue([]);

    render(
      <InstagramAccountSelector
        credentialId={credentialId}
        onBack={onBack}
        onConnected={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText('No eligible accounts were found.'),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Go back'));
    expect(onBack).toHaveBeenCalled();

    mockCredentialsService.findCredentialInstagramPages.mockResolvedValue(
      candidateAccounts,
    );
    fireEvent.click(screen.getByText('Try again'));

    await waitFor(() => {
      expect(screen.getByText('Genfeed AI')).toBeInTheDocument();
    });
    expect(
      mockCredentialsService.findCredentialInstagramPages,
    ).toHaveBeenCalledTimes(2);
  });

  it('reports a load failure through onError and offers retry', async () => {
    const onError = vi.fn();
    mockCredentialsService.findCredentialInstagramPages.mockRejectedValueOnce(
      new Error('network down'),
    );

    render(
      <InstagramAccountSelector
        credentialId={credentialId}
        onConnected={vi.fn()}
        onError={onError}
      />,
    );

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(
        'Failed to load accounts. Please try again.',
      );
    });

    mockCredentialsService.findCredentialInstagramPages.mockResolvedValueOnce(
      candidateAccounts,
    );
    fireEvent.click(screen.getByText('Try again'));

    await waitFor(() => {
      expect(screen.getByText('Genfeed AI')).toBeInTheDocument();
    });
  });

  it('disables the confirm action until an account is selected', async () => {
    mockCredentialsService.findCredentialInstagramPages.mockResolvedValue(
      candidateAccounts,
    );

    render(
      <InstagramAccountSelector
        credentialId={credentialId}
        onConnected={vi.fn()}
      />,
    );

    const confirmButton = await screen.findByText('Use this account');
    expect(confirmButton).toBeDisabled();
  });

  it('confirms the selection through the select-account endpoint, never the generic PATCH', async () => {
    const onConnected = vi.fn();
    mockCredentialsService.findCredentialInstagramPages.mockResolvedValue(
      candidateAccounts,
    );
    mockServicesService.postSelectAccount.mockResolvedValue({});

    render(
      <InstagramAccountSelector
        credentialId={credentialId}
        onConnected={onConnected}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Genfeed Studio')).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByText('Genfeed Studio').closest('button') as HTMLElement,
    );

    const confirmButton = screen.getByText('Use this account');
    await waitFor(() => expect(confirmButton).not.toBeDisabled());
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockServicesService.postSelectAccount).toHaveBeenCalledWith(
        credentialId,
        'ig-account-2',
      );
      expect(onConnected).toHaveBeenCalled();
    });
  });

  it('reports a persist failure through onError and keeps the selection', async () => {
    const onError = vi.fn();
    mockCredentialsService.findCredentialInstagramPages.mockResolvedValue(
      candidateAccounts,
    );
    mockServicesService.postSelectAccount.mockRejectedValue(
      new Error('persist failed'),
    );

    render(
      <InstagramAccountSelector
        credentialId={credentialId}
        onConnected={vi.fn()}
        onError={onError}
      />,
    );

    const account = await screen.findByText('Genfeed AI');
    fireEvent.click(account.closest('button') as HTMLElement);

    const confirmButton = screen.getByText('Use this account');
    await waitFor(() => expect(confirmButton).not.toBeDisabled());
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(
        'Failed to connect this account. Please try again.',
      );
    });
  });
});

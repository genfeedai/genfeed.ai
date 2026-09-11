import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import InstagramAccountSelector from '@ui/modals/brands/instagram/InstagramAccountSelector';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCredentialsService: {
  findCredentialInstagramPages: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
} = {
  findCredentialInstagramPages: vi.fn(),
  patch: vi.fn(),
};

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => mockCredentialsService,
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
    mockCredentialsService.patch = vi.fn();
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

  it('shows the empty state when no eligible account is returned', async () => {
    mockCredentialsService.findCredentialInstagramPages.mockResolvedValue([]);

    render(
      <InstagramAccountSelector
        credentialId={credentialId}
        onConnected={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText('No eligible accounts were found.'),
      ).toBeInTheDocument();
    });
  });

  it('reports a load failure through onError', async () => {
    const onError = vi.fn();
    mockCredentialsService.findCredentialInstagramPages.mockRejectedValue(
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

  it('persists the selected account through the credential update path and reports success', async () => {
    const onConnected = vi.fn();
    mockCredentialsService.findCredentialInstagramPages.mockResolvedValue(
      candidateAccounts,
    );
    mockCredentialsService.patch.mockResolvedValue({});

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
      expect(mockCredentialsService.patch).toHaveBeenCalledWith(credentialId, {
        externalAvatar: 'https://cdn.example.com/two.jpg',
        externalHandle: 'genfeedstudio',
        externalId: 'ig-account-2',
        externalName: 'Genfeed Studio',
      });
      expect(onConnected).toHaveBeenCalled();
    });
  });

  it('reports a persist failure through onError and keeps the selection', async () => {
    const onError = vi.fn();
    mockCredentialsService.findCredentialInstagramPages.mockResolvedValue(
      candidateAccounts,
    );
    mockCredentialsService.patch.mockRejectedValue(new Error('persist failed'));

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

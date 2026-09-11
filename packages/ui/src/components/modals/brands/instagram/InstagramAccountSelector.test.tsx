import { useAuth } from '@genfeedai/auth-client/react';
import { CredentialsService } from '@genfeedai/services/organization/credentials.service';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import InstagramAccountSelector from '@ui/modals/brands/instagram/InstagramAccountSelector';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/auth-client/react');
vi.mock('@genfeedai/services/organization/credentials.service');
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('InstagramAccountSelector', () => {
  const mockGetToken = vi.fn();
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
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      getToken: mockGetToken,
    } as ReturnType<typeof useAuth>);
    mockGetToken.mockResolvedValue('mock-token');
  });

  it('lists every candidate account returned for this credential', async () => {
    const mockCredentialsService = {
      findCredentialInstagramPages: vi
        .fn()
        .mockResolvedValue(candidateAccounts),
    };
    vi.mocked(CredentialsService.getInstance).mockReturnValue(
      mockCredentialsService as unknown as CredentialsService,
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
    const mockCredentialsService = {
      findCredentialInstagramPages: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(CredentialsService.getInstance).mockReturnValue(
      mockCredentialsService as unknown as CredentialsService,
    );

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
    const mockCredentialsService = {
      findCredentialInstagramPages: vi
        .fn()
        .mockRejectedValue(new Error('network down')),
    };
    vi.mocked(CredentialsService.getInstance).mockReturnValue(
      mockCredentialsService as unknown as CredentialsService,
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
    const mockCredentialsService = {
      findCredentialInstagramPages: vi
        .fn()
        .mockResolvedValue(candidateAccounts),
    };
    vi.mocked(CredentialsService.getInstance).mockReturnValue(
      mockCredentialsService as unknown as CredentialsService,
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
    const patchMock = vi.fn().mockResolvedValue({});
    const mockCredentialsService = {
      findCredentialInstagramPages: vi
        .fn()
        .mockResolvedValue(candidateAccounts),
      patch: patchMock,
    };
    vi.mocked(CredentialsService.getInstance).mockReturnValue(
      mockCredentialsService as unknown as CredentialsService,
    );

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
      expect(patchMock).toHaveBeenCalledWith(credentialId, {
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
    const patchMock = vi.fn().mockRejectedValue(new Error('persist failed'));
    const mockCredentialsService = {
      findCredentialInstagramPages: vi
        .fn()
        .mockResolvedValue(candidateAccounts),
      patch: patchMock,
    };
    vi.mocked(CredentialsService.getInstance).mockReturnValue(
      mockCredentialsService as unknown as CredentialsService,
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

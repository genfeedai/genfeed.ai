import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import type { QueryClient } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render as renderWithoutClient,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import InstagramAccountSelector from '@/features/auth/components/modals/brands/instagram/InstagramAccountSelector';

const mockCredentialsService: {
  findCredentialInstagramPages: ReturnType<typeof vi.fn>;
} = vi.hoisted(() => ({
  findCredentialInstagramPages: vi.fn(),
}));

const mockServicesService: {
  postSelectAccounts: Mock<(...args: unknown[]) => unknown>;
} = vi.hoisted(() => ({
  postSelectAccounts: vi.fn(),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('mock-token'),
}));

// `ServicesService` is instantiated with `new` by the component. A bare
// `vi.mock(...)` automock replaces the class with an arrow function, and
// `new <arrow fn>()` throws — the component's own catch block reports that
// TypeError as the same generic "failed to load/connect" error a real
// rejection produces, so a broken mock and a real bug look identical. A real
// (if minimal) class, mirroring BrandDetailSocialMediaCard.test.tsx, keeps
// `new` semantics intact while still routing calls through the shared mock.
vi.mock('@genfeedai/services/external/services.service', () => ({
  ServicesService: class {
    postSelectAccounts(...args: unknown[]) {
      return mockServicesService.postSelectAccounts(...args);
    }
  },
}));

vi.mock('@genfeedai/services/organization/credentials.service', () => ({
  CredentialsService: { getInstance: () => mockCredentialsService },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

function render(ui: ReactElement, client?: QueryClient) {
  return renderWithoutClient(ui, { wrapper: queryClientWrapper(client) });
}

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
    mockServicesService.postSelectAccounts = vi.fn();
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

  it('flags a candidate already held by a sibling credential', async () => {
    mockCredentialsService.findCredentialInstagramPages.mockResolvedValue([
      { ...candidateAccounts[0], isAlreadyConnected: true },
      candidateAccounts[1],
    ]);

    render(
      <InstagramAccountSelector
        credentialId={credentialId}
        onConnected={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Genfeed AI')).toBeInTheDocument();
    });

    expect(screen.getByText('Already connected')).toBeInTheDocument();
    // The flag is informational only — a held account stays pickable, since
    // choosing it is a legitimate deliberate reconnect that merges into the
    // incumbent (see InstagramConnectionResolverService.resolveAuthorizedAccount).
    const heldAccountButton = screen.getByRole('button', {
      name: /Genfeed AI/,
    });
    expect(heldAccountButton).not.toBeDisabled();
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

    mockCredentialsService.findCredentialInstagramPages = vi
      .fn()
      .mockResolvedValue(candidateAccounts);
    fireEvent.click(screen.getByText('Try again'));

    await waitFor(() => {
      expect(screen.getByText('Genfeed AI')).toBeInTheDocument();
    });
  });

  it('reports a load failure through onError and offers retry', async () => {
    const onError = vi.fn();
    mockCredentialsService.findCredentialInstagramPages = vi
      .fn()
      .mockRejectedValue(new Error('network down'));

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

    mockCredentialsService.findCredentialInstagramPages = vi
      .fn()
      .mockResolvedValue(candidateAccounts);
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

    const confirmButton = await screen.findByRole('button', {
      name: 'Connect accounts',
    });
    expect(confirmButton).toBeDisabled();
  });

  it('clears a pick that a refresh no longer lists', async () => {
    mockCredentialsService.findCredentialInstagramPages.mockResolvedValue(
      candidateAccounts,
    );
    const client = createTestQueryClient();
    render(
      <InstagramAccountSelector
        credentialId={credentialId}
        onConnected={vi.fn()}
      />,
      client,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: /Genfeed Studio/ }),
    );
    expect(
      screen.getByRole('button', { name: 'Connect 1 account' }),
    ).toBeEnabled();

    mockCredentialsService.findCredentialInstagramPages.mockResolvedValue([
      candidateAccounts[0],
    ]);
    await act(() => client.invalidateQueries());

    await waitFor(() =>
      expect(screen.queryByText('Genfeed Studio')).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole('button', { name: 'Connect accounts' }),
    ).toBeDisabled();
  });

  it('offers Cancel beside the confirm action when the right account is not listed', async () => {
    mockCredentialsService.findCredentialInstagramPages.mockResolvedValue(
      candidateAccounts,
    );
    const onBack = vi.fn();

    render(
      <InstagramAccountSelector
        credentialId={credentialId}
        onBack={onBack}
        onConnected={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mockServicesService.postSelectAccounts).not.toHaveBeenCalled();
  });

  it('keeps every account reachable in a scrollable list when the operator manages many', async () => {
    mockCredentialsService.findCredentialInstagramPages.mockResolvedValue(
      Array.from({ length: 25 }, (_, index) => ({
        id: `ig-account-${index}`,
        label: `Account ${index}`,
        username: `account${index}`,
      })),
    );

    render(
      <InstagramAccountSelector
        credentialId={credentialId}
        onBack={vi.fn()}
        onConnected={vi.fn()}
      />,
    );

    const last = await screen.findByRole('button', { name: /Account 24/ });
    expect(last.parentElement).toHaveClass('overflow-y-auto');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Connect accounts' }),
    ).toBeVisible();
  });

  it('lets the operator tick several accounts and untick one again', async () => {
    mockCredentialsService.findCredentialInstagramPages.mockResolvedValue(
      candidateAccounts,
    );
    render(
      <InstagramAccountSelector
        credentialId={credentialId}
        onConnected={vi.fn()}
      />,
    );
    const first = await screen.findByRole('button', { name: /Genfeed AI/ });
    const second = screen.getByRole('button', { name: /Genfeed Studio/ });
    expect(first).toHaveAttribute('aria-pressed', 'false');
    expect(second).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(first);
    fireEvent.click(second);
    expect(first).toHaveAttribute('aria-pressed', 'true');
    expect(second).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: 'Connect 2 accounts' }),
    ).toBeEnabled();

    fireEvent.click(first);
    expect(first).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.getByRole('button', { name: 'Connect 1 account' }),
    ).toBeEnabled();
  });

  it('connects every ticked account through the select-account endpoint and shows the first', async () => {
    const onConnected = vi.fn();
    mockCredentialsService.findCredentialInstagramPages.mockResolvedValue(
      candidateAccounts,
    );
    mockServicesService.postSelectAccounts.mockResolvedValue([
      {
        externalAvatar: 'https://cdn.example.com/one.jpg',
        externalName: 'Genfeed AI',
      },
      { externalName: 'Genfeed Studio' },
    ]);

    render(
      <InstagramAccountSelector
        credentialId={credentialId}
        onConnected={onConnected}
      />,
    );

    // Tick in reverse list order: the ids still go out in list order.
    fireEvent.click(
      await screen.findByRole('button', { name: /Genfeed Studio/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: /Genfeed AI/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect 2 accounts' }));

    await waitFor(() => {
      expect(onConnected).toHaveBeenCalledWith({
        avatarUrl: 'https://cdn.example.com/one.jpg',
        name: 'Genfeed AI',
      });
    });
    expect(mockServicesService.postSelectAccounts).toHaveBeenCalledWith(
      credentialId,
      ['ig-account-1', 'ig-account-2'],
    );
  });

  it('says how many accounts connected when only some did, then continues', async () => {
    const onConnected = vi.fn();
    mockCredentialsService.findCredentialInstagramPages.mockResolvedValue(
      candidateAccounts,
    );
    mockServicesService.postSelectAccounts.mockResolvedValue([
      { externalId: 'ig-account-1', externalName: 'Genfeed AI' },
    ]);

    render(
      <InstagramAccountSelector
        credentialId={credentialId}
        onConnected={onConnected}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Genfeed AI/ }));
    fireEvent.click(screen.getByRole('button', { name: /Genfeed Studio/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect 2 accounts' }));

    expect(
      await screen.findByText(
        'Connected 1 of 2 accounts. Not connected: Genfeed Studio. Run connect again to add them.',
      ),
    ).toBeInTheDocument();
    expect(onConnected).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onConnected).toHaveBeenCalledWith({
      avatarUrl: undefined,
      name: 'Genfeed AI',
    });
  });

  it('reports a persist failure through onError and keeps the selection', async () => {
    const onConnected = vi.fn();
    const onError = vi.fn();
    mockCredentialsService.findCredentialInstagramPages.mockResolvedValue(
      candidateAccounts,
    );
    mockServicesService.postSelectAccounts.mockRejectedValue(
      new Error('persist failed'),
    );

    render(
      <InstagramAccountSelector
        credentialId={credentialId}
        onConnected={onConnected}
        onError={onError}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Genfeed AI/ }));
    const confirmButton = screen.getByRole('button', {
      name: 'Connect 1 account',
    });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(
        'Failed to connect these accounts. Please try again.',
      );
    });
    expect(onConnected).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Connect 1 account' }),
    ).toBeEnabled();
  });

  it('lists the cached candidates at once when the picker reopens', async () => {
    mockCredentialsService.findCredentialInstagramPages.mockResolvedValue(
      candidateAccounts,
    );
    const client = createTestQueryClient();
    const first = render(
      <InstagramAccountSelector
        credentialId={credentialId}
        onConnected={vi.fn()}
      />,
      client,
    );
    await screen.findByText('Genfeed AI');
    first.unmount();

    mockCredentialsService.findCredentialInstagramPages.mockReturnValue(
      new Promise(() => {}),
    );
    render(
      <InstagramAccountSelector
        credentialId={credentialId}
        onConnected={vi.fn()}
      />,
      client,
    );

    expect(screen.getByText('Genfeed AI')).toBeInTheDocument();
    expect(screen.getByText('Genfeed Studio')).toBeInTheDocument();
    expect(screen.queryByText('Loading accounts…')).not.toBeInTheDocument();
  });

  it("never lists one credential's cached candidates for another", async () => {
    mockCredentialsService.findCredentialInstagramPages.mockResolvedValue(
      candidateAccounts,
    );
    const client = createTestQueryClient();
    const first = render(
      <InstagramAccountSelector
        credentialId={credentialId}
        onConnected={vi.fn()}
      />,
      client,
    );
    await screen.findByText('Genfeed AI');
    first.unmount();

    mockCredentialsService.findCredentialInstagramPages.mockReturnValue(
      new Promise(() => {}),
    );
    render(
      <InstagramAccountSelector
        credentialId="credential-pending-456"
        onConnected={vi.fn()}
      />,
      client,
    );

    expect(screen.getByText('Loading accounts…')).toBeInTheDocument();
    expect(screen.queryByText('Genfeed AI')).not.toBeInTheDocument();
  });
});

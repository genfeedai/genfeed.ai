import { queryClientWrapper } from '@app-tests/query-client.harness';
import type { QueryClient } from '@tanstack/react-query';
import {
  fireEvent,
  render as renderWithoutClient,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import LinkedInAccountSelector from '@/features/auth/components/modals/brands/linkedin/LinkedInAccountSelector';

const mockServicesService: {
  findLinkedInAccounts: Mock<(...args: unknown[]) => unknown>;
  postSelectAccount: Mock<(...args: unknown[]) => unknown>;
} = vi.hoisted(() => ({
  findLinkedInAccounts: vi.fn(),
  postSelectAccount: vi.fn(),
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
    findLinkedInAccounts(...args: unknown[]) {
      return mockServicesService.findLinkedInAccounts(...args);
    }
    postSelectAccount(...args: unknown[]) {
      return mockServicesService.postSelectAccount(...args);
    }
  },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

function render(ui: ReactElement, client?: QueryClient) {
  return renderWithoutClient(ui, { wrapper: queryClientWrapper(client) });
}

describe('LinkedInAccountSelector', () => {
  const credentialId = 'credential-pending-123';

  const candidateAccounts = [
    {
      id: 'urn:li:organization:5515715',
      kind: 'organization',
      label: 'Acme Studio',
      username: 'acme-studio',
    },
    {
      id: 'member-1',
      kind: 'member',
      label: 'Pat Doe',
    },
  ];

  beforeEach(() => {
    mockServicesService.findLinkedInAccounts = vi.fn();
    mockServicesService.postSelectAccount = vi.fn();
  });

  it('offers the company pages and the personal profile, each labelled by kind', async () => {
    mockServicesService.findLinkedInAccounts.mockResolvedValue(
      candidateAccounts,
    );

    render(
      <LinkedInAccountSelector
        credentialId={credentialId}
        onConnected={vi.fn()}
      />,
    );

    const page = await screen.findByRole('radio', { name: /Acme Studio/ });
    const profile = screen.getByRole('radio', { name: /Pat Doe/ });
    expect(page).toHaveTextContent('Company page');
    expect(profile).toHaveTextContent('Personal profile');
    expect(mockServicesService.findLinkedInAccounts).toHaveBeenCalledWith(
      credentialId,
      expect.any(AbortSignal),
    );
  });

  it('selects nothing by default, so the personal profile is never the silent choice', async () => {
    mockServicesService.findLinkedInAccounts.mockResolvedValue(
      candidateAccounts,
    );

    render(
      <LinkedInAccountSelector
        credentialId={credentialId}
        onConnected={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole('radio', { name: /Pat Doe/ }),
    ).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: /Acme Studio/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(
      screen.getByRole('button', { name: 'Post as this account' }),
    ).toBeDisabled();
  });

  it('flags an account another connection of this brand already holds', async () => {
    mockServicesService.findLinkedInAccounts.mockResolvedValue([
      { ...candidateAccounts[1], isAlreadyConnected: true },
    ]);

    render(
      <LinkedInAccountSelector
        credentialId={credentialId}
        onConnected={vi.fn()}
      />,
    );

    expect(await screen.findByText('Already connected')).toBeVisible();
  });

  it('connects the page the member picked and reports it', async () => {
    const onConnected = vi.fn();
    mockServicesService.findLinkedInAccounts.mockResolvedValue(
      candidateAccounts,
    );
    mockServicesService.postSelectAccount.mockResolvedValue({});

    render(
      <LinkedInAccountSelector
        credentialId={credentialId}
        onConnected={onConnected}
      />,
    );

    fireEvent.click(await screen.findByRole('radio', { name: /Acme Studio/ }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Post as this account' }),
    );

    await waitFor(() => {
      expect(mockServicesService.postSelectAccount).toHaveBeenCalledWith(
        credentialId,
        'urn:li:organization:5515715',
      );
    });
    expect(onConnected).toHaveBeenCalledWith({
      avatarUrl: undefined,
      name: 'Acme Studio',
    });
  });

  it('shows an error and stays on the picker when connecting the account fails', async () => {
    const onConnected = vi.fn();
    mockServicesService.findLinkedInAccounts.mockResolvedValue(
      candidateAccounts,
    );
    mockServicesService.postSelectAccount.mockRejectedValue(new Error('boom'));

    render(
      <LinkedInAccountSelector
        credentialId={credentialId}
        onConnected={onConnected}
      />,
    );

    fireEvent.click(await screen.findByRole('radio', { name: /Pat Doe/ }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Post as this account' }),
    );

    expect(
      await screen.findByText(
        'Failed to connect this account. Please try again.',
      ),
    ).toBeVisible();
    expect(onConnected).not.toHaveBeenCalled();
  });

  it('shows a retry when the accounts cannot be loaded', async () => {
    mockServicesService.findLinkedInAccounts.mockRejectedValue(
      new Error('network'),
    );

    render(
      <LinkedInAccountSelector
        credentialId={credentialId}
        onConnected={vi.fn()}
      />,
    );

    expect(
      await screen.findByText(
        'Failed to load your LinkedIn accounts. Please try again.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it('cancels without saving anything', async () => {
    const onBack = vi.fn();
    mockServicesService.findLinkedInAccounts.mockResolvedValue(
      candidateAccounts,
    );

    render(
      <LinkedInAccountSelector
        credentialId={credentialId}
        onBack={onBack}
        onConnected={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mockServicesService.postSelectAccount).not.toHaveBeenCalled();
  });
});

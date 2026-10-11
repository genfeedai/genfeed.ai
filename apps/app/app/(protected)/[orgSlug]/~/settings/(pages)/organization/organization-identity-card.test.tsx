import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { AssetCategory } from '@genfeedai/contracts';
import OrganizationIdentityCard from './organization-identity-card';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

const boundary = vi.hoisted(() => ({
  generateLogo: vi.fn(),
  patch: vi.fn(),
  getService: vi.fn(),
  replace: vi.fn(),
  clearCache: vi.fn(),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => boundary.getService,
}));
vi.mock('@services/organization/organizations.service', () => ({
  OrganizationsService: { getInstance: vi.fn() },
}));
vi.mock(
  '@genfeedai/contexts/providers/protected-bootstrap/client-protected-bootstrap',
  () => ({ clearClientProtectedBootstrapCache: boundary.clearCache }),
);
vi.mock('next/navigation', () => ({
  usePathname: () => '/genfeed/~/settings/general',
  useRouter: () => ({ replace: boundary.replace }),
}));
vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

const openUpload = vi.fn();
const refreshOrganizations = vi.fn(() => Promise.resolve());
const routedOrganization = vi.fn();

vi.mock(
  '@genfeedai/contexts/user/organization-context/organization-context',
  () => ({ useRoutedOrganization: () => routedOrganization() }),
);

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useUploadModal: () => ({ openUpload }),
}));

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span data-alt={alt} data-src={src} data-testid="org-logo" />
  ),
}));

function commitEdit(label: string, value: string) {
  fireEvent.click(screen.getByRole('button', { name: label }));
  const input = screen.getByRole('textbox', { name: label });
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

describe('OrganizationIdentityCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boundary.getService.mockResolvedValue({
      generateLogo: boundary.generateLogo,
      patch: boundary.patch,
    });
    boundary.generateLogo.mockResolvedValue(undefined);
    boundary.patch.mockResolvedValue({ label: 'New name', slug: 'genfeed' });
    refreshOrganizations.mockResolvedValue(undefined);
    routedOrganization.mockReturnValue({
      organizations: [
        {
          brand: null,
          id: 'org-1',
          isActive: true,
          isOwner: true,
          label: 'Genfeed.ai',
          logoUrl: null,
          slug: 'genfeed',
        },
      ],
      refreshOrganizations,
    });
  });

  it('shows the organization name and handle with an initial when no logo is set', () => {
    render(<OrganizationIdentityCard organizationId="org-1" />);

    expect(screen.getByText('Genfeed.ai')).toBeInTheDocument();
    expect(screen.getByText('@genfeed')).toBeInTheDocument();
    expect(screen.getByText('G')).toBeInTheDocument();
    expect(screen.queryByTestId('org-logo')).not.toBeInTheDocument();
    expect(screen.queryByText('org-1')).not.toBeInTheDocument();
  });

  it('renders the uploaded logo', () => {
    routedOrganization.mockReturnValue({
      organizations: [
        {
          brand: null,
          id: 'org-1',
          isActive: true,
          isOwner: true,
          label: 'Genfeed.ai',
          logoUrl: 'https://cdn.test/logos/a1',
          slug: 'genfeed',
        },
      ],
      refreshOrganizations,
    });

    render(<OrganizationIdentityCard organizationId="org-1" />);

    expect(screen.getByTestId('org-logo')).toHaveAttribute(
      'data-src',
      'https://cdn.test/logos/a1',
    );
  });

  it('uploads an organization-parented logo and refreshes the switcher list', () => {
    render(<OrganizationIdentityCard organizationId="org-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Upload logo' }));

    expect(openUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        category: AssetCategory.LOGO,
        parentId: 'org-1',
        parentModel: 'Organization',
      }),
    );
    const [{ onComplete }] = openUpload.mock.calls[0] as [
      { onComplete: () => void },
    ];
    onComplete();
    expect(refreshOrganizations).toHaveBeenCalledOnce();
  });

  it('generates a logo for the organization and refreshes the switcher list', async () => {
    render(<OrganizationIdentityCard organizationId="org-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Generate logo' }));

    await waitFor(() =>
      expect(boundary.generateLogo).toHaveBeenCalledExactlyOnceWith('org-1'),
    );
    await waitFor(() => expect(refreshOrganizations).toHaveBeenCalledOnce());
  });

  it('shows the server message when logo generation fails', async () => {
    boundary.generateLogo.mockRejectedValue({
      errors: [{ detail: 'No credits left.' }],
    });
    render(<OrganizationIdentityCard organizationId="org-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Generate logo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No credits left.',
    );
    expect(refreshOrganizations).not.toHaveBeenCalled();
  });

  it('saves a trimmed name on commit and refreshes the switcher', async () => {
    render(<OrganizationIdentityCard organizationId="org-1" />);
    commitEdit('Edit organization name', ' New name ');
    await screen.findByRole('status');
    expect(boundary.patch).toHaveBeenCalledExactlyOnceWith('org-1', {
      label: 'New name',
      slug: 'genfeed',
    });
    expect(refreshOrganizations).toHaveBeenCalledOnce();
    expect(boundary.clearCache).toHaveBeenCalledOnce();
    expect(boundary.replace).not.toHaveBeenCalled();
  });

  it('navigates to the saved handle on the same settings surface', async () => {
    boundary.patch.mockResolvedValue({
      label: 'Genfeed.ai',
      slug: 'new-handle',
    });
    render(<OrganizationIdentityCard organizationId="org-1" />);
    commitEdit('Edit organization handle', '@New-Handle');
    await waitFor(() =>
      expect(boundary.replace).toHaveBeenCalledWith(
        '/new-handle/~/settings/general',
      ),
    );
    expect(boundary.patch).toHaveBeenCalledWith('org-1', {
      label: 'Genfeed.ai',
      slug: 'new-handle',
    });
    expect(refreshOrganizations).not.toHaveBeenCalled();
  });

  it('shows the server rejection for a taken handle and keeps the old one', async () => {
    boundary.patch.mockRejectedValue({
      errors: [{ detail: 'This handle is already taken.' }],
    });
    render(<OrganizationIdentityCard organizationId="org-1" />);
    commitEdit('Edit organization handle', 'taken-handle');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This handle is already taken.',
    );
    expect(screen.getByText('@genfeed')).toBeInTheDocument();
    expect(boundary.replace).not.toHaveBeenCalled();
    expect(refreshOrganizations).not.toHaveBeenCalled();
    expect(boundary.clearCache).not.toHaveBeenCalled();
  });

  it.each(['a', 'a'.repeat(49), 'with space', '-leading', 'trailing-'])(
    'rejects an invalid handle %s before sending a request',
    async (slug) => {
      render(<OrganizationIdentityCard organizationId="org-1" />);
      commitEdit('Edit organization handle', slug);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        /lowercase letters, numbers or hyphens/i,
      );
      expect(boundary.patch).not.toHaveBeenCalled();
    },
  );

  it('keeps identity read-only for a non-owner', () => {
    const context = routedOrganization();
    routedOrganization.mockReturnValue({
      ...context,
      organizations: context.organizations.map((org: { isOwner: boolean }) => ({
        ...org,
        isOwner: false,
      })),
    });
    render(<OrganizationIdentityCard organizationId="org-1" />);
    expect(
      screen.getByRole('button', { name: 'Edit organization name' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Edit organization handle' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Generate logo' }),
    ).toBeDisabled();
  });

  it('does not report an accepted patch as failed if refreshing the switcher fails', async () => {
    refreshOrganizations.mockRejectedValueOnce(new Error('Offline'));
    render(<OrganizationIdentityCard organizationId="org-1" />);
    commitEdit('Edit organization name', 'New name');
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Organization saved. Reload',
      ),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not write after the organization changes while obtaining authentication', async () => {
    let resolveService!: (value: { patch: typeof boundary.patch }) => void;
    boundary.getService.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveService = resolve;
        }),
    );
    const { rerender } = render(
      <OrganizationIdentityCard organizationId="org-1" />,
    );
    commitEdit('Edit organization handle', 'new-handle');
    routedOrganization.mockReturnValue({
      organizations: [
        { id: 'org-2', label: 'Other org', slug: 'other', isOwner: true },
      ],
      refreshOrganizations,
    });
    rerender(<OrganizationIdentityCard organizationId="org-2" />);
    await act(async () => resolveService({ patch: boundary.patch }));
    expect(boundary.patch).not.toHaveBeenCalled();
    expect(boundary.replace).not.toHaveBeenCalled();
    expect(screen.getByText('@other')).toBeInTheDocument();
  });

  it('does not navigate away from a new organization when an earlier save completes', async () => {
    let resolvePatch!: (value: { label: string; slug: string }) => void;
    boundary.patch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePatch = resolve;
        }),
    );
    const { rerender } = render(
      <OrganizationIdentityCard organizationId="org-1" />,
    );
    commitEdit('Edit organization handle', 'new-handle');
    await waitFor(() => expect(boundary.patch).toHaveBeenCalledOnce());
    routedOrganization.mockReturnValue({
      organizations: [
        { id: 'org-2', label: 'Other org', slug: 'other', isOwner: true },
      ],
      refreshOrganizations,
    });
    rerender(<OrganizationIdentityCard organizationId="org-2" />);
    await act(async () =>
      resolvePatch({ label: 'Genfeed.ai', slug: 'new-handle' }),
    );
    expect(boundary.replace).not.toHaveBeenCalled();
    expect(refreshOrganizations).not.toHaveBeenCalled();
    expect(screen.getByText('@other')).toBeInTheDocument();
  });
});

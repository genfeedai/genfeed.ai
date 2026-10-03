import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { AssetCategory } from '@genfeedai/contracts';
import OrganizationIdentityCard from './organization-identity-card';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

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

describe('OrganizationIdentityCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routedOrganization.mockReturnValue({
      organizations: [
        {
          brand: null,
          id: 'org-1',
          isActive: true,
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
    expect(
      screen.getByRole('button', { name: /replace logo/i }),
    ).toBeInTheDocument();
  });

  it('uploads an organization-parented logo and refreshes the switcher list', () => {
    render(<OrganizationIdentityCard organizationId="org-1" />);

    fireEvent.click(screen.getByRole('button', { name: /upload logo/i }));

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
});

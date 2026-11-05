import { CredentialPlatform } from '@genfeedai/contracts';
import type { BrandDetailSocialConnection } from '@props/pages/brand-detail.props';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BrandDetailConnectedAccountsSection from '@/features/brands/components/sidebar/BrandDetailConnectedAccountsSection';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

function makeConnection(
  overrides: Partial<BrandDetailSocialConnection> = {},
): BrandDetailSocialConnection {
  return {
    credentialId: 'cred-1',
    externalId: 'ext-1',
    handle: 'acme',
    isConnected: true,
    platform: CredentialPlatform.INSTAGRAM,
    ...overrides,
  };
}

describe('BrandDetailConnectedAccountsSection', () => {
  it('shows the title and Manage above the card and an empty state without accounts', () => {
    render(
      <BrandDetailConnectedAccountsSection
        connections={[]}
        manageHref="/org/brand/settings/accounts"
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Connected accounts' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage' })).toHaveAttribute(
      'href',
      '/org/brand/settings/accounts',
    );
    expect(screen.getByText('No accounts connected yet.')).toBeInTheDocument();
  });

  it('lists each account with its status', () => {
    render(
      <BrandDetailConnectedAccountsSection
        connections={[
          makeConnection({ credentialId: 'cred-1', handle: 'acme' }),
          makeConnection({
            credentialId: 'cred-2',
            externalId: 'ext-2',
            handle: 'acme_x',
            isConnected: false,
            platform: CredentialPlatform.TWITTER,
          }),
        ]}
        manageHref="/settings/accounts"
      />,
    );

    expect(screen.getByText('acme')).toBeInTheDocument();
    expect(screen.getByText('acme_x')).toBeInTheDocument();
    expect(screen.getAllByText('Connected')).toHaveLength(1);
    expect(screen.getAllByText('Needs reconnect')).toHaveLength(1);
    expect(
      screen.queryByText('No accounts connected yet.'),
    ).not.toBeInTheDocument();
  });
});

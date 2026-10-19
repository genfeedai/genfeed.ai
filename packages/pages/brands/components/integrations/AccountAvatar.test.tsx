import { CredentialPlatform } from '@genfeedai/contracts';
import type { BrandDetailSocialConnection } from '@genfeedai/props/pages/brand-detail.props';
import AccountAvatar from '@pages/brands/components/integrations/AccountAvatar';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

function buildConnection(
  overrides: Partial<BrandDetailSocialConnection> = {},
): BrandDetailSocialConnection {
  return {
    credentialId: 'cred-1',
    externalId: 'ext-1',
    isConnected: true,
    name: 'shipshit.dev',
    platform: CredentialPlatform.GOOGLE_ADS,
    ...overrides,
  };
}

describe('AccountAvatar', () => {
  it('shows the Google Ads logo instead of initials for an ad account', () => {
    const { container } = render(
      <AccountAvatar connection={buildConnection()} />,
    );

    expect(screen.queryByText('S')).not.toBeInTheDocument();
    expect(container.querySelector('svg rect[fill="#FBBC04"]')).not.toBeNull();
  });

  it('keeps initials and the platform badge for a social account without an avatar', () => {
    render(
      <AccountAvatar
        connection={buildConnection({
          name: 'Genfeed AI',
          platform: CredentialPlatform.INSTAGRAM,
        })}
      />,
    );

    expect(screen.getByText('GA')).toBeInTheDocument();
    expect(screen.getByText('Instagram')).toBeInTheDocument();
  });
});

import { CredentialPlatform } from '@genfeedai/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReleaseRailAccounts from '@/features/posts/rail/release-rail-accounts';

// Fake account-health API: brand id -> accounts, plus a log of the brands
// whose health was requested.
const api = vi.hoisted(() => ({
  accounts: [] as Record<string, unknown>[],
  requestedBrands: [] as string[],
}));
const getToken = async () => 'token-123';

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: vi.fn(async (getTokenFn: () => Promise<string>) =>
    getTokenFn(),
  ),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken }),
}));

vi.mock('@services/organization/credentials.service', () => ({
  CredentialsService: {
    getInstance: () => ({
      listBrandAccountHealth: async (brandId: string) => {
        api.requestedBrands.push(brandId);
        return api.accounts;
      },
    }),
  },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

function buildAccount(overrides: Record<string, unknown> = {}) {
  return {
    credentialId: 'credential-1',
    handle: '@brand',
    holdPublishing: false,
    label: 'Brand Account',
    override: { isActive: false },
    platform: CredentialPlatform.INSTAGRAM,
    riskLevel: 'low',
    score: 90,
    signals: {},
    state: 'healthy',
    thresholds: {},
    ...overrides,
  };
}

// The rail as the posts page uses it: it owns the selected credential ids.
function RailHarness({ brandId }: { brandId?: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <ReleaseRailAccounts
      brandId={brandId}
      onToggle={(credentialId) =>
        setSelected((current) =>
          current.includes(credentialId)
            ? current.filter((id) => id !== credentialId)
            : [...current, credentialId],
        )
      }
      selectedCredentialIds={selected}
    />
  );
}

describe('ReleaseRailAccounts', () => {
  beforeEach(() => {
    api.accounts = [];
    api.requestedBrands = [];
  });

  it('renders nothing when there are no accounts', async () => {
    const { container } = render(<RailHarness brandId="brand-1" />);
    await waitFor(() => expect(api.requestedBrands).toEqual(['brand-1']));
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one chip per account and toggles selection', async () => {
    api.accounts = [
      buildAccount(),
      buildAccount({ credentialId: 'credential-2', handle: '@other' }),
    ];
    render(<RailHarness brandId="brand-1" />);

    const chip = (await screen.findByText('@brand')).closest('button');
    const other = screen.getByText('@other').closest('button');
    expect(chip).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(chip as HTMLElement);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(other).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(chip as HTMLElement);
    expect(chip).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks an account needing reconnect with a warning tone', async () => {
    api.accounts = [
      buildAccount({
        holdPublishing: true,
        reconnect: {
          credentialId: 'credential-1',
          isAvailable: true,
          reason: 'disconnected',
        },
      }),
    ];
    render(<RailHarness brandId="brand-1" />);

    await screen.findByText('@brand');
    expect(screen.getByText('!')).toBeInTheDocument();
  });

  it('does not fetch account health without a brand in scope', async () => {
    api.accounts = [buildAccount()];
    const { container } = render(<RailHarness />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.requestedBrands).toEqual([]);
    expect(container).toBeEmptyDOMElement();
  });
});

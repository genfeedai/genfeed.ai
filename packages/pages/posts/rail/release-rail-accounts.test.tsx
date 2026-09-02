import { CredentialPlatform } from '@genfeedai/contracts';
import ReleaseRailAccounts from '@pages/posts/rail/release-rail-accounts';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getToken = vi.fn(async () => 'token-123');
const listBrandAccountHealth = vi.fn();

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
    getInstance: () => ({ listBrandAccountHealth }),
  },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../apps/app/tests/next-intl.stub'
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

describe('ReleaseRailAccounts', () => {
  beforeEach(() => {
    listBrandAccountHealth.mockReset();
    getToken.mockClear();
  });

  it('renders nothing when there are no accounts', async () => {
    listBrandAccountHealth.mockResolvedValue([]);
    const { container } = render(
      <ReleaseRailAccounts
        brandId="brand-1"
        onToggle={vi.fn()}
        selectedCredentialIds={[]}
      />,
    );
    await waitFor(() => expect(listBrandAccountHealth).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one chip per account and toggles selection', async () => {
    listBrandAccountHealth.mockResolvedValue([buildAccount()]);
    const onToggle = vi.fn();
    render(
      <ReleaseRailAccounts
        brandId="brand-1"
        onToggle={onToggle}
        selectedCredentialIds={[]}
      />,
    );

    const chip = await screen.findByText('@brand');
    chip.click();
    expect(onToggle).toHaveBeenCalledWith('credential-1');
  });

  it('marks an account needing reconnect with a warning tone', async () => {
    listBrandAccountHealth.mockResolvedValue([
      buildAccount({
        holdPublishing: true,
        reconnect: {
          credentialId: 'credential-1',
          isAvailable: true,
          reason: 'disconnected',
        },
      }),
    ]);
    render(
      <ReleaseRailAccounts
        brandId="brand-1"
        onToggle={vi.fn()}
        selectedCredentialIds={[]}
      />,
    );

    await screen.findByText('@brand');
    expect(screen.getByText('!')).toBeInTheDocument();
  });

  it('does not fetch account health without a brand in scope', async () => {
    render(
      <ReleaseRailAccounts
        brandId={undefined}
        onToggle={vi.fn()}
        selectedCredentialIds={[]}
      />,
    );
    await waitFor(() => expect(listBrandAccountHealth).not.toHaveBeenCalled());
  });
});

import { CredentialPlatform } from '@genfeedai/contracts';
import type { AccountHealthSummary } from '@genfeedai/contracts/interfaces';
import type { BrandDetailSocialConnection } from '@genfeedai/props/pages/brand-detail.props';
import AccountsTable from '@pages/brands/components/integrations/AccountsTable';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
    name: 'Account',
    platform: CredentialPlatform.TWITTER,
    ...overrides,
  };
}

function buildHealth(
  overrides: Partial<AccountHealthSummary> = {},
): AccountHealthSummary {
  return {
    credentialId: 'cred-1',
    holdPublishing: false,
    label: 'Account',
    override: { isActive: false },
    platform: CredentialPlatform.TWITTER,
    riskLevel: 'low',
    score: 80,
    signals: {
      connectedDays: 10,
      profileSignals: 2,
      publishedPosts: 3,
      recentFailures: 0,
    },
    state: 'healthy',
    thresholds: {
      maxRecentFailures: 3,
      minConnectedDays: 1,
      minProfileSignals: 1,
      minPublishedPosts: 1,
    },
    ...overrides,
  };
}

const noop = () => {
  // intentionally empty — unused handlers for tests that don't assert calls
};

function desktop() {
  return within(screen.getByTestId('accounts-table-desktop'));
}

function mobile() {
  return within(screen.getByTestId('accounts-table-mobile'));
}

describe('AccountsTable', () => {
  it('shows the handle only when set, stripping a leading @, and never substitutes the name — in both layouts', () => {
    render(
      <AccountsTable
        accountHealth={[]}
        connectingPlatform={null}
        connections={[
          buildConnection({
            credentialId: 'c1',
            handle: '@genfeed',
            name: 'Genfeed',
          }),
          buildConnection({ credentialId: 'c2', name: 'No Handle' }),
        ]}
        onConnectAccount={noop}
        onDisconnect={noop}
        onPostingTimes={noop}
        onReconnect={noop}
        unavailablePlatforms={new Set()}
      />,
    );

    for (const layout of [desktop(), mobile()]) {
      expect(layout.getByText('@genfeed')).toBeInTheDocument();
      // "No Handle" has no `handle`, so no `@…` line renders for it — the
      // fallback never substitutes the display name.
      expect(layout.queryByText('@No Handle')).not.toBeInTheDocument();
      expect(layout.getByText('No Handle')).toBeInTheDocument();
    }
  });

  it('derives Needs reconnect from a disconnected (not deleted) credential — in both layouts', () => {
    render(
      <AccountsTable
        accountHealth={[]}
        connectingPlatform={null}
        connections={[buildConnection({ isConnected: false })]}
        onConnectAccount={noop}
        onDisconnect={noop}
        onPostingTimes={noop}
        onReconnect={noop}
        unavailablePlatforms={new Set()}
      />,
    );

    expect(desktop().getByText('Needs reconnect')).toBeInTheDocument();
    expect(mobile().getByText('Needs reconnect')).toBeInTheDocument();
  });

  it('derives Needs reconnect from a connected credential missing its externalId identity', () => {
    render(
      <AccountsTable
        accountHealth={[]}
        connectingPlatform={null}
        connections={[buildConnection({ externalId: undefined })]}
        onConnectAccount={noop}
        onDisconnect={noop}
        onPostingTimes={noop}
        onReconnect={noop}
        unavailablePlatforms={new Set()}
      />,
    );

    expect(desktop().getByText('Needs reconnect')).toBeInTheDocument();
    expect(mobile().getByText('Needs reconnect')).toBeInTheDocument();
  });

  it('derives Needs reconnect from an expired access token', () => {
    render(
      <AccountsTable
        accountHealth={[]}
        connectingPlatform={null}
        connections={[
          buildConnection({ accessTokenExpiry: '2020-01-01T00:00:00.000Z' }),
        ]}
        onConnectAccount={noop}
        onDisconnect={noop}
        onPostingTimes={noop}
        onReconnect={noop}
        unavailablePlatforms={new Set()}
      />,
    );

    expect(desktop().getByText('Needs reconnect')).toBeInTheDocument();
    expect(mobile().getByText('Needs reconnect')).toBeInTheDocument();
  });

  it('shows Connected for a fully linked account with no health data', () => {
    render(
      <AccountsTable
        accountHealth={[]}
        connectingPlatform={null}
        connections={[buildConnection()]}
        onConnectAccount={noop}
        onDisconnect={noop}
        onPostingTimes={noop}
        onReconnect={noop}
        unavailablePlatforms={new Set()}
      />,
    );

    expect(desktop().getByText('Connected')).toBeInTheDocument();
    expect(mobile().getByText('Connected')).toBeInTheDocument();
  });

  it('renders the live-fetched accountHealth passed down, not just connection.accountHealth', () => {
    render(
      <AccountsTable
        accountHealth={[
          buildHealth({ credentialId: 'cred-1', state: 'warming' }),
        ]}
        connectingPlatform={null}
        connections={[
          buildConnection({
            credentialId: 'cred-1',
            platform: CredentialPlatform.TWITTER,
          }),
        ]}
        onConnectAccount={noop}
        onDisconnect={noop}
        onPostingTimes={noop}
        onReconnect={noop}
        unavailablePlatforms={new Set()}
      />,
    );

    // Twitter runs the warmup blueprint, so the live health's "warming"
    // state — not "Connected" — must win once it's wired through.
    expect(desktop().getByText('Warming')).toBeInTheDocument();
    expect(desktop().queryByText('Connected')).not.toBeInTheDocument();
  });

  it('sorts rows by platform then name', () => {
    render(
      <AccountsTable
        accountHealth={[]}
        connectingPlatform={null}
        connections={[
          buildConnection({
            credentialId: 'c-twitter',
            name: 'Zed',
            platform: CredentialPlatform.TWITTER,
          }),
          buildConnection({
            credentialId: 'c-tiktok-b',
            name: 'Bravo',
            platform: CredentialPlatform.TIKTOK,
          }),
          buildConnection({
            credentialId: 'c-tiktok-a',
            name: 'Alpha',
            platform: CredentialPlatform.TIKTOK,
          }),
        ]}
        onConnectAccount={noop}
        onDisconnect={noop}
        onPostingTimes={noop}
        onReconnect={noop}
        unavailablePlatforms={new Set()}
      />,
    );

    // `getAllByRole('row')` only matches the desktop `<table>` rows — the
    // mobile stacked list renders plain `<div>`s, so this stays unambiguous
    // even though both layouts are present at once in jsdom.
    const [, ...dataRows] = screen.getAllByRole('row');
    expect(dataRows).toHaveLength(3);
    expect(dataRows[0]?.textContent).toContain('Alpha');
    expect(dataRows[1]?.textContent).toContain('Bravo');
    expect(dataRows[2]?.textContent).toContain('Zed');
  });

  it('derives the header count from status, excluding lapsed and identity-less rows', () => {
    render(
      <AccountsTable
        accountHealth={[]}
        connectingPlatform={null}
        connections={[
          buildConnection({ credentialId: 'live-1' }),
          buildConnection({
            credentialId: 'live-2',
            platform: CredentialPlatform.TIKTOK,
          }),
          buildConnection({ credentialId: 'lapsed-1', isConnected: false }),
          buildConnection({ credentialId: 'no-id-1', externalId: undefined }),
        ]}
        onConnectAccount={noop}
        onDisconnect={noop}
        onPostingTimes={noop}
        onReconnect={noop}
        unavailablePlatforms={new Set()}
      />,
    );

    // 4 rows total, but only 2 are actually connected — the header must
    // say 2, matching what the Status column shows for each row.
    expect(screen.getByText('2 connected accounts')).toBeInTheDocument();
  });

  it('shows an empty state with a Connect account action and no table when there are no accounts', () => {
    const onConnectAccount = vi.fn();
    render(
      <AccountsTable
        accountHealth={[]}
        connectingPlatform={null}
        connections={[]}
        onConnectAccount={onConnectAccount}
        onDisconnect={noop}
        onPostingTimes={noop}
        onReconnect={noop}
        unavailablePlatforms={new Set()}
      />,
    );

    expect(screen.getByText('No accounts connected yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('row')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('accounts-table-desktop'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('accounts-table-mobile'),
    ).not.toBeInTheDocument();

    const connectButtons = screen.getAllByRole('button', {
      name: 'Connect account',
    });
    expect(connectButtons.length).toBeGreaterThan(0);
    fireEvent.click(connectButtons[connectButtons.length - 1]);
    expect(onConnectAccount).toHaveBeenCalledTimes(1);
  });

  it('disables Reconnect for the row whose platform is currently connecting', () => {
    render(
      <AccountsTable
        accountHealth={[]}
        connectingPlatform={CredentialPlatform.TWITTER}
        connections={[
          buildConnection({
            credentialId: 'c-twitter',
            platform: CredentialPlatform.TWITTER,
          }),
        ]}
        onConnectAccount={noop}
        onDisconnect={noop}
        onPostingTimes={noop}
        onReconnect={noop}
        unavailablePlatforms={new Set()}
      />,
    );

    const menuTrigger = desktop().getByRole('button', {
      name: /More actions/,
    });
    fireEvent.pointerDown(menuTrigger);
    fireEvent.click(menuTrigger);
    expect(
      desktop().getByRole('menuitem', { name: 'Reconnect' }),
    ).toHaveAttribute('data-disabled');
  });

  it('leaves Reconnect enabled for a different platform while one connect is in flight', () => {
    render(
      <AccountsTable
        accountHealth={[]}
        connectingPlatform={CredentialPlatform.TWITTER}
        connections={[
          buildConnection({
            credentialId: 'c-tiktok',
            platform: CredentialPlatform.TIKTOK,
          }),
        ]}
        onConnectAccount={noop}
        onDisconnect={noop}
        onPostingTimes={noop}
        onReconnect={noop}
        unavailablePlatforms={new Set()}
      />,
    );

    const menuTrigger = desktop().getByRole('button', {
      name: /More actions/,
    });
    fireEvent.pointerDown(menuTrigger);
    fireEvent.click(menuTrigger);
    expect(
      desktop().getByRole('menuitem', { name: 'Reconnect' }),
    ).not.toHaveAttribute('data-disabled');
  });
});

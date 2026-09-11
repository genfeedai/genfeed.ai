import { CredentialPlatform } from '@genfeedai/contracts';
import type { BrandDetailSocialConnection } from '@genfeedai/props/pages/brand-detail.props';
import AccountsTable from '@pages/brands/components/integrations/AccountsTable';
import { fireEvent, render, screen } from '@testing-library/react';
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

const noop = () => {
  // intentionally empty — unused handlers for tests that don't assert calls
};

describe('AccountsTable', () => {
  it('shows the handle only when set, stripping a leading @, and never substitutes the name', () => {
    render(
      <AccountsTable
        connectedPlatformsCount={2}
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

    expect(screen.getAllByText('@genfeed').length).toBeGreaterThan(0);
    // "No Handle" has no `handle`, so no `@…` line renders for it — the
    // fallback never substitutes the display name.
    expect(screen.queryByText('@No Handle')).not.toBeInTheDocument();
  });

  it('derives Needs reconnect from a disconnected (not deleted) credential', () => {
    render(
      <AccountsTable
        connectedPlatformsCount={0}
        connectingPlatform={null}
        connections={[buildConnection({ isConnected: false })]}
        onConnectAccount={noop}
        onDisconnect={noop}
        onPostingTimes={noop}
        onReconnect={noop}
        unavailablePlatforms={new Set()}
      />,
    );

    expect(screen.getAllByText('Needs reconnect').length).toBeGreaterThan(0);
  });

  it('derives Needs reconnect from a connected credential missing its externalId identity', () => {
    render(
      <AccountsTable
        connectedPlatformsCount={1}
        connectingPlatform={null}
        connections={[buildConnection({ externalId: undefined })]}
        onConnectAccount={noop}
        onDisconnect={noop}
        onPostingTimes={noop}
        onReconnect={noop}
        unavailablePlatforms={new Set()}
      />,
    );

    expect(screen.getAllByText('Needs reconnect').length).toBeGreaterThan(0);
  });

  it('derives Needs reconnect from an expired access token', () => {
    render(
      <AccountsTable
        connectedPlatformsCount={1}
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

    expect(screen.getAllByText('Needs reconnect').length).toBeGreaterThan(0);
  });

  it('shows Connected for a fully linked account with no health data', () => {
    render(
      <AccountsTable
        connectedPlatformsCount={1}
        connectingPlatform={null}
        connections={[buildConnection()]}
        onConnectAccount={noop}
        onDisconnect={noop}
        onPostingTimes={noop}
        onReconnect={noop}
        unavailablePlatforms={new Set()}
      />,
    );

    expect(screen.getAllByText('Connected').length).toBeGreaterThan(0);
  });

  it('sorts rows by platform then name', () => {
    render(
      <AccountsTable
        connectedPlatformsCount={3}
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

  it('shows the connected count in the header', () => {
    render(
      <AccountsTable
        connectedPlatformsCount={3}
        connectingPlatform={null}
        connections={[buildConnection()]}
        onConnectAccount={noop}
        onDisconnect={noop}
        onPostingTimes={noop}
        onReconnect={noop}
        unavailablePlatforms={new Set()}
      />,
    );

    expect(screen.getByText('3 connected accounts')).toBeInTheDocument();
  });

  it('shows an empty state with a Connect account action when there are no accounts', () => {
    const onConnectAccount = vi.fn();
    render(
      <AccountsTable
        connectedPlatformsCount={0}
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
    const connectButtons = screen.getAllByRole('button', {
      name: 'Connect account',
    });
    expect(connectButtons.length).toBeGreaterThan(0);
    fireEvent.click(connectButtons[connectButtons.length - 1]);
    expect(onConnectAccount).toHaveBeenCalledTimes(1);
  });
});

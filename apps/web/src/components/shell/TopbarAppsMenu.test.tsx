// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  connection: {
    connections: [] as Array<{ clientName: string | null }>,
    status: 'unconfigured' as 'configured' | 'loading' | 'unconfigured',
    verifiedAt: null as string | null,
  },
  hasAppsBeyondDashboard: false,
  isDesktopClient: false,
  isMacBrowser: true,
}));

vi.mock('@/components/shell/use-available-rail-apps', () => ({
  useHasAppsBeyondDashboard: () => state.hasAppsBeyondDashboard,
}));
vi.mock('@/hooks/ui/use-is-mac-browser/use-is-mac-browser', () => ({
  useIsMacBrowser: () => state.isMacBrowser,
}));
vi.mock('@/hooks/ui/use-is-desktop-client/use-is-desktop-client', () => ({
  useIsDesktopClient: () => state.isDesktopClient,
}));
vi.mock('@app/(protected)/home/use-connect-genfeed-status', () => ({
  useConnectGenfeedStatus: () => state.connection,
}));
vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: 'org_1' }),
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ orgSlug: 'acme' }),
}));
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

import TopbarAppsMenu from './TopbarAppsMenu';

function openMenu() {
  render(<TopbarAppsMenu orgSlug="acme" />);
  fireEvent.click(screen.getByRole('button', { name: 'Apps' }));
  return screen.getByTestId('apps-menu');
}

describe('TopbarAppsMenu', () => {
  beforeEach(() => {
    state.connection = {
      connections: [],
      status: 'unconfigured',
      verifiedAt: null,
    };
    state.hasAppsBeyondDashboard = false;
    state.isDesktopClient = false;
    state.isMacBrowser = true;
  });

  it('offers the latest Desktop build, the MCP connector and the CLI on a Mac', () => {
    const menu = openMenu();

    expect(
      within(menu).getByRole('link', { name: 'Download' }),
    ).toHaveAttribute('href', 'https://genfeed.ai/download/mac');
    expect(within(menu).getByRole('link', { name: 'Connect' })).toHaveAttribute(
      'href',
      '/acme/~/connectors/agents',
    );
    expect(
      within(menu).getByRole('button', { name: 'Install' }),
    ).toBeInTheDocument();
  });

  it('leaves the Desktop download out on other systems', () => {
    state.isMacBrowser = false;

    const menu = openMenu();

    expect(
      within(menu).queryByRole('link', { name: 'Download' }),
    ).not.toBeInTheDocument();
    expect(within(menu).getByText('MCP connector')).toBeInTheDocument();
  });

  it('leaves the Desktop download out inside Desktop', () => {
    state.isDesktopClient = true;

    const menu = openMenu();

    expect(
      within(menu).queryByRole('link', { name: 'Download' }),
    ).not.toBeInTheDocument();
  });

  it('shows the connector as connected with the agent and a Manage action', () => {
    state.connection = {
      connections: [{ clientName: 'Codex' }],
      status: 'configured',
      verifiedAt: '2026-11-24T10:00:00.000Z',
    };

    const menu = openMenu();

    expect(within(menu).getByText('Connected')).toBeInTheDocument();
    expect(within(menu).getByText(/Codex/)).toBeInTheDocument();
    expect(within(menu).getByRole('link', { name: 'Manage' })).toHaveAttribute(
      'href',
      '/acme/~/connectors/agents',
    );
    expect(
      within(menu).queryByRole('link', { name: 'Connect' }),
    ).not.toBeInTheDocument();
  });

  it('reveals the install command for bun, then npm', () => {
    const menu = openMenu();

    fireEvent.click(within(menu).getByRole('button', { name: 'Install' }));
    expect(
      within(menu).getByText('bun add -g @genfeedai/cli'),
    ).toBeInTheDocument();

    fireEvent.click(within(menu).getByRole('radio', { name: 'npm' }));
    expect(
      within(menu).getByText('npm install -g @genfeedai/cli'),
    ).toBeInTheDocument();
    expect(
      within(menu).getByText(/Then run genfeed login/),
    ).toBeInTheDocument();
  });

  it('ends with a link to the Apps page only when the organization has more apps', () => {
    const withoutApps = openMenu();
    expect(
      within(withoutApps).queryByRole('link', { name: 'Open Apps' }),
    ).not.toBeInTheDocument();
  });

  it('links to the Apps page once an app beyond the dashboard is available', () => {
    state.hasAppsBeyondDashboard = true;

    const menu = openMenu();

    expect(
      within(menu).getByRole('link', { name: 'Open Apps' }),
    ).toHaveAttribute('href', '/acme/~/apps');
  });
});

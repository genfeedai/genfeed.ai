import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@helpers/formatting/cn/cn.util', () => ({
  cn: (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(' '),
}));

vi.mock('@ui/cards/brand-completeness-card/BrandCompletenessCard', () => ({
  default: ({ brand }: { brand: { id?: string } }) => (
    <div data-testid="brand-completeness-card">{brand?.id ?? 'no-brand'}</div>
  ),
}));

vi.mock('@ui/card/Card', () => ({
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@ui/display/platform-badge/PlatformBadge', () => ({
  default: ({ platform }: { platform: string }) => (
    <span data-testid={`platform-badge-${platform}`}>{platform}</span>
  ),
}));

vi.mock('@ui/primitives/avatar', () => ({
  Avatar: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  AvatarFallback: ({ children }: { children?: ReactNode }) => (
    <span>{children}</span>
  ),
  AvatarImage: ({ alt }: { alt?: string }) => <span>{alt}</span>,
}));

import { AgentSetupPanel } from '@genfeedai/agent/components/AgentSetupPanel';
import type { AgentSetupConnection } from '@genfeedai/agent/components/useAgentSetupStatus';

const brand = { id: 'brand-1' } as never;

function renderAgentSetupPanel(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 0,
        retry: false,
      },
    },
  });

  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

describe('AgentSetupPanel', () => {
  it('keeps connect platforms in a dropdown until opened', async () => {
    const user = userEvent.setup();
    renderAgentSetupPanel(
      <AgentSetupPanel
        brand={brand}
        connectedConnections={[]}
        connectedPlatformsCount={0}
        onOAuthConnect={vi.fn()}
      />,
    );

    expect(screen.getByTestId('brand-completeness-card')).toBeInTheDocument();
    expect(screen.getByText('No channels connected yet.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Connect a social channel' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Twitter' }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Connect a social channel' }),
    );

    expect(screen.getByRole('button', { name: 'Twitter' })).toBeInTheDocument();
    for (const unsupportedPlatform of [
      'Reddit',
      'Shopify',
      'Mastodon',
      'Snapchat',
      'Pinterest',
      'WordPress',
    ]) {
      expect(screen.queryByText(unsupportedPlatform)).not.toBeInTheDocument();
    }
  });

  it('invokes onOAuthConnect when a platform is chosen from the dropdown', async () => {
    const user = userEvent.setup();
    const onOAuthConnect = vi.fn();
    renderAgentSetupPanel(
      <AgentSetupPanel
        brand={brand}
        connectedConnections={[]}
        connectedPlatformsCount={0}
        onOAuthConnect={onOAuthConnect}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Connect a social channel' }),
    );
    await user.click(screen.getByRole('button', { name: 'Twitter' }));

    expect(onOAuthConnect).toHaveBeenCalledWith('twitter');
  });

  it('lists connected accounts and hides them from the connect dropdown', async () => {
    const user = userEvent.setup();
    const connectedConnections: AgentSetupConnection[] = [
      {
        avatarUrl: 'https://cdn/avatar.png',
        credentialId: 'cred-1',
        handle: '@creator',
        name: 'Creator Studio',
        platform: 'twitter' as never,
      },
    ];

    renderAgentSetupPanel(
      <AgentSetupPanel
        brand={brand}
        connectedConnections={connectedConnections}
        connectedPlatformsCount={1}
        onOAuthConnect={vi.fn()}
      />,
    );

    expect(screen.getByText('Creator Studio')).toBeInTheDocument();
    expect(screen.getByText('@creator')).toBeInTheDocument();
    expect(screen.getByText('Connect more channels')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Connect a social channel' }),
    );

    expect(
      screen.queryByRole('button', { name: 'Twitter' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Instagram' }),
    ).toBeInTheDocument();
  });

  it('hides the connect dropdown when no OAuth handler is provided', () => {
    renderAgentSetupPanel(
      <AgentSetupPanel
        brand={brand}
        connectedConnections={[]}
        connectedPlatformsCount={0}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Connect a social channel' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Twitter')).not.toBeInTheDocument();
    expect(screen.getByText('No channels connected yet.')).toBeInTheDocument();
  });
});

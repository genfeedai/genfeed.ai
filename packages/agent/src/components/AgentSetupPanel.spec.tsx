import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
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

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    isDisabled,
    onClick,
  }: {
    children?: ReactNode;
    isDisabled?: boolean;
    onClick?: () => void;
  }) => (
    <button type="button" disabled={isDisabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

import { AgentSetupPanel } from '@genfeedai/agent/components/AgentSetupPanel';
import type { AgentSetupConnection } from '@genfeedai/agent/components/useAgentSetupStatus';

const brand = { id: 'brand-1' } as never;

describe('AgentSetupPanel', () => {
  it('renders the brand completeness card and connect buttons when nothing is connected', () => {
    render(
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
      screen.getByText('Connect a channel to publish'),
    ).toBeInTheDocument();
    // All 14 offered platforms are available to connect.
    expect(screen.getByText('Twitter')).toBeInTheDocument();
    expect(screen.getByText('Shopify')).toBeInTheDocument();
  });

  it('invokes onOAuthConnect with the platform when a connect button is clicked', () => {
    const onOAuthConnect = vi.fn();
    render(
      <AgentSetupPanel
        brand={brand}
        connectedConnections={[]}
        connectedPlatformsCount={0}
        onOAuthConnect={onOAuthConnect}
      />,
    );

    fireEvent.click(screen.getByText('Twitter'));

    expect(onOAuthConnect).toHaveBeenCalledWith('twitter');
  });

  it('re-enables connect actions when a successful handoff does not navigate', async () => {
    const onOAuthConnect = vi.fn(() => undefined);
    render(
      <AgentSetupPanel
        brand={brand}
        connectedConnections={[]}
        connectedPlatformsCount={0}
        onOAuthConnect={onOAuthConnect}
      />,
    );

    const twitterButton = screen.getByRole('button', { name: 'Twitter' });
    fireEvent.click(twitterButton);

    expect(onOAuthConnect).toHaveBeenCalledWith('twitter');
    await waitFor(() => expect(twitterButton).toBeEnabled());
  });

  it('re-enables connect actions when an async handoff rejects', async () => {
    const onOAuthConnect = vi.fn().mockRejectedValue(new Error('api down'));
    render(
      <AgentSetupPanel
        brand={brand}
        connectedConnections={[]}
        connectedPlatformsCount={0}
        onOAuthConnect={onOAuthConnect}
      />,
    );

    const twitterButton = screen.getByRole('button', { name: 'Twitter' });
    fireEvent.click(twitterButton);

    expect(onOAuthConnect).toHaveBeenCalledWith('twitter');
    await waitFor(() => expect(twitterButton).toBeEnabled());
  });

  it('re-enables connect actions when the handoff throws synchronously', async () => {
    const onOAuthConnect = vi.fn(() => {
      throw new Error('popup blocked');
    });
    render(
      <AgentSetupPanel
        brand={brand}
        connectedConnections={[]}
        connectedPlatformsCount={0}
        onOAuthConnect={onOAuthConnect}
      />,
    );

    const twitterButton = screen.getByRole('button', { name: 'Twitter' });
    fireEvent.click(twitterButton);

    expect(onOAuthConnect).toHaveBeenCalledWith('twitter');
    await waitFor(() => expect(twitterButton).toBeEnabled());
  });

  it('lists connected accounts and hides them from the connect list', () => {
    const connectedConnections: AgentSetupConnection[] = [
      {
        avatarUrl: 'https://cdn/avatar.png',
        credentialId: 'cred-1',
        handle: '@creator',
        name: 'Creator Studio',
        platform: 'twitter' as never,
      },
    ];

    render(
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
    // Twitter is already connected, so it is not offered as a connect button.
    expect(screen.queryByText('Twitter')).not.toBeInTheDocument();
  });

  it('hides the connect list when no OAuth handler is provided', () => {
    render(
      <AgentSetupPanel
        brand={brand}
        connectedConnections={[]}
        connectedPlatformsCount={0}
      />,
    );

    expect(screen.queryByText('Twitter')).not.toBeInTheDocument();
    expect(screen.getByText('No channels connected yet.')).toBeInTheDocument();
  });
});

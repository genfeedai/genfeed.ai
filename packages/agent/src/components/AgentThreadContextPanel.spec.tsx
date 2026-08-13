import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@helpers/formatting/cn/cn.util', () => ({
  cn: (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(' '),
}));

vi.mock('@ui/card/Card', () => ({
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@ui/display/platform-badge/PlatformBadge', () => ({
  default: ({ platform }: { platform: string }) => (
    <span data-testid={`platform-badge-${platform}`}>{platform}</span>
  ),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    activeHref: (path: string) => `/test-org/test-brand${path}`,
    brandSlug: undefined,
    href: (path: string) => `/test-org/test-brand${path}`,
    orgHref: (path: string) => `/test-org/~${path}`,
  }),
}));

vi.mock('next/link', () => ({
  default: function MockLink(props: {
    children?: ReactNode;
    className?: string;
    href: string;
    title?: string;
  }) {
    return (
      <a className={props.className} href={props.href} title={props.title}>
        {props.children}
      </a>
    );
  },
}));

interface StoreState {
  messages: Array<{ id: string }>;
  threads: Array<{
    createdAt?: string;
    id: string;
    lastActivityAt?: string;
    messageCount?: number;
    requestedModel?: string;
    title?: string;
  }>;
}

const storeState: StoreState = {
  messages: [],
  threads: [],
};

vi.mock('@genfeedai/agent/stores/agent-chat.store', () => {
  const useAgentChatStore = Object.assign(
    (selector: (state: StoreState) => unknown) => selector(storeState),
    { getState: () => storeState },
  );

  return { useAgentChatStore };
});

import AgentThreadContextPanel from '@genfeedai/agent/components/AgentThreadContextPanel';
import type { AgentSetupConnection } from '@genfeedai/agent/components/useAgentSetupStatus';
import type { Brand } from '@genfeedai/models/organization/brand.model';

const brand = { id: 'brand-1', label: 'Koro', slug: 'koro' } as Brand;

const connection = {
  credentialId: 'cred-1',
  handle: '@koro',
  name: 'Koro Official',
  platform: 'instagram',
} as AgentSetupConnection;

describe('AgentThreadContextPanel', () => {
  it('names the active brand and how much context it carries', () => {
    render(
      <AgentThreadContextPanel
        brand={brand}
        completenessScore={62}
        connectedConnections={[]}
      />,
    );

    expect(screen.getByText('Koro')).toBeInTheDocument();
    expect(screen.getByText('62%')).toBeInTheDocument();
  });

  it('says what is missing and links to the owning page when no brand is selected', () => {
    // The org-level `/{org}/~/agent/...` route: the setup panel bows out, so
    // this panel is the only thing standing between the rail and a placeholder.
    render(
      <AgentThreadContextPanel
        brand={undefined}
        completenessScore={null}
        connectedConnections={[]}
      />,
    );

    expect(screen.getByText(/No brand selected/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Set up' })).toHaveAttribute(
      'href',
      '/test-org/~/settings/brands',
    );
    expect(screen.getByText(/No channels connected/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Connect' })).toHaveAttribute(
      'href',
      '/test-org/~/settings/social',
    );
  });

  it('lists the channels the conversation can publish to', () => {
    render(
      <AgentThreadContextPanel
        brand={brand}
        completenessScore={100}
        connectedConnections={[connection]}
      />,
    );

    expect(screen.getByTestId('platform-badge-instagram')).toBeInTheDocument();
    expect(screen.getByText('Koro Official')).toBeInTheDocument();
    // Brand and Channels both say "Manage" once each is populated — the second
    // one is the channels link, and it has to reach social settings.
    expect(
      screen
        .getAllByRole('link', { name: 'Manage' })
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/test-org/~/settings/brands', '/test-org/~/settings/social']);
  });

  it('describes the thread itself from the store', () => {
    storeState.threads = [
      {
        createdAt: new Date(Date.now() - 120_000).toISOString(),
        id: 'thread-1',
        lastActivityAt: new Date(Date.now() - 30_000).toISOString(),
        messageCount: 7,
        requestedModel: 'claude-sonnet-5',
        title: 'Launch week plan',
      },
    ];

    render(
      <AgentThreadContextPanel
        brand={brand}
        completenessScore={100}
        connectedConnections={[]}
        threadId="thread-1"
      />,
    );

    expect(screen.getByText('Launch week plan')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('claude-sonnet-5')).toBeInTheDocument();
    expect(screen.getByText('2m ago')).toBeInTheDocument();

    storeState.threads = [];
  });

  it('offers every product surface as a scoped destination', () => {
    render(
      <AgentThreadContextPanel
        brand={undefined}
        completenessScore={null}
        connectedConnections={[]}
      />,
    );

    // No brand anywhere — every quick link stays on the org URL rather than
    // inventing a brand segment.
    expect(screen.getByRole('link', { name: 'Create' })).toHaveAttribute(
      'href',
      '/test-org/~/studio',
    );
    expect(screen.getByRole('link', { name: 'Reply' })).toHaveAttribute(
      'href',
      '/test-org/~/messages',
    );
  });
});

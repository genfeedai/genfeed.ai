import { buildMcpChannelPage } from '@data/mcp-channels.data';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import McpChannelContent from './mcp-channel-content';

vi.mock('@web-components/PageLayout', () => ({
  default: ({
    children,
    description,
    heroActions,
    heroVisual,
    title,
  }: {
    children: ReactNode;
    description: string;
    heroActions: ReactNode;
    heroVisual: ReactNode;
    title: string;
  }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      {heroActions}
      {heroVisual}
      {children}
    </div>
  ),
}));

describe('McpChannelContent', () => {
  it('puts the searched phrase in the H1 and uses H2 sections', () => {
    render(<McpChannelContent page={buildMcpChannelPage('instagram')} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Instagram MCP server' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'What your agent can do on Instagram',
      }),
    ).toBeInTheDocument();
  });

  it('links down to every agent-by-channel page for the channel', () => {
    render(<McpChannelContent page={buildMcpChannelPage('tiktok')} />);

    expect(screen.getByRole('link', { name: 'Claude' })).toHaveAttribute(
      'href',
      '/claude/tiktok',
    );
    expect(screen.getByRole('link', { name: 'Codex' })).toHaveAttribute(
      'href',
      '/codex/tiktok',
    );
  });

  it('links to the other five channel pages and not to itself', () => {
    render(<McpChannelContent page={buildMcpChannelPage('linkedin')} />);

    expect(
      screen.getByRole('link', { name: 'YouTube MCP server' }),
    ).toHaveAttribute('href', '/mcp/youtube');
    expect(
      screen.queryByRole('link', { name: 'LinkedIn MCP server' }),
    ).toBeNull();
  });

  it('shows a clip for a video channel and a still for the others', () => {
    const { container, rerender } = render(
      <McpChannelContent page={buildMcpChannelPage('tiktok')} />,
    );
    expect(container.querySelector('video')).not.toBeNull();

    rerender(<McpChannelContent page={buildMcpChannelPage('linkedin')} />);
    expect(container.querySelector('video')).toBeNull();
  });

  it('states the approval default under the limits', () => {
    render(<McpChannelContent page={buildMcpChannelPage('facebook')} />);

    expect(
      screen.getByText(/Nothing goes to Facebook without your approval/),
    ).toBeInTheDocument();
  });
});

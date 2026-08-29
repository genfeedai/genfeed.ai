import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import AgentContent from './agent-content';

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

describe('AgentContent', () => {
  it('positions the page as the three agent surfaces, not the hire-a-team feature', () => {
    render(<AgentContent />);

    expect(screen.getByText('Genfeed Agent')).toBeInTheDocument();
    expect(screen.getByText('Genfeed CLI')).toBeInTheDocument();
    expect(screen.getByText('MCP server')).toBeInTheDocument();
    expect(screen.getByText('Agent skills')).toBeInTheDocument();
  });

  it('documents the real install, auth, and run commands', () => {
    render(<AgentContent />);

    expect(screen.getByText('bun add -g @genfeedai/cli')).toBeInTheDocument();
    expect(screen.getByText('genfeed login')).toBeInTheDocument();
    expect(screen.getByText('genfeed chat')).toBeInTheDocument();
    expect(
      screen.getByText('bunx skills add genfeedai/skills'),
    ).toBeInTheDocument();
  });

  it('gives Claude Code and Codex the hosted MCP endpoint', () => {
    render(<AgentContent />);

    const claudeCommand = screen.getByText(/claude mcp add --transport http/);
    const codexCommand = screen.getByText(/codex mcp add genfeed/);

    expect(claudeCommand).toHaveTextContent('https://mcp.genfeed.ai/mcp');
    expect(codexCommand).toHaveTextContent('https://mcp.genfeed.ai/mcp');
  });

  it('sends both hero actions to the sign-up app and the docs', () => {
    render(<AgentContent />);

    const [heroKeyLink] = screen.getAllByRole('link', {
      name: /get an api key/i,
    });

    expect(heroKeyLink).toHaveAttribute(
      'href',
      'https://app.genfeed.ai/sign-up',
    );
    expect(
      screen.getByRole('link', { name: /read the docs/i }),
    ).toHaveAttribute('href', 'https://docs.genfeed.ai');
  });

  it('tracks hero and closing CTAs under separate page-scoped names', () => {
    const listener = vi.fn();
    window.addEventListener('genfeed:marketing:button-click', listener);
    render(<AgentContent />);

    const [heroKeyLink] = screen.getAllByRole('link', {
      name: /get an api key/i,
    });
    fireEvent.click(heroKeyLink);
    fireEvent.click(screen.getByRole('link', { name: /mcp setup guide/i }));

    expect(listener).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        detail: {
          trackingData: { action: 'create_now' },
          trackingName: 'agent_hero_click',
        },
      }),
    );
    expect(listener).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        detail: {
          trackingData: { action: 'read_mcp_docs' },
          trackingName: 'agent_cta_click',
        },
      }),
    );

    window.removeEventListener('genfeed:marketing:button-click', listener);
  });
});

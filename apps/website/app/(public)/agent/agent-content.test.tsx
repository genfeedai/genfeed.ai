import { agentClients } from '@data/agent-clients.data';
import { AGENT_PROMPTS } from '@data/agent-prompts.data';
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

    expect(
      screen.getByRole('heading', { level: 1, name: 'Genfeed Agent' }),
    ).toBeInTheDocument();
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
    expect(claudeCommand).not.toHaveTextContent('Bearer');
  });

  it('links a setup guide for every agent client, including Meta Muse', () => {
    render(<AgentContent />);

    for (const [name, href] of [
      ['Meta Muse', '/muse'],
      ['Grok Bot', '/grok-bot'],
      ['ChatGPT', '/chatgpt'],
    ]) {
      const hrefs = screen
        .getAllByRole('link', { name: new RegExp(`^${name}`) })
        .map((link) => link.getAttribute('href'));
      expect(hrefs).toContain(href);
    }
  });

  it('leads the hero with the agent connection, then sign-up', () => {
    render(<AgentContent />);

    expect(
      screen.getByRole('link', { name: /connect your agent/i }),
    ).toHaveAttribute('href', '/agent#connect');
    const [heroKeyLink] = screen.getAllByRole('link', {
      name: /start for \$0/i,
    });

    expect(heroKeyLink).toHaveAttribute(
      'href',
      'https://app.genfeed.ai/sign-up',
    );
  });

  it('shows a local application mark on every named setup link', () => {
    const { container } = render(<AgentContent />);

    for (const client of agentClients) {
      const link = container.querySelector(
        `#connect a[href="/${client.slug}"]`,
      );
      const logo = link?.querySelector('img');

      expect(link).toHaveAccessibleName(`${client.name} Setup guide`);
      expect(logo).toHaveAttribute('src', client.logo);
      expect(logo).toHaveAttribute('alt', '');
      expect(logo).toHaveAttribute('width', '32');
    }
  });

  it('uses the shared card radius for setup and prompt cards', () => {
    const { container } = render(<AgentContent />);

    for (const client of agentClients) {
      expect(
        container.querySelector(`#connect a[href="/${client.slug}"]`),
      ).toHaveClass('rounded-card');
    }
    for (const prompt of AGENT_PROMPTS) {
      const link = screen.getByRole('link', {
        name: new RegExp(prompt.hrefLabel),
      });
      expect(link).toHaveClass('rounded-card');
    }
  });

  it('puts the connect section, which every agent CTA targets, first', () => {
    const { container } = render(<AgentContent />);

    const connect = container.querySelector('#connect');
    const asks = screen.getByRole('heading', {
      level: 2,
      name: /what people ask it for/i,
    });

    expect(connect).not.toBeNull();
    expect(
      connect?.compareDocumentPosition(asks) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('tracks hero and closing CTAs under separate page-scoped names', () => {
    const listener = vi.fn();
    window.addEventListener('genfeed:marketing:button-click', listener);
    render(<AgentContent />);

    const [heroKeyLink] = screen.getAllByRole('link', {
      name: /start for \$0/i,
    });
    fireEvent.click(heroKeyLink);
    fireEvent.click(screen.getByRole('link', { name: /mcp setup guide/i }));

    expect(listener).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        detail: {
          trackingData: { action: 'start_signup' },
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

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

  it('leads the hero with the agent connection, then sign-up', () => {
    render(<AgentContent />);

    expect(
      screen.getAllByRole('button', { name: /connect your agent/i })[0],
    ).toHaveAttribute('aria-haspopup', 'dialog');
    const [heroKeyLink] = screen.getAllByRole('link', {
      name: /start for \$0/i,
    });

    expect(heroKeyLink).toHaveAttribute(
      'href',
      'https://app.genfeed.ai/sign-up',
    );
  });

  it('uses the shared card radius for prompt cards', () => {
    render(<AgentContent />);

    for (const prompt of AGENT_PROMPTS) {
      const link = screen.getByRole('link', {
        name: new RegExp(prompt.hrefLabel),
      });
      expect(link).toHaveClass('rounded-card');
    }
  });

  it('leads with Genfeed’s examples and capabilities before optional integration details', () => {
    const { container } = render(<AgentContent />);
    const asks = screen.getByRole('heading', {
      name: 'What people ask it for',
    });
    const capabilities = screen.getByRole('heading', {
      name: 'What the agent can do',
    });
    const integrations = screen.getByRole('heading', {
      name: 'Use Genfeed where you already work',
    });

    expect(
      asks.compareDocumentPosition(capabilities) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      capabilities.compareDocumentPosition(integrations) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(container.querySelector('#connect')).toBeNull();
    expect(
      screen.queryByRole('link', { name: /setup guide/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Ask the Genfeed agent for images, videos and posts/),
    ).toBeInTheDocument();
  });

  it('tracks hero and closing CTAs under separate page-scoped names', () => {
    const listener = vi.fn();
    window.addEventListener('genfeed:marketing:button-click', listener);
    render(<AgentContent />);

    const [heroKeyLink] = screen.getAllByRole('link', {
      name: /start for \$0/i,
    });
    fireEvent.click(heroKeyLink);
    fireEvent.click(
      screen
        .getAllByRole('button', { name: /connect your agent/i })
        .slice(-1)[0],
    );

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
          trackingData: { action: 'connect_agent' },
          trackingName: 'agent_cta_click',
        },
      }),
    );

    window.removeEventListener('genfeed:marketing:button-click', listener);
  });
});

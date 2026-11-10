import { render, screen } from '@testing-library/react';
import HomeAgents from '@web-components/home/_agents';
import type { ImgHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: ({
    unoptimized: _unoptimized,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => (
    <span data-src={typeof props.src === 'string' ? props.src : undefined} />
  ),
}));

describe('HomeAgents', () => {
  it('tells visitors to start in their agent and review in the dashboard', () => {
    render(<HomeAgents />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Start in your agent.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Add Genfeed over MCP and work where you already work. The dashboard is where you review drafts, publish and see what worked.',
      ),
    ).toBeInTheDocument();
  });

  it.each([
    ['Claude', '/claude'],
    ['OpenAI', '/chatgpt'],
    ['Cursor', '/cursor'],
    ['Gemini CLI', '/gemini'],
    ['OpenClaw', '/openclaw'],
    ['Hermes', '/hermes'],
    ['Grok', '/grok'],
    ['Meta Muse', '/muse'],
  ])('links %s to its install page at %s', (name, href) => {
    render(<HomeAgents />);

    expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
  });

  it('lists the agent families under the section heading', () => {
    render(<HomeAgents />);

    expect(screen.getByRole('list')).toHaveAttribute(
      'aria-labelledby',
      'home-agents-heading',
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(8);
  });
});

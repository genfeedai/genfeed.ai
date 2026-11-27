import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import DevelopersContent from './developers-content';

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

describe('DevelopersContent', () => {
  it('has one H1 and H2 sections, not only H3s', () => {
    render(<DevelopersContent />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const sections = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);

    expect(sections).toEqual(
      expect.arrayContaining([
        'What you can call',
        'Limits, stated plainly',
        'What it costs a builder',
      ]),
    );
  });

  it('opens the quick start on MCP and offers the CLI and REST tabs', () => {
    render(<DevelopersContent />);

    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);

    expect(tabs).toEqual(['MCP', 'CLI', 'REST']);
    expect(screen.getByText(/mcp\.genfeed\.ai\/mcp/)).toBeInTheDocument();
  });

  it('links every group of calls to a page in the docs that exists', () => {
    render(<DevelopersContent />);

    const links = screen
      .getAllByRole('link', { name: 'Read the docs' })
      .map((link) => link.getAttribute('href'));

    expect(links).toHaveLength(9);
    for (const href of links) {
      expect(href).toMatch(
        /^https:\/\/docs\.genfeed\.ai\/api-reference\/(reference|api-keys|cli|mcp|webhooks)$/,
      );
    }
  });

  it('hands people who write no code to /agent instead of listing every client', () => {
    render(<DevelopersContent />);

    expect(
      screen.getByRole('link', { name: 'Use Genfeed from your agent' }),
    ).toHaveAttribute('href', '/agent');
    expect(screen.queryByRole('link', { name: 'Cursor' })).toBeNull();
  });

  it('names the publishing channels and the approval default', () => {
    render(<DevelopersContent />);

    const limits = screen
      .getByRole('heading', { name: 'Limits, stated plainly' })
      .closest('section');

    expect(limits).not.toBeNull();
    expect(
      within(limits as HTMLElement).getByRole('link', { name: 'Instagram' }),
    ).toHaveAttribute('href', '/integrations/instagram');
    expect(
      within(limits as HTMLElement).getByText('Nothing posts without approval'),
    ).toBeInTheDocument();
  });

  it('links the open-source install to the self-hosting guide', () => {
    render(<DevelopersContent />);

    expect(
      screen.getByText('npx @genfeedai/create my-genfeed'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Self-hosting guide/ }),
    ).toHaveAttribute('href', '/self-hosted');
  });
});

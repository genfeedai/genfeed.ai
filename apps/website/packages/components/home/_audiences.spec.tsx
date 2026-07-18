import { render, screen } from '@testing-library/react';
import HomeAudiences from '@web-components/home/_audiences';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apps: {
      app: 'https://app.genfeed.ai',
    },
    mcpConnectHref: 'https://app.genfeed.ai/connect',
  },
}));

describe('HomeAudiences', () => {
  it('renders the section heading', () => {
    render(<HomeAudiences />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /for developers and distribution teams\./i,
      }),
    ).toBeInTheDocument();
  });

  it('splits developer self-serve from the agency demo path', () => {
    render(<HomeAudiences />);

    expect(
      screen.getByRole('heading', {
        level: 3,
        name: /keep your ai client\. add a control plane\./i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: /run every client's creative from one place\./i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /connect mcp/i })).toHaveAttribute(
      'href',
      'https://app.genfeed.ai/connect',
    );
    expect(
      screen.getByRole('link', { name: /explore the mcp server/i }),
    ).toHaveAttribute('href', '/mcp');
    expect(
      screen.getByRole('link', { name: /genfeed for agencies/i }),
    ).toHaveAttribute('href', '/use-cases/agencies');
  });

  it('quotes the Pro launch price, not the standard price', () => {
    render(<HomeAudiences />);

    expect(screen.getByText(/then \$39\/mo pro/i)).toBeInTheDocument();
    expect(screen.queryByText(/then \$49\/mo pro/i)).not.toBeInTheDocument();
  });
});

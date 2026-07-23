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
        name: /for creators and marketing teams\./i,
      }),
    ).toBeInTheDocument();
  });

  it('splits creator self-serve from the agency demo path', () => {
    render(<HomeAudiences />);

    expect(
      screen.getByRole('heading', {
        level: 3,
        name: /everything you publish, in one studio\./i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: /run every client's creative from one place\./i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /start for free/i }),
    ).toHaveAttribute('href', 'https://app.genfeed.ai/sign-up');
    expect(
      screen.getByRole('link', { name: /see how it works/i }),
    ).toHaveAttribute('href', '#how');
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

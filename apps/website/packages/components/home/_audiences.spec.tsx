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
  },
}));

describe('HomeAudiences', () => {
  it('renders the section heading', () => {
    render(<HomeAudiences />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /for creators and agencies\./i,
      }),
    ).toBeInTheDocument();
  });

  it('splits creators (self-serve) from agencies (demo)', () => {
    render(<HomeAudiences />);

    expect(
      screen.getByRole('heading', {
        level: 3,
        name: /post daily without a team\./i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: /run every client's creative from one place\./i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create now/i })).toHaveAttribute(
      'href',
      expect.stringContaining('plan=payg'),
    );
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

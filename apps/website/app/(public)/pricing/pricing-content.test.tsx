import { render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import PricingContent from './pricing-content';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@web-components/PageLayout', () => ({
  default: ({
    children,
    title,
    description,
  }: {
    children: ReactNode;
    title: string;
    description: string;
  }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </div>
  ),
}));

vi.mock('@hooks/ui/use-marketing-entrance', () => ({
  useMarketingEntrance: () => ({ current: null }),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apps: { app: 'https://app.genfeed.test' },
  },
}));

describe('PricingContent launch pricing', () => {
  it('renders the struck-through original price next to the launch price on the Hosted card', () => {
    render(<PricingContent />);

    const originalPrice = screen.getByText('$49');
    expect(originalPrice).toHaveClass('line-through');
    expect(screen.getByText('$39')).toBeInTheDocument();
    expect(screen.getByText('$39')).not.toHaveClass('line-through');
  });

  it('renders the launch note under the Hosted card price', () => {
    render(<PricingContent />);

    expect(
      screen.getByText(/launch pricing — first 12 months, then \$49\/month/i),
    ).toBeInTheDocument();
  });

  it('does not strike through prices on plans without launch pricing', () => {
    render(<PricingContent />);

    // Cloud Teams has no launchPrice — its price renders un-struck.
    expect(screen.getByText('$499')).not.toHaveClass('line-through');
  });
});

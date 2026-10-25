import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import CreditsMenuSection from './CreditsMenuSection';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const defaultProps = {
  balance: 0,
  billingHref: '/test-org/~/settings/credits',
  extraBalance: 0,
  fullBalance: '0',
  planLimit: 0,
  planUsagePercent: 0,
  planUsed: 0,
  visibleProviderSegments: [],
};

describe('CreditsMenuSection', () => {
  it('highlights an empty balance and keeps Buy credits reachable', () => {
    render(<CreditsMenuSection {...defaultProps} />);

    expect(screen.getByTestId('account-credits')).toHaveAttribute(
      'data-severity',
      'critical',
    );
    expect(
      screen.getByText('You are out of credits. Buy more to keep generating.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('account-credits-buy')).toHaveAttribute(
      'href',
      '/test-org/~/settings/credits',
    );
    expect(screen.getByText('Buy credits')).toBeInTheDocument();
  });

  it('shows plan usage and extra credits for a healthy balance', () => {
    render(
      <CreditsMenuSection
        {...defaultProps}
        balance={10_171}
        extraBalance={5_900}
        fullBalance="10,171"
        planLimit={5_900}
        planUsagePercent={27.6}
        planUsed={1_629}
      />,
    );

    expect(screen.getByTestId('account-credits')).toHaveAttribute(
      'data-severity',
      'healthy',
    );
    expect(screen.getByText('10,171')).toBeInTheDocument();
    expect(screen.getByText(/plan used/)).toHaveTextContent(
      '1.6k / 5.9k plan used · 5.9k extra',
    );
    expect(
      screen.queryByText('Running low. Top up before generations stall.'),
    ).not.toBeInTheDocument();
  });

  it('warns when the balance runs low', () => {
    render(
      <CreditsMenuSection
        {...defaultProps}
        balance={42}
        fullBalance="42"
        planLimit={100}
        planUsagePercent={58}
        planUsed={58}
      />,
    );

    expect(screen.getByTestId('account-credits')).toHaveAttribute(
      'data-severity',
      'warning',
    );
    expect(
      screen.getByText('Running low. Top up before generations stall.'),
    ).toBeInTheDocument();
  });

  it('stays neutral while loading instead of flashing critical zero', () => {
    render(
      <CreditsMenuSection {...defaultProps} balance={null} fullBalance="—" isLoading />,
    );

    expect(screen.getByTestId('account-credits')).toHaveAttribute(
      'data-severity',
      'loading',
    );
    expect(screen.getByText('Loading balance…')).toBeInTheDocument();
    expect(screen.queryByText(/out of credits/)).not.toBeInTheDocument();
  });

  it('keeps an unavailable balance neutral and hides plan usage', () => {
    render(
      <CreditsMenuSection
        {...defaultProps}
        balance={null}
        fullBalance="—"
        planLimit={100}
      />,
    );

    expect(screen.getByTestId('account-credits')).toHaveAttribute(
      'data-severity',
      'unavailable',
    );
    expect(screen.getByText('Balance unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/plan used/)).not.toBeInTheDocument();
  });
});

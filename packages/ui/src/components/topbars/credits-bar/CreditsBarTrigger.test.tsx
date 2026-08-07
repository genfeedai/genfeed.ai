import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import CreditsBarTrigger from './CreditsBarTrigger';

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
  compactBalance: '0',
  extraBalance: 0,
  fullBalance: '0',
  onRefresh: vi.fn(),
  planBalance: 0,
  planLimit: 0,
  planUsagePercent: 0,
  visibleProviderSegments: [],
};

describe('CreditsBarTrigger', () => {
  it('highlights empty balance in destructive red with buy-credits urgency', async () => {
    const user = userEvent.setup();
    render(<CreditsBarTrigger {...defaultProps} />);

    const trigger = screen.getByTestId('topbar-credits-trigger');
    expect(trigger).toHaveClass('outline-none', 'ring-0');
    expect(trigger).toHaveClass(
      'text-destructive',
      'bg-destructive/15',
      'animate-pulse',
    );
    expect(trigger).toHaveAttribute('data-severity', 'critical');
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('GEN')).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        'Balance empty: 0 GEN. Open wallet to buy credits.',
      ),
    ).toBeInTheDocument();

    await user.click(trigger);

    expect(
      screen.getByText('You are out of credits. Buy more to keep generating.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('topbar-credits-buy')).toBeInTheDocument();
    expect(screen.getByText('Buy credits')).toBeInTheDocument();
  });

  it('marks healthy balances without low affordance noise', () => {
    render(
      <CreditsBarTrigger
        {...defaultProps}
        balance={4200}
        compactBalance="4.2k"
        fullBalance="4,200"
      />,
    );

    const trigger = screen.getByTestId('topbar-credits-trigger');
    expect(trigger).toHaveAttribute('data-severity', 'healthy');
    expect(trigger).toHaveClass('border-0');
    expect(trigger).not.toHaveClass('text-destructive');
    expect(screen.getByText('4.2k')).toBeInTheDocument();
  });

  it('opens a consolidated wallet with Buy credits as the primary CTA', async () => {
    const user = userEvent.setup();
    render(
      <CreditsBarTrigger
        {...defaultProps}
        balance={42}
        compactBalance="42"
        fullBalance="42"
        planLimit={100}
        planBalance={42}
        planUsagePercent={58}
      />,
    );

    await user.click(screen.getByTestId('topbar-credits-trigger'));

    expect(screen.getByTestId('topbar-credits-popover')).toBeInTheDocument();
    const buyCredits = screen.getByTestId('topbar-credits-buy');
    expect(buyCredits).toHaveAttribute('href', '/test-org/~/settings/credits');
    expect(screen.getByText('Buy credits')).toBeInTheDocument();
    expect(
      screen.getByText('Running low. Top up before generations stall.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Top up')).not.toBeInTheDocument();
    expect(screen.queryByText('Billing & usage')).not.toBeInTheDocument();
    expect(screen.queryByText('Refresh')).not.toBeInTheDocument();
  });

  it('refreshes balance silently when the wallet opens', async () => {
    const onRefresh = vi.fn();
    const user = userEvent.setup();
    render(<CreditsBarTrigger {...defaultProps} onRefresh={onRefresh} />);

    await user.click(screen.getByTestId('topbar-credits-trigger'));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});

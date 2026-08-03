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
  billingHref: '/test-org/~/settings/billing',
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
  it('shows compact unit on the topbar trigger without a permanent outline', () => {
    render(<CreditsBarTrigger {...defaultProps} />);

    const trigger = screen.getByTestId('topbar-credits-trigger');
    expect(trigger).toHaveClass('outline-none', 'border-0', 'ring-0');
    expect(trigger).toHaveAttribute('data-severity', 'critical');
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('GEN')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Balance 0 GEN. Open wallet.'),
    ).toBeInTheDocument();
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

    expect(screen.getByTestId('topbar-credits-trigger')).toHaveAttribute(
      'data-severity',
      'healthy',
    );
    expect(screen.getByText('4.2k')).toBeInTheDocument();
  });

  it('opens the shell dropdown with menu actions', async () => {
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
    expect(screen.getByTestId('topbar-credits-top-up')).toHaveAttribute(
      'href',
      '/test-org/~/settings/billing',
    );
    expect(screen.getByTestId('topbar-credits-details')).toHaveAttribute(
      'href',
      '/test-org/~/settings/billing',
    );
    expect(screen.getByText('Top up')).toBeInTheDocument();
    expect(screen.getByText('Billing & usage')).toBeInTheDocument();
    expect(screen.getByText('Refresh')).toBeInTheDocument();
  });

  it('calls onRefresh from the menu', async () => {
    const onRefresh = vi.fn();
    const user = userEvent.setup();
    render(<CreditsBarTrigger {...defaultProps} onRefresh={onRefresh} />);

    await user.click(screen.getByTestId('topbar-credits-trigger'));
    await user.click(screen.getByRole('menuitem', { name: /refresh/i }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});

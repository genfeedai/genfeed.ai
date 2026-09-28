import { render, screen } from '@testing-library/react';
import { Sparkles } from 'lucide-react';

import { describe, expect, it } from 'vitest';
import OverviewLayout from './OverviewLayout';

describe('OverviewLayout', () => {
  const cards = [
    {
      color: 'bg-primary',
      cta: 'Go',
      description: 'Start something new',
      href: '#',
      icon: Sparkles,
      id: 'create',
      label: 'Create',
    },
  ];

  it('should render without crashing', () => {
    const { container } = render(
      <OverviewLayout label="Overview" cards={cards} />,
    );
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByText('Quick Actions')).toBeInTheDocument();
    expect(screen.getByTestId('overview-quick-actions')).toBeInTheDocument();
  });

  it('should hide the actions section when no cards are provided', () => {
    render(<OverviewLayout label="Overview" />);
    expect(screen.queryByText('Quick Actions')).not.toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(
      <OverviewLayout label="Overview" cards={cards} />,
    );
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go' })).toHaveAttribute(
      'href',
      '#',
    );
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <OverviewLayout label="Overview" cards={cards} />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
    // Quick-action cards use the canonical Card surface treatment:
    // rounded-card + shadow-border (monochrome token idiom), not the
    // retired gen-shell-panel/ship-ui shell classes.
    const quickActionCard = container.querySelector('[data-card-index="0"]');
    expect(quickActionCard).toHaveClass('rounded-card');
    expect(quickActionCard).toHaveClass('shadow-border');
    expect(quickActionCard).toHaveClass('bg-card');
  });

  it('lays quick actions on the container ladder without a fixed tile height', () => {
    const { container } = render(
      <OverviewLayout label="Overview" cards={cards} />,
    );

    const grid = screen.getByTestId('overview-quick-actions')
      .firstElementChild as HTMLElement;
    expect(screen.getByTestId('overview-quick-actions')).toHaveClass(
      '@container',
    );
    expect(grid).toHaveClass('@[80rem]:grid-cols-4', 'gap-4');
    expect(grid.className).not.toMatch(/(^|\s)(sm|md|lg|xl|2xl):grid-cols/);
    expect(container.innerHTML).not.toContain('min-h-[220px]');
  });
});

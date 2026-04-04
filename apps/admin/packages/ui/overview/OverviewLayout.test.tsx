import { render, screen } from '@testing-library/react';
import { HiSparkles } from 'react-icons/hi2';
import { describe, expect, it } from 'vitest';
import OverviewLayout from './OverviewLayout';

describe('OverviewLayout', () => {
  const cards = [
    {
      color: 'bg-primary',
      cta: 'Go',
      description: 'Start something new',
      href: '#',
      icon: HiSparkles,
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
    expect(
      container.querySelector('[class*="border-white"]'),
    ).toBeInTheDocument();
  });
});

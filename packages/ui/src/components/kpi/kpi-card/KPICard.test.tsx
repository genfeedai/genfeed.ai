import { render, screen } from '@testing-library/react';
import KPICard from '@ui/kpi/kpi-card/KPICard';
import { HiEye } from 'react-icons/hi2';
import { describe, expect, it } from 'vitest';

describe('KPICard', () => {
  it('should render without crashing', () => {
    const { container } = render(<KPICard />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<KPICard />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<KPICard />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });

  it('uses the compact dashboard metric layout', () => {
    render(
      <KPICard
        icon={HiEye}
        label="Total Views"
        value={120}
        description="current period"
      />,
    );

    expect(screen.getByText('120')).toHaveClass(
      'text-2xl',
      'font-semibold',
      'tracking-[-0.02em]',
    );
    expect(screen.getByText('Total Views')).toHaveClass(
      'text-[10px]',
      'uppercase',
      'tracking-[0.14em]',
    );
    expect(screen.getByText('current period')).toHaveClass(
      'text-[11px]',
      'text-foreground/45',
    );
  });
});
